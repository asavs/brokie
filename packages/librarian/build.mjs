import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CAPABILITIES,
  USER_NEEDS,
  candidateProduct,
  deterministicAnnotations,
  normalizeStartupRows,
  parseCsv,
  parseReadme,
  selectV001,
  sha,
  slug,
} from "./lib.mjs";

const cliArgs = process.argv.slice(2);
const positional = cliArgs.filter((value) => !value.startsWith("--"));
const outputArg = cliArgs.find((value) => value.startsWith("--output-dir="));
const readmePath = positional[0];
const startupCsvPath = positional[1];
const outputDir = outputArg ? path.resolve(outputArg.slice("--output-dir=".length)) : path.join(import.meta.dirname, "generated");
const dbPath = path.join(outputDir, "brokie-v0.0.1.sqlite");

if (!readmePath || !startupCsvPath) throw new Error("Usage: node packages/librarian/build.mjs <free-for-dev-readme.md> <startup-offers.csv> [--output-dir=<path>]");

const readmeText = fs.readFileSync(readmePath, "utf8");
const csvText = fs.readFileSync(startupCsvPath, "utf8");
const allRecords = [
  ...parseReadme(readmeText),
  ...normalizeStartupRows(parseCsv(csvText), startupCsvPath),
];
const selected = selectV001(allRecords);
fs.mkdirSync(outputDir, { recursive: true });
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(path.join(import.meta.dirname, "schema.sql"), "utf8"));
const now = new Date().toISOString();

const insertMetadata = db.prepare("INSERT INTO metadata(key, value) VALUES (?, ?)");
insertMetadata.run("version", "0.0.1");
insertMetadata.run("generated_at", now);
insertMetadata.run("readme_sha256", sha(readmeText, 64));
insertMetadata.run("startup_csv_sha256", sha(csvText, 64));
insertMetadata.run("verification_scope", "Organized from supplied catalog text only; not independently verified");

const insertSource = db.prepare(`INSERT INTO source_records (
  source_id, source_kind, source_locator, source_file, source_line, source_row,
  source_category, source_name, source_url, source_description, source_offer_detail,
  source_eligibility, source_platform, parent_provider, estimated_value_usd, raw_text,
  selection_score, selection_reasons_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertProduct = db.prepare("INSERT OR IGNORE INTO products(product_id, name, canonical_url, derivation) VALUES (?, ?, ?, ?)");
const insertOpportunity = db.prepare(`INSERT INTO opportunities (
  opportunity_id, source_id, product_id, name, opportunity_type, benefit_text,
  eligibility_text, estimated_value_usd, derivation
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertCapability = db.prepare("INSERT INTO capabilities(capability_id, label) VALUES (?, ?)");
const insertNeed = db.prepare("INSERT INTO user_needs(user_need_id, label) VALUES (?, ?)");
const insertProductCapability = db.prepare(`INSERT OR IGNORE INTO product_capabilities
  (product_id, capability_id, source_id, derivation, confidence, evidence) VALUES (?, ?, ?, ?, ?, ?)`);
const insertProductNeed = db.prepare(`INSERT OR IGNORE INTO product_user_needs
  (product_id, user_need_id, source_id, derivation, confidence, evidence) VALUES (?, ?, ?, ?, ?, ?)`);
const insertRequirement = db.prepare(`INSERT INTO requirements
  (requirement_id, opportunity_id, field, value_json, derivation, confidence, evidence) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insertReviewItem = db.prepare(`INSERT INTO review_items
  (review_id, source_id, item_type, payload_json, reason, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);

for (const [id, label] of CAPABILITIES) insertCapability.run(id, label);
for (const [id, label] of USER_NEEDS) insertNeed.run(id, label);

const normalized = [];
db.exec("BEGIN");
try {
  for (const record of selected) {
    insertSource.run(
      record.source_id, record.source_kind, record.source_locator, record.source_file,
      record.source_line, record.source_row, record.source_category, record.source_name,
      record.source_url, record.source_description, record.source_offer_detail,
      record.source_eligibility, record.source_platform, record.parent_provider,
      record.estimated_value_usd, record.raw_text, record.selection.score,
      JSON.stringify(record.selection.reasons),
    );
    const product = candidateProduct(record);
    insertProduct.run(product.product_id, product.name, product.canonical_url, product.derivation);
    const opportunityType = record.source_kind === "startup_offers_csv" ? "startup_offer" : "public_free_tier";
    const opportunityId = `opp_${slug(record.source_name)}_${sha(record.source_id, 10)}`;
    insertOpportunity.run(
      opportunityId, record.source_id, product.product_id, record.source_name,
      opportunityType, record.source_offer_detail, record.source_eligibility,
      record.estimated_value_usd, "deterministically_parsed",
    );
    if (record.source_eligibility) {
      insertRequirement.run(
        `req_${sha(`${opportunityId}\neligibility`)}`, opportunityId, "eligibility_text",
        JSON.stringify(record.source_eligibility), "source_stated", 1,
        record.source_eligibility,
      );
    }
    const annotations = deterministicAnnotations(record);
    for (const capability of annotations.capabilities) {
      insertProductCapability.run(product.product_id, capability.id, record.source_id, capability.derivation, capability.confidence, capability.evidence);
    }
    for (const need of annotations.needs) {
      insertProductNeed.run(product.product_id, need.id, record.source_id, need.derivation, need.confidence, need.evidence);
    }
    if (!annotations.capabilities.length && !annotations.needs.length) {
      insertReviewItem.run(
        `rev_${sha(`${record.source_id}\nmissing_mapping`)}`, record.source_id,
        "missing_outcome_mapping", JSON.stringify({ source_name: record.source_name }),
        "Selected record has an auditable relevance score but no deterministic capability or user-need mapping; model or human classification is required.",
        null, now,
      );
    }
    normalized.push({
      ...record,
      product,
      opportunity_id: opportunityId,
      opportunity_type: opportunityType,
      annotations,
    });
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const stats = {
  version: "0.0.1",
  all_source_records: allRecords.length,
  selected_records: selected.length,
  readme_records: selected.filter((record) => record.source_kind === "free_for_dev_readme").length,
  startup_records: selected.filter((record) => record.source_kind === "startup_offers_csv").length,
  products: db.prepare("SELECT count(*) AS count FROM products").get().count,
  capability_links: db.prepare("SELECT count(*) AS count FROM product_capabilities").get().count,
  user_need_links: db.prepare("SELECT count(*) AS count FROM product_user_needs").get().count,
  review_items: db.prepare("SELECT count(*) AS count FROM review_items").get().count,
};

const exportObject = {
  version: "0.0.1",
  generated_at: now,
  verification_scope: "Organized from supplied catalog text only; not independently verified",
  stats,
  vocabularies: {
    capabilities: CAPABILITIES.map(([id, label]) => ({ id, label })),
    user_needs: USER_NEEDS.map(([id, label]) => ({ id, label })),
  },
  records: normalized,
};
fs.writeFileSync(path.join(outputDir, "staging.json"), `${JSON.stringify(exportObject, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "build-summary.json"), `${JSON.stringify(stats, null, 2)}\n`);
db.close();
console.log(JSON.stringify({ dbPath, stats }, null, 2));
