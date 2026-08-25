import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApi } from "../apps/api/server.mjs";
import { ingestCandidate } from "../packages/catalog/ingest-candidate.mjs";
import { planCandidateIdentity } from "../packages/catalog/identity-plan.mjs";
import { createCatalogStore } from "../packages/catalog/store.mjs";
import { applyRevisionReviewDecision } from "../packages/maintainer/revision-review.mjs";
import { openState } from "../packages/maintainer/state.mjs";

const root = path.resolve(import.meta.dirname, "..");
const temp = path.join(root, "test", "tmp", "api-typed");
assert.ok(temp.startsWith(path.join(root, "test", "tmp")), "unsafe temporary test path");
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });

function fixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "test", "fixtures", "data-contract", `${name}.json`), "utf8"),
  );
}

function observationFor(wrapper, suffix) {
  return {
    source_text: wrapper.source_text,
    source_name: wrapper.candidate.product.source_name,
    source_identity: `fixture:${suffix}`,
    source_snapshot_id: wrapper.candidate.source_snapshot_id,
    observed_at: wrapper.candidate.observed_at,
    source: {
      identity: `fixture:${suffix}`,
      locator: `test/fixtures/data-contract/${suffix}.json`,
      kind: "other",
      platform: "brokie-test",
    },
  };
}

function ingestFixture(db, name) {
  const wrapper = fixture(name);
  const observation = observationFor(wrapper, name);
  const identityPlan = planCandidateIdentity(db, wrapper.candidate, observation);
  return {
    wrapper,
    ingested: ingestCandidate(db, wrapper, identityPlan),
  };
}

const catalogPath = path.join(temp, "catalog-v0.1.sqlite");
const catalog = new DatabaseSync(catalogPath);
createCatalogStore(catalog);

const trusted = ingestFixture(catalog, "telemetry-dev");
const untrusted = ingestFixture(catalog, "reportgpt");
const reviewedAt = "2026-08-24T23:30:00Z";
const statePath = path.join(temp, "brokie-state.sqlite");
const state = openState(statePath);

