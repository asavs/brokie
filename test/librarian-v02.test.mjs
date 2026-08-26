import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prepareSourceObservation } from "../packages/catalog/identity-plan.mjs";
import { createCatalogStore } from "../packages/catalog/store.mjs";
import { parseAndValidateProposalV02 } from "../packages/librarian/proposal-v02.mjs";
import { runLibrarianV02 } from "../packages/librarian/run-v02-core.mjs";
import { openState } from "../packages/maintainer/state.mjs";

const temporary = path.join(import.meta.dirname, "tmp", "librarian-v02");
assert.ok(temporary.startsWith(path.join(import.meta.dirname, "tmp")));
fs.rmSync(temporary, { recursive: true, force: true });
fs.mkdirSync(temporary, { recursive: true });

const listing = "[Example](https://example.test) - Free static site hosting.";
const record = {
  source_kind: "repository",
  source_locator: "scout-packet:test#materials",
  source_name: "Example",
  source_url: "https://example.test",
  source_platform: "example.test",
  raw_text: `--- collection listing ---\n${listing}`,
  scout_material_bundle: { collection: { text: listing }, pages: [] },
};
const observation = prepareSourceObservation(record, "2026-08-26T00:00:00.000Z");
const invalid = {
  description: "Static site hosting service.",
  capability_ids: ["static_site_hosting"],
  offer: { availability: "public", entitlements: [{ kind: "invented_benefit", label: "Free hosting" }] },
};
const valid = {
  description: "Static site hosting service.",
  capability_ids: ["static_site_hosting"],
  offer: {
    availability: "public",
    entitlements: [{ kind: "no_cost_access", label: "Free static site hosting" }],
    boolean_conditions: [],
    audience_conditions: [],
  },
};
const requests = [];
const provider = {
  provider: "mock-quota",
  model: "mock/small",
  async complete(messages) {
    requests.push(messages);
    return {
      content: JSON.stringify(requests.length === 1 ? invalid : valid),
      resolved_model: "mock/small",
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    };
  },
};

const state = openState(path.join(temporary, "state.sqlite"));
const catalog = new DatabaseSync(path.join(temporary, "catalog.sqlite"));
createCatalogStore(catalog);
const tracePath = path.join(temporary, "trace.json");
const result = await runLibrarianV02({ catalog, state, provider, record, observation, tracePath });
assert.equal(result.status, "review_required");
assert.equal(result.attempts, 2);
assert.equal(requests.length, 2);
assert.ok(JSON.stringify(requests[0]).length < 6000);
assert.ok(!JSON.stringify(requests[0]).includes("source_snapshot_id"));
assert.ok(!JSON.stringify(requests[0]).includes("output_schema"));
assert.ok(requests[1].at(-1).content.includes("allowed values"));

const run = state.prepare("SELECT * FROM librarian_runs").get();
assert.equal(run.prompt_version, "librarian-v0.2");
assert.equal(run.input_tokens, 200);
assert.equal(run.output_tokens, 40);
const attempts = state.prepare("SELECT * FROM librarian_attempts ORDER BY attempt_number").all();
assert.equal(attempts[0].status, "validation_error");
assert.deepEqual(JSON.parse(attempts[0].raw_response), invalid);
assert.equal(attempts[1].status, "accepted");
const candidate = JSON.parse(attempts[1].parsed_candidate_json);
assert.deepEqual(candidate.evidence_spans, [{ id: "ev_listing", quote: listing }]);
assert.equal(candidate.product.links[0].role, "source");
assert.equal(candidate.opportunities[0].entitlements[0].cost_scope, "unknown");
assert.equal(candidate.opportunities[0].entitlements[0].support.basis, "inferred");

const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
assert.equal(trace.attempts[0].proposal, null);
assert.deepEqual(JSON.parse(trace.attempts[0].raw_response), invalid);
const downgraded = parseAndValidateProposalV02(JSON.stringify({ description: null, capability_ids: ["invented_capability"], offer: null }));
assert.deepEqual(downgraded.proposal.capability_ids, []);
assert.ok(downgraded.actions.some((action) => action.includes("removed unknown")));
const normalized = parseAndValidateProposalV02(JSON.stringify({
  description: "Hosted model service.",
  capability_ids: ["model_inference"],
  offer: {
    availability: "public",
    entitlements: [
      { kind: "included_usage", label: "5 requests", quantity: { value: 5, normalized_unit: "request" } },
      { kind: "included_usage", label: "up to 20 requests", quantity: { value: 20, comparator: "lte", normalized_unit: "request" } },
    ],
  },
}));
assert.equal(normalized.proposal.offer.entitlements[0].quantity.comparator, "exact");
assert.equal(normalized.proposal.offer.entitlements[1].quantity.comparator, "at_most");
assert.deepEqual(normalized.proposal.offer.boolean_conditions, []);
assert.deepEqual(normalized.proposal.offer.audience_conditions, []);
const magnitude = parseAndValidateProposalV02(JSON.stringify({
  description: null,
  capability_ids: ["generic_service_api"],
  offer: {
    availability: "public",
    entitlements: [{ kind: "included_usage", label: "1M API requests", quantity: { value: 1, source_unit: "million", normalized_unit: "request" } }],
  },
}));
assert.equal(magnitude.proposal.offer.entitlements[0].quantity.value, 1_000_000);
assert.ok(magnitude.actions.some((action) => action.includes("expanded million magnitude")));

catalog.close();
state.close();
console.log(JSON.stringify({ status: "ok", compact_prompt: "verified", deterministic_compilation: "verified", protocol_failure_trace: "verified", bounded_repair: "verified", format_normalization: "verified", unknown_vocabulary_downgrade: "verified" }));
