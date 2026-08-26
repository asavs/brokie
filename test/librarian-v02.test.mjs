import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prepareSourceObservation } from "../packages/catalog/identity-plan.mjs";
import { createCatalogStore } from "../packages/catalog/store.mjs";
import { validateCandidateDocument } from "../packages/catalog/validate-candidate.mjs";
import { compileProposalV02, parseAndValidateProposalV02 } from "../packages/librarian/proposal-v02.mjs";
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
assert.equal(run.prompt_version, "librarian-v0.2.1");
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
const cadenceSourceUnit = parseAndValidateProposalV02(JSON.stringify({
  description: null,
  capability_ids: ["model_inference"],
  offer: {
    availability: "public",
    entitlements: [{
      kind: "included_usage", label: "5 requests per minute",
      quantity: { value: 5, source_unit: "minute", normalized_unit: "request" },
      cadence: { interval: 1, unit: "minute" },
    }],
  },
}));
assert.equal(cadenceSourceUnit.proposal.offer.entitlements[0].quantity.source_unit, "request");
assert.ok(cadenceSourceUnit.actions.some((action) => action.includes("replaced cadence unit")));

const genericMonitoringListing = "[Example](https://example.test) - Cloud metrics, alarms, logs, and one million API requests.";
const genericMonitoringRecord = {
  ...record,
  raw_text: genericMonitoringListing,
  scout_material_bundle: { collection: { text: genericMonitoringListing }, pages: [] },
};
const genericMonitoringObservation = prepareSourceObservation(genericMonitoringRecord, "2026-08-26T01:00:00.000Z");
const guarded = compileProposalV02({
  description: "Cloud monitoring service.",
  capability_ids: ["ai_observability", "agent_infrastructure", "heartbeat_monitoring", "generic_service_api"],
  offer: valid.offer,
}, genericMonitoringRecord, genericMonitoringObservation);
assert.deepEqual(guarded.candidate.product.facets, []);
assert.deepEqual(guarded.candidate.opportunities, []);
assert.ok(guarded.actions.some((action) => action.includes("omitted ai_observability")));
assert.ok(guarded.actions.some((action) => action.includes("omitted agent_infrastructure")));
assert.ok(guarded.actions.some((action) => action.includes("omitted heartbeat_monitoring")));
assert.ok(guarded.actions.some((action) => action.includes("omitted generic_service_api")));

const aiListing = "[Example](https://example.test) - AI observability for tracing LLM model calls.";
const aiRecord = { ...record, raw_text: aiListing, scout_material_bundle: { collection: { text: aiListing }, pages: [] } };
const aiObservation = prepareSourceObservation(aiRecord, "2026-08-26T02:00:00.000Z");
const supported = compileProposalV02({ description: "AI observability service.", capability_ids: ["ai_observability"], offer: valid.offer }, aiRecord, aiObservation);
assert.equal(supported.candidate.product.facets[0].concept_id, "ai_observability");

const richerListing = "[Example](https://example.test) - AI observability with 10,000 spans, one project, 7-day retention, an account, no API key, and conditional Phone verification.";
const richerRecord = { ...record, raw_text: richerListing, scout_material_bundle: { collection: { text: richerListing }, pages: [] } };
const richerObservation = prepareSourceObservation(richerRecord, "2026-08-26T03:00:00.000Z");
const richerProposal = parseAndValidateProposalV02(JSON.stringify({
  description: "AI observability service.",
  capability_ids: ["ai_observability"],
  offer: {
    availability: "public",
    entitlements: [
      { kind: "included_usage", label: "10,000 spans", quantity: { value: 10000, normalized_unit: "span" } },
      { kind: "included_resource", label: "one project", quantity: { value: 1, normalized_unit: "project" } },
    ],
    constraints: [
      { kind: "retention", label: "7-day retention", quantity: { value: 7, normalized_unit: "day" } },
      { kind: "maximum_quantity", label: "one project maximum", quantity: { value: 1, normalized_unit: "project" }, target_entitlement: 1 },
    ],
    boolean_conditions: [{ kind: "account", required: true }],
    credential_conditions: [{ credential_type: "api_key", required: false }],
    other_conditions: [{ normalized_key: "phone_verification", state: "conditional", source_value: "Phone verification", target_entitlement: 0 }],
    audience_conditions: [],
  },
}));
const richer = compileProposalV02(richerProposal.proposal, richerRecord, richerObservation);
assert.equal(richer.candidate.opportunities[0].constraints[0].kind, "retention");
assert.equal(richer.candidate.opportunities[0].constraints[1].target_key, "ent_2");
assert.equal(richer.candidate.opportunities[0].conditions[1].family, "external_credential");
assert.equal(richer.candidate.opportunities[0].conditions[2].normalized_key, "phone_verification");
assert.deepEqual(validateCandidateDocument({ source_text: richerListing, candidate: richer.candidate }), []);
assert.throws(() => parseAndValidateProposalV02(JSON.stringify({
  description: null,
  capability_ids: ["ai_observability"],
  offer: {
    availability: "public",
    entitlements: [{ kind: "included_usage", label: "one span", quantity: { value: 1, normalized_unit: "span" } }],
    constraints: [{ kind: "retention", label: "retention", quantity: { value: 7, normalized_unit: "day" }, target_entitlement: 3 }],
  },
})), /target_entitlement: out of range/);

catalog.close();
state.close();
console.log(JSON.stringify({ status: "ok", compact_prompt: "verified", deterministic_compilation: "verified", protocol_failure_trace: "verified", bounded_repair: "verified", format_normalization: "verified", unknown_vocabulary_downgrade: "verified" }));
