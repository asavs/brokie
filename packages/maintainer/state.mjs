import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openState(statePath) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const db = new DatabaseSync(statePath);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS refresh_runs (
      run_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      previous_run_id TEXT,
      catalog_path TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS review_queue (
      review_id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      run_id TEXT NOT NULL REFERENCES refresh_runs(run_id),
      item_type TEXT NOT NULL,
      identity_key TEXT NOT NULL,
      source_id TEXT,
      payload_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','rejected','deferred')),
      decision_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      decided_at TEXT
    );
    CREATE INDEX IF NOT EXISTS review_queue_status_idx ON review_queue(status, created_at);
    CREATE INDEX IF NOT EXISTS review_queue_identity_idx ON review_queue(identity_key);
  `);
  const reviewColumns = new Set(db.prepare("PRAGMA table_info(review_queue)").all().map((column) => column.name));
  for (const [name, definition] of [
    ["decision_action", "TEXT NOT NULL DEFAULT ''"],
    ["proposed_capabilities_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["proposed_needs_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["card_feedback_json", "TEXT NOT NULL DEFAULT '{}'"],
  ]) if (!reviewColumns.has(name)) db.exec(`ALTER TABLE review_queue ADD COLUMN ${name} ${definition}`);
  return db;
}