function queueReview(label, fixtureResult) {
  const runId = `run_api_${label}`;
  const reviewId = `rr_api_${label}`;
  const opportunityRevisionIds = Object.values(fixtureResult.ingested.opportunities).map(
    ({ opportunity_revision_id: revisionId }) => revisionId,
  );
  state.prepare(`
    INSERT INTO librarian_runs (
      run_id, source_snapshot_id, provider, requested_model, prompt_version,
      started_at, finished_at, status, product_revision_id,
      opportunity_revision_ids_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    fixtureResult.wrapper.candidate.source_snapshot_id,
    "fixture",
    "fixture-model",
    "fixture-prompt",
    reviewedAt,
    reviewedAt,
    "review_required",
    fixtureResult.ingested.product_revision_id,
    JSON.stringify(opportunityRevisionIds),
  );
  state.prepare(`
    INSERT INTO revision_review_queue (
      review_id, run_id, product_revision_id, opportunity_revision_ids_json,
      reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    reviewId,
    runId,
    fixtureResult.ingested.product_revision_id,
    JSON.stringify(opportunityRevisionIds),
    `${label} API fixture`,
    reviewedAt,
  );
  return reviewId;
}

const trustedReviewId = queueReview("trusted", trusted);
queueReview("untrusted", untrusted);
const publication = applyRevisionReviewDecision(
  { state, catalog },
  trustedReviewId,
  {
    decision: "accepted",
    note: "Trusted API fixture",
    reviewerId: "api-fixture",
    decidedAt: reviewedAt,
  },
);
assert.equal(publication.review.decision, "accepted");
assert.ok(publication.review_events.every(({ decision }) => decision === "trust"));
const retriedPublication = applyRevisionReviewDecision(
  { state, catalog },
  trustedReviewId,
  {
    decision: "accepted",
    note: "Trusted API fixture",
    reviewerId: "another-retry-process",
    decidedAt: "2026-08-24T23:59:00Z",
  },
);
assert.deepEqual(
  retriedPublication.review_events.map(({ review_event_id: id }) => id),
  publication.review_events.map(({ review_event_id: id }) => id),
  "retry must converge on the original immutable review events",
);
state.close();
catalog.close();

const server = createApi({ catalogPath, statePath });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function get(url) {
  const response = await fetch(`${base}${url}`);
  const body = await response.json();
  return { response, body };
}

try {
  const health = await get("/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.catalog.kind, "typed-v0.1");
  assert.equal(health.body.catalog.contract_version, "0.1.0");
  assert.equal(health.body.catalog.coverage.known_opportunities, 2);
  assert.equal(health.body.catalog.coverage.published_opportunities, 1);

  const coverage = await get("/v1/coverage");
  assert.equal(coverage.body.data.known_opportunities, 2);
  assert.equal(coverage.body.data.published_opportunities, 1);

  const capabilities = await get("/v1/capabilities");
  assert.ok(capabilities.body.data.length > 0);
  const capability = capabilities.body.data[0];
  assert.ok(capability.id && capability.label && capability.count === 1);

  const search = await get(
    `/v1/opportunities?q=telemetry&capability=${encodeURIComponent(capability.id)}`,
  );
  assert.equal(search.response.status, 200);
  assert.equal(search.body.count, 1);
  const result = search.body.data[0];
  assert.equal(result.type, "opportunity");
  assert.equal(result.coverage.state, "published");
  assert.ok(result.product.id.startsWith("prod_"));
  assert.ok(result.product.revision_id.startsWith("pr_"));
  assert.ok(result.opportunity.revision_id.startsWith("or_"));
  assert.ok(result.sources.length >= 1);
  assert.ok(result.evidence.length >= 1);
  assert.equal("full_text" in result.sources[0], false, "API must return compact source metadata");

  const exact = await get(`/v1/opportunities/${encodeURIComponent(result.id)}`);
  assert.equal(exact.response.status, 200);
  assert.equal(exact.body.data.id, result.id);

  const evidence = result.evidence[0];
  const evidenceResponse = await get(
    `/v1/evidence/${encodeURIComponent(evidence.source_snapshot_id)}/${encodeURIComponent(evidence.evidence_id)}`,
  );
  assert.equal(evidenceResponse.response.status, 200);
  assert.equal(evidenceResponse.body.data.quote, evidence.quote);

  const unpublishedOpportunityId = Object.values(untrusted.ingested.opportunities)[0].opportunity_id;
  const unpublished = await get(
    `/v1/opportunities/${encodeURIComponent(unpublishedOpportunityId)}`,
  );
  assert.equal(unpublished.response.status, 404, "unreviewed revisions must not be served");
  const unpublishedEvidence = untrusted.wrapper.candidate.evidence_spans[0];
  const hiddenEvidence = await get(
    `/v1/evidence/${encodeURIComponent(untrusted.wrapper.candidate.source_snapshot_id)}/${encodeURIComponent(unpublishedEvidence.id)}`,
  );
  assert.equal(hiddenEvidence.response.status, 404, "unpublished evidence must not be served");

  const reviews = await get("/v1/reviews?status=open");
  assert.equal(reviews.body.count, 1);
  assert.equal(reviews.body.data[0].review_id, "rr_api_untrusted");

  const invalid = await get(`/v1/opportunities?q=${"x".repeat(513)}`);
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error, "invalid_request");

  const unknownParameter = await get("/v1/opportunities?surprise=true");
  assert.equal(unknownParameter.response.status, 400);
  const invalidLimit = await get("/v1/opportunities?limit=101");
  assert.equal(invalidLimit.response.status, 400);
  const invalidReviewStatus = await get("/v1/reviews?status=accepted");
  assert.equal(invalidReviewStatus.response.status, 400);

  const openapi = await get("/openapi.json");
  assert.equal(openapi.response.status, 200);
  assert.equal(openapi.body.info.version, "0.1.1");
  assert.ok(openapi.body.paths["/v1/opportunities"]);

  const writeAttempt = await fetch(`${base}/v1/opportunities`, { method: "POST" });
  assert.equal(writeAttempt.status, 405);
  assert.equal(server.requestTimeout, 15_000);
  assert.equal(server.headersTimeout, 10_000);
  assert.equal(server.maxHeadersCount, 64);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log(
  JSON.stringify({
    status: "ok",
    typed_api: "verified",
    publication_gate: "verified",
    coverage_states: "verified",
    evidence_scope: "verified",
  }),
);
