import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ingestCandidate } from "../packages/catalog/ingest-candidate.mjs";
import { createCatalogStore } from "../packages/catalog/store.mjs";

const fixturesDir = path.join(import.meta.dirname, "fixtures", "data-contract");
const fixture = (name) =>
  JSON.parse(readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"));
const db = new DatabaseSync(":memory:");
createCatalogStore(db);

const cases = [
  {
    name: "telemetry-dev",
    plan: {
      source: {
        identity: "free-for-dev:telemetry-dev",
        locator: "README.md:228",
        kind: "free_for_dev_readme",
        platform: "free-for-dev",
      },
      product_id: "prod_telemetry_dev",
      product_revision_id: "pr_telemetry_dev_001",
      opportunities: {
        opp_free_plan: {
          opportunity_id: "opp_telemetry_dev_free",
          opportunity_revision_id: "or_telemetry_dev_001",
        },
      },
    },
  },
  {
    name: "reportgpt",
    plan: {
      source: {
        identity: "free-for-dev:reportgpt",
        locator: "README.md:229",
        kind: "free_for_dev_readme",
        platform: "free-for-dev",
      },
      product_id: "prod_reportgpt",
      product_revision_id: "pr_reportgpt_001",
      opportunities: {
        opp_byo_key: {
          opportunity_id: "opp_reportgpt_byo_key",
          opportunity_revision_id: "or_reportgpt_001",
        },
      },
    },
  },
  {
    name: "veo-google",
    plan: {
      source: {
        identity: "startup-offers:veo-google",
        locator: "startup-offers.csv:veo-google",
        kind: "startup_offer_csv",
        platform: "startup-offers.csv",
      },
      product_id: "prod_veo_google",
      product_revision_id: "pr_veo_google_001",
      opportunities: {
        opp_startup_credit: {
          opportunity_id: "opp_veo_google_credit",
          opportunity_revision_id: "or_veo_google_001",
        },
      },
    },
  },
];

for (const testCase of cases) {
  ingestCandidate(db, fixture(testCase.name), testCase.plan);
}

assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_revisions").get().count, 3);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM opportunity_revisions").get().count, 3);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM evidence_spans WHERE evidence_key = 'ev_name'")
    .get().count,
  3,
  "candidate-local evidence keys must be safely namespaced by snapshot",
);
assert.equal(
  db.prepare(`
    SELECT monetary_amount_micros
    FROM entitlement_index
    WHERE opportunity_revision_id = 'or_veo_google_001'
  `).get().monetary_amount_micros,
  300_000_000,
  "money must use exact integer micros in relational indexes",
);
assert.equal(
  db.prepare(`
    SELECT required_state
    FROM condition_index
    WHERE opportunity_revision_id = 'or_reportgpt_001'
      AND family = 'external_credential'
      AND normalized_kind = 'api_key'
  `).get().required_state,
  1,
  "BYOK must remain a scoped typed condition",
);
assert.equal(
  db.prepare(`
    SELECT quantity_value
    FROM constraint_index
    WHERE opportunity_revision_id = 'or_telemetry_dev_001'
      AND kind = 'retention'
  `).get().quantity_value,
  7,
  "limits must be queryable separately from entitlements",
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM search_index WHERE search_index MATCH 'writing'")
    .get().count,
  1,
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM current_published_revisions").get().count,
  0,
  "ingestion must never imply review or publication",
);

const repeated = fixture("telemetry-dev");
repeated.candidate.source_snapshot_id = "srcsnap_telemetry_dev_002";
repeated.candidate.observed_at = "2026-08-25T20:00:00Z";
ingestCandidate(db, repeated, {
  ...cases[0].plan,
  product_revision_id: "pr_telemetry_dev_002",
  supersedes_product_revision_id: "pr_telemetry_dev_001",
  opportunities: {
    opp_free_plan: {
      opportunity_id: "opp_telemetry_dev_free",
      opportunity_revision_id: "or_telemetry_dev_002",
      supersedes_revision_id: "or_telemetry_dev_001",
    },
  },
});
assert.equal(
  db.prepare(`
    SELECT COUNT(*) AS count
    FROM source_snapshots
    WHERE source_identity = 'free-for-dev:telemetry-dev'
  `).get().count,
  2,
  "an unchanged source may be observed again for freshness",
);
assert.equal(
  db.prepare(`
    SELECT supersedes_revision_id
    FROM opportunity_revisions
    WHERE opportunity_revision_id = 'or_telemetry_dev_002'
  `).get().supersedes_revision_id,
  "or_telemetry_dev_001",
  "supersession IDs must come from the harness identity plan",
);

const crossProduct = fixture("telemetry-dev");
crossProduct.candidate.source_snapshot_id = "srcsnap_telemetry_dev_003";
crossProduct.candidate.observed_at = "2026-08-26T20:00:00Z";
assert.throws(
  () =>
    ingestCandidate(db, crossProduct, {
      ...cases[0].plan,
      product_revision_id: "pr_telemetry_dev_003",
      supersedes_product_revision_id: "pr_veo_google_001",
      opportunities: {
        opp_free_plan: {
          opportunity_id: "opp_telemetry_dev_free",
          opportunity_revision_id: "or_telemetry_dev_003",
          supersedes_revision_id: "or_telemetry_dev_002",
        },
      },
    }),
  /cannot supersede a revision of prod_veo_google/,
  "product supersession must stay within one stable product",
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM source_snapshots WHERE source_snapshot_id = ?")
    .get("srcsnap_telemetry_dev_003").count,
  0,
  "a rejected identity plan must roll back its entire observation",
);

const crossOpportunity = fixture("telemetry-dev");
crossOpportunity.candidate.source_snapshot_id = "srcsnap_telemetry_dev_004";
crossOpportunity.candidate.observed_at = "2026-08-27T20:00:00Z";
assert.throws(
  () =>
    ingestCandidate(db, crossOpportunity, {
      ...cases[0].plan,
      product_revision_id: "pr_telemetry_dev_004",
      supersedes_product_revision_id: "pr_telemetry_dev_002",
      opportunities: {
        opp_free_plan: {
          opportunity_id: "opp_telemetry_dev_free",
          opportunity_revision_id: "or_telemetry_dev_004",
          supersedes_revision_id: "or_veo_google_001",
        },
      },
    }),
  /cannot supersede a revision of opp_veo_google_credit/,
  "opportunity supersession must stay within one stable opportunity",
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM product_revisions WHERE product_revision_id = ?")
    .get("pr_telemetry_dev_004").count,
  0,
  "cross-opportunity failure must roll back the product revision too",
);

db.close();
console.log(
  JSON.stringify({
    status: "ok",
    ingested_candidates: 4,
    distinct_products: 3,
    repeat_observation: "verified",
  }),
);
