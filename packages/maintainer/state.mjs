import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function ensureColumn(db, table, column, definition) {
  const columns = new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map(({ name }) => name),
  );
  if (!columns.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function openState(statePath) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const db = new DatabaseSync(statePath);
  db.exec(`PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
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
    CREATE TABLE IF NOT EXISTS librarian_runs (
      run_id TEXT PRIMARY KEY,
      source_snapshot_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      requested_model TEXT NOT NULL,
      resolved_model TEXT NOT NULL DEFAULT '',
      prompt_version TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('running','review_required','failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER,
      output_tokens INTEGER,
      product_revision_id TEXT,
      opportunity_revision_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(opportunity_revision_ids_json)),
      trace_path TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS librarian_attempts (
      run_id TEXT NOT NULL REFERENCES librarian_runs(run_id),
      attempt_number INTEGER NOT NULL CHECK(attempt_number IN (1, 2)),
      attempt_kind TEXT NOT NULL CHECK(attempt_kind IN ('initial','repair')),
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('provider_error','parse_error','validation_error','accepted')),
      resolved_model TEXT NOT NULL DEFAULT '',
      raw_response TEXT NOT NULL DEFAULT '',
      reasoning TEXT,
      parsed_candidate_json TEXT CHECK(parsed_candidate_json IS NULL OR json_valid(parsed_candidate_json)),
      validation_errors_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(validation_errors_json)),
      usage_json TEXT CHECK(usage_json IS NULL OR json_valid(usage_json)),
      error TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(run_id, attempt_number)
    );
    CREATE TABLE IF NOT EXISTS revision_review_queue (
      review_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE REFERENCES librarian_runs(run_id),
      product_revision_id TEXT NOT NULL,
      opportunity_revision_ids_json TEXT NOT NULL CHECK(json_valid(opportunity_revision_ids_json)),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','processed')),
      decision TEXT CHECK(decision IS NULL OR decision IN ('accepted','rejected','deferred')),
      decision_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      processed_at TEXT,
      decided_at TEXT
    );
    CREATE INDEX IF NOT EXISTS librarian_runs_status_idx ON librarian_runs(status, started_at);
    CREATE INDEX IF NOT EXISTS revision_review_queue_status_idx
      ON revision_review_queue(status, created_at);
    CREATE TABLE IF NOT EXISTS librarian_packet_queue (
      packet_id TEXT PRIMARY KEY,
      scout_run_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK(status IN ('queued','running','review_required','failed')),
      enqueue_sequence INTEGER NOT NULL UNIQUE,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      librarian_run_id TEXT,
      error TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS librarian_packet_queue_status_idx
      ON librarian_packet_queue(status, enqueue_sequence);
  `);
  ensureColumn(
    db,
    "revision_review_queue",
    "decision",
    "TEXT CHECK(decision IS NULL OR decision IN ('accepted','rejected','deferred'))",
  );
  ensureColumn(db, "revision_review_queue", "decision_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "revision_review_queue", "decided_at", "TEXT");
  return db;
}

export function recordRevisionReviewDecision(
  db,
  reviewId,
  { decision, note = "", decidedAt = new Date().toISOString() },
) {
  if (!["accepted", "rejected", "deferred"].includes(decision)) {
    throw new Error(`invalid revision review decision: ${decision}`);
  }
  const result = db.prepare(`
    UPDATE revision_review_queue
    SET status = 'processed', decision = ?, decision_note = ?,
      processed_at = ?, decided_at = ?
    WHERE review_id = ? AND status = 'open'
  `).run(decision, note, decidedAt, decidedAt, reviewId);
  if (result.changes !== 1) throw new Error(`open revision review not found: ${reviewId}`);
  return db.prepare("SELECT * FROM revision_review_queue WHERE review_id = ?").get(reviewId);
}
