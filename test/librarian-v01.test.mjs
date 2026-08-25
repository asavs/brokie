import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prepareSourceObservation } from "../packages/catalog/identity-plan.mjs";
import { normalizeCandidateShape, recoverExactEvidenceQuote } from "../packages/catalog/normalize-candidate.mjs";
import { createCatalogStore } from "../packages/catalog/store.mjs";
import { validateCandidateDocument } from "../packages/catalog/validate-candidate.mjs";
import { createCompatibleProvider } from "../packages/librarian/provider.mjs";
import { runLibrarianV01 } from "../packages/librarian/run-v0.1-core.mjs";
import {
  openState,
  recordRevisionReviewDecision,
} from "../packages/maintainer/state.mjs";

const temp = path.join(import.meta.dirname, "tmp", "librarian-v01");
assert.ok(temp.startsWith(path.join(import.meta.dirname, "tmp")));
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "fixtures", "data-contract", "telemetry-dev.json"),
    "utf8",
  ),
);
assert.equal(recoverExactEvidenceQuote("Alpha\n  has   five projects. More text.", "Alpha has five projects."), "Alpha\n  has   five projects.");
assert.equal(recoverExactEvidenceQuote("First exact sentence. Unrelated source text.", "First exact sentence. Invented second sentence."), "First exact sentence.");
const record = {
  source_id: "src_fixture_telemetry",
  source_kind: "free_for_dev_readme",
  source_locator: "README.md:228",
  source_category: "APIs, Data, and ML",
  source_name: "telemetry.dev",
  source_url: "https://telemetry.dev",
  source_platform: "free-for-dev",
  raw_text: fixture.source_text,
};
const catalog = new DatabaseSync(":memory:");
createCatalogStore(catalog);
const state = openState(":memory:");

function candidateFor(observation) {
  const candidate = structuredClone(fixture.candidate);
  candidate.source_snapshot_id = observation.source_snapshot_id;
  candidate.observed_at = observation.observed_at;
  return candidate;
}

function mockProvider(responses) {
  let call = 0;
  return {
    provider: "mock",
    model: "mock/free",
    async complete() {
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      if (response instanceof Error) throw response;
      return {
        content: typeof response === "string" ? response : JSON.stringify(response),
        resolved_model: "mock/resolved-free",
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        reasoning: null,
      };
    },
    calls: () => call,
  };
}

const firstObservation = prepareSourceObservation(record, "2026-08-24T20:00:00Z");
const invalidFirst = candidateFor(firstObservation);
invalidFirst.source_snapshot_id = "srcsnap_wrong_candidate_id";
const firstProvider = mockProvider([invalidFirst, candidateFor(firstObservation)]);
const first = await runLibrarianV01({
  catalog,
  state,
  provider: firstProvider,
  record,
  observation: firstObservation,
  tracePath: path.join(temp, "first.json"),
});
assert.equal(first.status, "review_required");
assert.equal(first.attempts, 2);
assert.equal(firstProvider.calls(), 2);
assert.deepEqual(
  state
    .prepare("SELECT status FROM librarian_attempts WHERE run_id = ? ORDER BY attempt_number")
    .all(first.run_id)
    .map(({ status }) => status),
  ["validation_error", "accepted"],
  "one bounded repair must replace an invalid candidate",
);
assert.equal(
  state.prepare("SELECT status FROM librarian_runs WHERE run_id = ?").get(first.run_id).status,
  "review_required",
);
assert.equal(
  state.prepare("SELECT COUNT(*) AS count FROM revision_review_queue WHERE status = 'open'")
    .get().count,
  1,
);
assert.equal(catalog.prepare("SELECT COUNT(*) AS count FROM source_snapshots").get().count, 1);
assert.equal(
  catalog.prepare("SELECT COUNT(*) AS count FROM current_published_revisions").get().count,
  0,
  "model success must not imply publication",
);
assert.ok(fs.existsSync(path.join(temp, "first.json")));

const secondObservation = prepareSourceObservation(record, "2026-08-25T20:00:00Z");
const second = await runLibrarianV01({
  catalog,
  state,
  provider: mockProvider([candidateFor(secondObservation)]),
  record,
  observation: secondObservation,
  tracePath: path.join(temp, "second.json"),
});
assert.equal(second.status, "review_required");
assert.equal(second.attempts, 1);
assert.equal(second.ingested.product_id, first.ingested.product_id);
assert.equal(
  second.ingested.opportunities.opp_free_plan.opportunity_id,
  first.ingested.opportunities.opp_free_plan.opportunity_id,
  "a stable local opportunity key must reuse stable identity",
);
assert.equal(
  catalog
    .prepare("SELECT supersedes_revision_id FROM product_revisions WHERE product_revision_id = ?")
    .get(second.ingested.product_revision_id).supersedes_revision_id,
  first.ingested.product_revision_id,
);
assert.equal(
  catalog
    .prepare(
      "SELECT supersedes_revision_id FROM opportunity_revisions WHERE opportunity_revision_id = ?",
    )
    .get(second.ingested.opportunities.opp_free_plan.opportunity_revision_id)
    .supersedes_revision_id,
  first.ingested.opportunities.opp_free_plan.opportunity_revision_id,
);

