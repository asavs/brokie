import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  contractSchema,
  validateCandidateDocument,
  vocabulary,
} from "../packages/catalog/validate-candidate.mjs";

const fixturesDir = path.join(import.meta.dirname, "fixtures", "data-contract");
const fixtureFiles = (await readdir(fixturesDir))
  .filter((name) => name.endsWith(".json"))
  .sort();
assert.ok(fixtureFiles.length >= 3, "expected at least three representative fixtures");

const fixtures = new Map();
for (const fixtureFile of fixtureFiles) {
  const fixture = JSON.parse(await readFile(path.join(fixturesDir, fixtureFile), "utf8"));
  fixtures.set(fixtureFile, fixture);
  assert.deepEqual(
    validateCandidateDocument(fixture),
    [],
    `${fixtureFile} must satisfy the contract`,
  );
}

function mutatedFixture(name, mutate) {
  const fixture = structuredClone(fixtures.get(name));
  mutate(fixture);
  return validateCandidateDocument(fixture);
}

assert.ok(
  mutatedFixture("telemetry-dev.json", (fixture) => {
    fixture.candidate.product.facets[0].concept_id = "observability_but_fuzzy";
  }).some((error) => error.includes("unknown facet concept")),
  "the harness must reject concepts outside the versioned vocabulary",
);

assert.ok(
  mutatedFixture("telemetry-dev.json", (fixture) => {
    fixture.candidate.product.facets[0].support.evidence_ids = ["ev_missing"];
  }).some((error) => error.includes("dangling evidence reference")),
  "the harness must reject dangling evidence references",
);

assert.ok(
  mutatedFixture("reportgpt.json", (fixture) => {
    fixture.candidate.evidence_spans[0].quote = "text the source never contained";
  }).some((error) => error.includes("not an exact source substring")),
  "the harness must reject fabricated evidence excerpts",
);

assert.ok(
  mutatedFixture("veo-google.json", (fixture) => {
    const entitlement = fixture.candidate.opportunities[0].entitlements[0];
    fixture.candidate.opportunities[0].entitlements.push({
      ...structuredClone(entitlement),
      key: "ent_duplicate_savings",
      kind: "fixed_discount",
      label: "Save up to $300",
    });
  }).some((error) => error.includes("duplicate economics")),
  "the harness must not multiply one credit into a credit and duplicate savings",
);

assert.ok(
  mutatedFixture("reportgpt.json", (fixture) => {
    fixture.candidate.opportunities[0].conditions[0].target_key = "ent_missing";
  }).some((error) => error.includes("invalid condition target")),
  "typed references must resolve inside their opportunity",
);

assert.ok(
  mutatedFixture("veo-google.json", (fixture) => {
    delete fixture.candidate.opportunities[0].entitlements[0].monetary_value;
  }).some((error) => error.includes("must have required property 'monetary_value'")),
  "a monetary credit must contain typed money",
);

assert.ok(
  mutatedFixture("telemetry-dev.json", (fixture) => {
    delete fixture.candidate.opportunities[0].entitlements[0].quantity;
  }).some((error) => error.includes("must have required property 'quantity'")),
  "included usage must contain a typed quantity",
);

assert.ok(
  mutatedFixture("reportgpt.json", (fixture) => {
    const entitlement = fixture.candidate.opportunities[0].entitlements[0];
    entitlement.kind = "percentage_discount";
  }).some((error) => error.includes("must have required property 'percentage_value'")),
  "a percentage discount must contain a typed percentage",
);

assert.deepEqual(
  mutatedFixture("reportgpt.json", (fixture) => {
    fixture.candidate.opportunities[0].entitlements[0].kind = "trial_access";
  }),
  [],
  "an explicit trial with unstated duration must remain representable",
);

console.log(
  JSON.stringify({
    status: "ok",
    contract_version: contractSchema.properties.contract_version.const,
    vocabulary_version: vocabulary.version,
    fixtures: fixtureFiles.length,
    negative_guards: 8,
  }),
);
