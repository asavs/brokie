import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { parseCsv, parseReadme, selectV001, sha } from "./lib.mjs";

const csv = parseCsv('A,B\n"x,y","quoted ""value"""\n');
assert.equal(csv.length, 1);
assert.equal(csv[0].values.A, "x,y");
assert.equal(csv[0].values.B, 'quoted "value"');
assert.equal(csv[0].row_number, 2);

const markdown = "# test\n## Generative AI\n  * [Example](https://example.com) - Free model inference API.\n";
const parsed = parseReadme(markdown);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].source_line, 3);
assert.equal(parsed[0].raw_text, "  * [Example](https://example.com) - Free model inference API.");

const chosen = selectV001(parsed, 10);
assert.equal(chosen.length, 1);
assert.match(chosen[0].source_id, /^src_[0-9a-f]{16}$/);
assert.equal(chosen[0].source_id, `src_${sha(`${chosen[0].source_kind}\n${chosen[0].source_locator}\n${chosen[0].raw_text}`)}`);

const generatedDir = path.join(import.meta.dirname, "generated");
const dbPath = path.join(generatedDir, "brokie-v0.0.1.sqlite");
const stagingPath = path.join(generatedDir, "staging.json");
assert.ok(fs.existsSync(dbPath), "build the v0.0.1 database before running tests");
assert.ok(fs.existsSync(stagingPath), "build staging JSON before running tests");

const db = new DatabaseSync(dbPath, { readOnly: true });
const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();
assert.deepEqual(foreignKeyErrors, []);
const sourceCount = Number(db.prepare("SELECT count(*) AS count FROM source_records").get().count);
const opportunityCount = Number(db.prepare("SELECT count(*) AS count FROM opportunities").get().count);
const orphanCount = Number(db.prepare(`SELECT count(*) AS count FROM opportunities o
  LEFT JOIN source_records s ON s.source_id = o.source_id
  LEFT JOIN products p ON p.product_id = o.product_id
  WHERE s.source_id IS NULL OR p.product_id IS NULL`).get().count);
assert.equal(sourceCount, opportunityCount);
assert.equal(orphanCount, 0);
assert.ok(sourceCount >= 1 && sourceCount <= 60, `expected a small 1-60 record slice, got ${sourceCount}`);

const staging = JSON.parse(fs.readFileSync(stagingPath, "utf8"));
assert.equal(staging.version, "0.0.1");
assert.equal(staging.records.length, sourceCount);
assert.ok(staging.records.every((record) => record.raw_text && record.source_locator && record.selection.reasons.length));
const mappedSourceIds = new Set(staging.records.filter((record) => record.annotations.capabilities.length || record.annotations.needs.length).map((record) => record.source_id));
const unmappedReviewIds = new Set(db.prepare("SELECT source_id FROM review_items WHERE item_type = 'missing_outcome_mapping'").all().map((row) => row.source_id));
assert.ok(staging.records.every((record) => mappedSourceIds.has(record.source_id) || unmappedReviewIds.has(record.source_id)));
db.close();

const reference = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "reference-set.json"), "utf8"));
assert.equal(reference.labels.length, 16, "reference set should remain a small reviewed benchmark");
assert.ok(reference.labels.every((record) => record.source_id && typeof record.include === "boolean"));

const explorerPath = path.join(generatedDir, "index.html");
if (fs.existsSync(explorerPath)) {
  const explorer = fs.readFileSync(explorerPath, "utf8");
  assert.match(explorer, /What do you need/);
  assert.match(explorer, /Source evidence/);
  assert.doesNotMatch(explorer, /NVIDIA_NIM_API_KEY|OPENROUTER_API_KEY/);
}

console.log(JSON.stringify({ status: "ok", sourceCount, opportunityCount }, null, 2));