const failedObservation = prepareSourceObservation(record, "2026-08-26T20:00:00Z");
const failed = await runLibrarianV01({
  catalog,
  state,
  provider: mockProvider([{}, {}]),
  record,
  observation: failedObservation,
  tracePath: path.join(temp, "failed.json"),
});
assert.equal(failed.status, "failed");
assert.equal(failed.attempts, 2);
assert.equal(
  catalog.prepare("SELECT COUNT(*) AS count FROM source_snapshots").get().count,
  2,
  "invalid model output must never create a source snapshot or revision",
);
assert.equal(
  state.prepare("SELECT status FROM librarian_runs WHERE run_id = ?").get(failed.run_id).status,
  "failed",
);
const failedTrace = JSON.parse(fs.readFileSync(path.join(temp, "failed.json"), "utf8"));
assert.equal(failedTrace.status, "failed");
assert.equal(failedTrace.attempts.length, 2);

assert.throws(
  () =>
    createCompatibleProvider({
      provider: "openrouter",
      model: "paid/model",
      apiKey: "fixture-key",
    }),
  /refusing non-free OpenRouter model/,
);

const calibration = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      "fixtures",
      "librarian",
      "nemotron-monthly-inference.json",
    ),
    "utf8",
  ),
);
const normalized = normalizeCandidateShape(calibration.candidate);
assert.equal(normalized.candidate.product.description.text, "Hosted model inference API.");
assert.equal(normalized.candidate.product.description.support.basis, "inferred");
assert.equal(normalized.candidate.opportunities[0].effective_period, undefined);
assert.equal(normalized.candidate.opportunities[0].entitlements[0].duration, undefined);
assert.equal(normalized.candidate.opportunities[0].entitlements[0].percentage_value, undefined);
assert.equal(
  normalized.candidate.opportunities[0].entitlements[0].cadence.alignment,
  "unknown",
);
assert.equal(
  normalized.candidate.opportunities[0].availability.support.basis,
  "inferred",
);
assert.ok(normalized.actions.length >= 9, "normalization must remain inspectable");
assert.ok(
  validateCandidateDocument({
    source_text: calibration.source_text,
    candidate: normalized.candidate,
  }).some((error) => error.includes("at least one capability facet")),
  "the retained live calibration candidate must fail need-first completeness",
);

function responseForProvider(model) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        model,
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      };
    },
  };
}

let nvidiaRequest;
const nvidiaProvider = createCompatibleProvider({
  provider: "nvidia",
  model: "nvidia/nemotron-3-nano-30b-a3b",
  apiKey: "fixture-key",
  fetchImpl: async (_url, request) => {
    nvidiaRequest = JSON.parse(request.body);
    return responseForProvider("nvidia/nemotron-3-nano-30b-a3b");
  },
});
await nvidiaProvider.complete([{ role: "user", content: "fixture" }]);
assert.equal(nvidiaRequest.response_format, undefined);
assert.equal(nvidiaRequest.chat_template_kwargs.enable_thinking, false);

let ultraRequest;
const ultraProvider = createCompatibleProvider({
  provider: "nvidia",
  model: "nvidia/nemotron-3-ultra-550b-a55b",
  apiKey: "fixture-key",
  fetchImpl: async (_url, request) => {
    ultraRequest = JSON.parse(request.body);
    return responseForProvider("nvidia/nemotron-3-ultra-550b-a55b");
  },
});
await ultraProvider.complete([{ role: "user", content: "fixture" }]);
assert.equal(ultraRequest.chat_template_kwargs.enable_thinking, false);

let openRouterRequest;
const openRouterProvider = createCompatibleProvider({
  provider: "openrouter",
  model: "openrouter/free",
  apiKey: "fixture-key",
  fetchImpl: async (_url, request) => {
    openRouterRequest = JSON.parse(request.body);
    return responseForProvider("fixture/free-model");
  },
});
await openRouterProvider.complete([{ role: "user", content: "fixture" }]);
assert.deepEqual(openRouterRequest.response_format, { type: "json_object" });

const rejectedReview = recordRevisionReviewDecision(state, first.review_id, {
  decision: "rejected",
  note: "Calibration candidate lacks required need-first facets.",
  decidedAt: "2026-08-24T23:00:00Z",
});
assert.equal(rejectedReview.status, "processed");
assert.equal(rejectedReview.decision, "rejected");
assert.match(rejectedReview.decision_note, /need-first facets/);

catalog.close();
state.close();
console.log(
  JSON.stringify({
    status: "ok",
    bounded_repair: "verified",
    stable_identity: "verified",
    inspectable_failure: "verified",
    deterministic_normalization: "verified",
    provider_profiles: "verified",
    review_decision: "verified",
  }),
);
