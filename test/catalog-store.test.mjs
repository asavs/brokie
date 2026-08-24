import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCatalogStore } from "../packages/catalog/store.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fixture = JSON.parse(
  readFileSync(
    path.join(root, "test", "fixtures", "data-contract", "telemetry-dev.json"),
    "utf8",
  ),
);
const { candidate, source_text: sourceText } = fixture;
const now = "2026-08-24T20:00:00Z";
const db = new DatabaseSync(":memory:");
createCatalogStore(db);
createCatalogStore(db);

assert.equal(
  db.prepare("SELECT value FROM catalog_metadata WHERE key = 'contract_version'").get().value,
  "0.1.0",
);

db.prepare(`
  INSERT INTO source_snapshots (
    source_snapshot_id, source_identity, source_locator, source_kind, source_platform,
    full_text, observed_at, content_sha256, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  candidate.source_snapshot_id,
  "free-for-dev:telemetry-dev",
  "README.md:228",
  "free_for_dev_readme",
  "free-for-dev",
  sourceText,
  candidate.observed_at,
  "a".repeat(64),
  now,
);
db.prepare(`
  INSERT INTO source_snapshots (
    source_snapshot_id, source_identity, source_locator, source_kind,
    full_text, observed_at, content_sha256, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "srcsnap_abcd",
  "contract:min-length",
  "fixture:min-length",
  "other",
  "Minimum valid snapshot identifier fixture",
  now,
  "e".repeat(64),
  now,
);

const insertEvidence = db.prepare(`
  INSERT INTO evidence_spans (
    source_snapshot_id, evidence_key, quote, start_offset, end_offset, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);
for (const evidence of candidate.evidence_spans) {
  const start = sourceText.indexOf(evidence.quote);
  assert.ok(start >= 0);
  insertEvidence.run(
    candidate.source_snapshot_id,
    evidence.id,
    evidence.quote,
    start,
    start + evidence.quote.length,
    now,
  );
}

db.prepare("INSERT INTO products (product_id, created_at) VALUES (?, ?)").run(
  "prod_telemetry_dev",
  now,
);
db.prepare(`
  INSERT INTO product_revisions (
    product_revision_id, product_id, source_snapshot_id, observed_at,
    contract_version, vocabulary_version, document_json, document_sha256, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "pr_telemetry_dev_001",
  "prod_telemetry_dev",
  candidate.source_snapshot_id,
  candidate.observed_at,
  candidate.contract_version,
  candidate.vocabulary_version,
  JSON.stringify(candidate.product),
  "b".repeat(64),
  now,
);

db.prepare("INSERT INTO opportunities (opportunity_id, product_id, created_at) VALUES (?, ?, ?)").run(
  "opp_telemetry_dev_free",
  "prod_telemetry_dev",
  now,
);
const opportunity = candidate.opportunities[0];
db.prepare(`
  INSERT INTO opportunity_revisions (
    opportunity_revision_id, opportunity_id, source_snapshot_id, observed_at,
    availability, contract_version, vocabulary_version, document_json,
    document_sha256, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "or_telemetry_dev_001",
  "opp_telemetry_dev_free",
  candidate.source_snapshot_id,
  candidate.observed_at,
  opportunity.availability.value,
  candidate.contract_version,
  candidate.vocabulary_version,
  JSON.stringify(opportunity),
  "c".repeat(64),
  now,
);

const insertFacet = db.prepare(`
  INSERT INTO facet_index (product_revision_id, namespace, concept_id, basis)
  VALUES (?, ?, ?, ?)
`);
for (const facet of candidate.product.facets) {
  insertFacet.run(
    "pr_telemetry_dev_001",
    facet.namespace,
    facet.concept_id,
    facet.support.basis,
  );
}

const insertEntitlement = db.prepare(`
  INSERT INTO entitlement_index (
    opportunity_revision_id, entitlement_key, kind, cost_scope,
    quantity_value, quantity_comparator, quantity_unit,
    cadence_interval, cadence_unit, cadence_alignment,
    monetary_amount_micros, monetary_currency, monetary_comparator
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const entitlement of opportunity.entitlements) {
  insertEntitlement.run(
    "or_telemetry_dev_001",
    entitlement.key,
    entitlement.kind,
    entitlement.cost_scope ?? null,
    entitlement.quantity?.value ?? null,
    entitlement.quantity?.comparator ?? null,
    entitlement.quantity?.normalized_unit ?? null,
    entitlement.cadence?.interval ?? null,
    entitlement.cadence?.unit ?? null,
    entitlement.cadence?.alignment ?? null,
    entitlement.monetary_value
      ? Math.round(entitlement.monetary_value.amount * 1_000_000)
      : null,
    entitlement.monetary_value?.currency ?? null,
    entitlement.monetary_value?.comparator ?? null,
  );
}

db.prepare(`
  INSERT INTO review_events (
    review_event_id, product_revision_id, decision, reviewer_kind,
    reviewer_id, note, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "rev_telemetry_product_trust",
  "pr_telemetry_dev_001",
  "trust",
  "human",
  "fixture-reviewer",
  "Representative trusted product revision",
  now,
);
db.prepare(`
  INSERT INTO review_events (
    review_event_id, opportunity_revision_id, decision, reviewer_kind,
    reviewer_id, note, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "rev_telemetry_dev_trust",
  "or_telemetry_dev_001",
  "trust",
  "human",
  "fixture-reviewer",
  "Representative trusted revision",
  now,
);
assert.deepEqual(
  { ...db.prepare(`
      SELECT opportunity_id, opportunity_revision_id, product_revision_id
      FROM current_published_revisions
    `).get() },
  {
    opportunity_id: "opp_telemetry_dev_free",
    opportunity_revision_id: "or_telemetry_dev_001",
    product_revision_id: "pr_telemetry_dev_001",
  },
  "publication must be derived from trusted related revisions",
);

db.prepare("INSERT INTO opportunities (opportunity_id, product_id, created_at) VALUES (?, ?, ?)")
  .run("opp_empty_benefit", "prod_telemetry_dev", now);
db.prepare(`
  INSERT INTO opportunity_revisions (
    opportunity_revision_id, opportunity_id, source_snapshot_id, observed_at,
    availability, contract_version, vocabulary_version, document_json,
    document_sha256, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "or_empty_benefit_001",
  "opp_empty_benefit",
  candidate.source_snapshot_id,
  now,
  "public",
  "0.1.0",
  "0.1.0",
  JSON.stringify({ entitlements: [], ambiguities: [] }),
  "f".repeat(64),
  now,
);
db.prepare(`
  INSERT INTO review_events (
    review_event_id, opportunity_revision_id, decision, reviewer_kind,
    reviewer_id, note, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "rev_empty_benefit_trust",
  "or_empty_benefit_001",
  "trust",
  "human",
  "fixture-reviewer",
  "Deliberately invalid publication fixture",
  now,
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM current_published_revisions").get().count,
  1,
  "trust alone must not publish an opportunity with no supported entitlement",
);

db.prepare("INSERT INTO products (product_id, created_at) VALUES (?, ?)").run(
  "prod_telemetry_canonical",
  now,
);
db.prepare(`
  INSERT INTO review_events (
    review_event_id, product_revision_id, decision, canonical_product_id,
    reviewer_kind, reviewer_id, note, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "rev_telemetry_canonicalize",
  "pr_telemetry_dev_001",
  "canonicalize",
  "prod_telemetry_canonical",
  "human",
  "fixture-reviewer",
  "Identity resolution is orthogonal to trust",
  "2026-08-24T20:00:30Z",
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM current_published_revisions").get().count,
  1,
  "canonicalization must not shadow an independent trust decision",
);

assert.equal(
  db.prepare(`
    SELECT COUNT(*) AS count
    FROM entitlement_index
    WHERE opportunity_revision_id = ? AND quantity_unit = 'span'
  `).get("or_telemetry_dev_001").count,
  1,
  "typed entitlement indexes must support numeric/unit queries",
);
assert.equal(
  db.prepare(`
    SELECT COUNT(*) AS count
    FROM facet_index
    WHERE namespace = 'capability' AND concept_id = 'ai_observability'
  `).get().count,
  1,
  "controlled facets must be queryable without parsing prose",
);

assert.throws(
  () =>
    db.prepare("INSERT INTO products (product_id, created_at) VALUES (?, ?)")
      .run("prod_aBAD!", now),
  /CHECK constraint failed/,
  "durable IDs must reject characters outside their minted grammar",
);

assert.throws(
  () =>
    insertFacet.run(
      "pr_telemetry_dev_001",
      "capability",
      "observability_but_fuzzy",
      "inferred",
    ),
  /FOREIGN KEY constraint failed/,
  "the database must reject concepts absent from its seeded vocabulary",
);

db.prepare(`
  INSERT INTO review_events (
    review_event_id, opportunity_revision_id, decision, reviewer_kind,
    reviewer_id, note, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "rev_telemetry_dev_reject",
  "or_telemetry_dev_001",
  "reject",
  "human",
  "fixture-reviewer",
  "Later rejection removes the revision from publication",
  "2026-08-24T20:01:00Z",
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM current_published_revisions").get().count,
  0,
  "a later rejection must remove a revision from the derived publication view",
);

assert.throws(
  () =>
    db.prepare("UPDATE opportunity_revisions SET availability = 'unknown' WHERE opportunity_revision_id = ?")
      .run("or_telemetry_dev_001"),
  /opportunity revisions are immutable/,
);
assert.throws(
  () =>
    db.prepare(`
      INSERT INTO review_events (
        review_event_id, decision, reviewer_kind, reviewer_id, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run("rev_invalid_target", "trust", "harness", "test", now),
  /CHECK constraint failed/,
);
assert.throws(
  () =>
    db.prepare(`
      INSERT INTO product_revisions (
        product_revision_id, product_id, source_snapshot_id, observed_at,
        contract_version, vocabulary_version, document_json, document_sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "pr_invalid_json",
      "prod_telemetry_dev",
      candidate.source_snapshot_id,
      now,
      "0.1.0",
      "0.1.0",
      "not-json",
      "d".repeat(64),
      now,
    ),
  /CHECK constraint failed/,
);

const tableCount = db
  .prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table'")
  .get().count;
db.close();

console.log(
  JSON.stringify({
    status: "ok",
    durable_store: "verified",
    tables: tableCount,
    immutable_revision_guard: "verified",
  }),
);
