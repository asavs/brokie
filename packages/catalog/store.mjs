import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const schemaSql = readFileSync(path.join(import.meta.dirname, "schema.v0.1.sql"), "utf8");
const vocabulary = JSON.parse(
  readFileSync(path.join(root, "schemas", "vocabularies.v0.1.json"), "utf8"),
);

export function createCatalogStore(db) {
  const exists = db
    .prepare("SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = 'catalog_metadata'")
    .get();
  if (!exists) db.exec(schemaSql);

  const storedContractVersion = db
    .prepare("SELECT value FROM catalog_metadata WHERE key = 'contract_version'")
    .get()?.value;
  const storedVocabularyVersion = db
    .prepare("SELECT value FROM catalog_metadata WHERE key = 'vocabulary_version'")
    .get()?.value;
  if (storedContractVersion !== "0.1.0") {
    throw new Error(`store contract ${storedContractVersion ?? "missing"} requires migration`);
  }
  if (storedVocabularyVersion !== vocabulary.version) {
    throw new Error(
      `store expects vocabulary ${storedVocabularyVersion}, loaded ${vocabulary.version}`,
    );
  }

  const insertFacet = db.prepare(
    "INSERT OR IGNORE INTO facet_concepts (namespace, concept_id) VALUES (?, ?)",
  );
  const insertUnit = db.prepare("INSERT OR IGNORE INTO normalized_units (unit_id) VALUES (?)");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [namespace, conceptIds] of Object.entries(vocabulary.facet_namespaces)) {
      for (const conceptId of conceptIds) insertFacet.run(namespace, conceptId);
    }
    for (const unit of vocabulary.normalized_units) insertUnit.run(unit);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return db;
}
