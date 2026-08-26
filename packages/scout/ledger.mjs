import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { canonicalJson, traceFingerprint } from "./canonical.mjs";

const SQL = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS scout_runs (
 run_id TEXT PRIMARY KEY, seed_json TEXT NOT NULL, provider TEXT NOT NULL, requested_model TEXT NOT NULL,
 prompt_version TEXT NOT NULL, action_schema_version TEXT NOT NULL, started_at TEXT NOT NULL,
 finished_at TEXT, status TEXT NOT NULL CHECK(status IN ('running','completed','partial','blocked','failed')),
 budget_json TEXT NOT NULL, counters_json TEXT, terminal_reason_codes_json TEXT, unresolved_work_json TEXT,
 research_request_json TEXT
);
CREATE TABLE IF NOT EXISTS scout_events (
 run_id TEXT NOT NULL REFERENCES scout_runs(run_id), sequence INTEGER NOT NULL, occurred_at TEXT NOT NULL,
 event_type TEXT NOT NULL, normalized_json TEXT NOT NULL, trace_fingerprint TEXT NOT NULL,
 PRIMARY KEY(run_id, sequence)
);
CREATE TABLE IF NOT EXISTS scout_attempts (
 run_id TEXT NOT NULL REFERENCES scout_runs(run_id), attempt_number INTEGER NOT NULL, started_at TEXT NOT NULL,
 finished_at TEXT NOT NULL, status TEXT NOT NULL, requested_model TEXT NOT NULL, resolved_model TEXT,
 usage_json TEXT, action_json TEXT, failure_code TEXT, restricted_trace_path TEXT,
 PRIMARY KEY(run_id, attempt_number)
);
CREATE TABLE IF NOT EXISTS scout_packets (
 run_id TEXT NOT NULL REFERENCES scout_runs(run_id), ordinal INTEGER NOT NULL, packet_id TEXT NOT NULL,
 storage_status TEXT NOT NULL CHECK(storage_status IN ('emitted','reused')), investigation_status TEXT NOT NULL,
 PRIMARY KEY(run_id, ordinal)
);
CREATE TABLE IF NOT EXISTS scout_tool_calls (
 run_id TEXT NOT NULL REFERENCES scout_runs(run_id), sequence INTEGER NOT NULL,
 tool_name TEXT NOT NULL, tool_version TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
 input_json TEXT NOT NULL, status TEXT NOT NULL, output_references_json TEXT,
 failure_code TEXT, budget_before_json TEXT NOT NULL, budget_after_json TEXT NOT NULL, elapsed_ms INTEGER NOT NULL,
 PRIMARY KEY(run_id, sequence)
);
`;

export class ScoutLedger {
  constructor(file, { now = () => new Date().toISOString() } = {}) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file); this.db.exec(SQL);
    const columns = new Set(this.db.prepare("PRAGMA table_info(scout_runs)").all().map(({ name }) => name));
    if (!columns.has("research_request_json")) this.db.exec("ALTER TABLE scout_runs ADD COLUMN research_request_json TEXT");
    this.now = now; this.events = new Map();
  }
  start({ seed, provider, requested_model, prompt_version, action_schema_version, budget, research_request = null }) {
    const run_id = `scoutrun_${crypto.randomUUID().replaceAll("-", "")}`;
    this.db.prepare(`INSERT INTO scout_runs (
      run_id, seed_json, provider, requested_model, prompt_version, action_schema_version,
      started_at, finished_at, status, budget_json, counters_json,
      terminal_reason_codes_json, unresolved_work_json, research_request_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'running', ?, NULL, NULL, NULL, ?)` ).run(
      run_id, canonicalJson(seed), provider, requested_model, prompt_version, action_schema_version,
      this.now(), canonicalJson(budget), research_request ? canonicalJson(research_request) : null,
    );
    this.events.set(run_id, []); return run_id;
  }
  event(runId, eventType, normalized) {
    const events = this.events.get(runId) ?? this.loadEvents(runId);
    events.push({ event_type: eventType, normalized }); this.events.set(runId, events);
    const sequence = events.length;
    const fingerprint = traceFingerprint(events);
    this.db.prepare("INSERT INTO scout_events VALUES (?, ?, ?, ?, ?, ?)").run(runId, sequence, this.now(), eventType, canonicalJson(normalized), fingerprint);
    return fingerprint;
  }
  loadEvents(runId) {
    return this.db.prepare("SELECT event_type, normalized_json FROM scout_events WHERE run_id=? ORDER BY sequence").all(runId)
      .map(({ event_type, normalized_json }) => ({ event_type, normalized: JSON.parse(normalized_json) }));
  }
  fingerprint(runId, predicate = () => true) { return traceFingerprint((this.events.get(runId) ?? this.loadEvents(runId)).filter(predicate)); }
  attempt(runId, attempt) {
    this.db.prepare("INSERT INTO scout_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      runId, attempt.attempt_number, attempt.started_at, attempt.finished_at, attempt.status,
      attempt.requested_model, attempt.resolved_model ?? null, attempt.usage ? canonicalJson(attempt.usage) : null,
      attempt.action ? canonicalJson(attempt.action) : null, attempt.failure_code ?? null, attempt.restricted_trace_path ?? null,
    );
  }
  failAttempt(runId, attemptNumber, failureCode) {
    this.db.prepare("UPDATE scout_attempts SET status='invalid_agent_action', failure_code=? WHERE run_id=? AND attempt_number=?")
      .run(failureCode, runId, attemptNumber);
  }
  rejectAttempt(runId, attemptNumber, failureCode) {
    this.db.prepare("UPDATE scout_attempts SET status=?, failure_code=? WHERE run_id=? AND attempt_number=?")
      .run(failureCode, failureCode, runId, attemptNumber);
  }
  toolCall(runId, call) {
    const sequence = this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM scout_tool_calls WHERE run_id=?").get(runId).sequence;
    this.db.prepare("INSERT INTO scout_tool_calls VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      runId, sequence, call.name, call.version, call.started_at, call.finished_at,
      canonicalJson(call.input), call.status, call.output ? canonicalJson(call.output) : null,
      call.failure_code ?? null, canonicalJson(call.budget_before), canonicalJson(call.budget_after), call.elapsed_ms,
    );
  }
  packet(runId, ordinal, packetId, storageStatus, investigationStatus) {
    this.db.prepare("INSERT INTO scout_packets VALUES (?, ?, ?, ?, ?)").run(runId, ordinal, packetId, storageStatus, investigationStatus);
  }
  finish(runId, status, budget, reasons = [], unresolved = []) {
    this.db.prepare("UPDATE scout_runs SET finished_at=?, status=?, counters_json=?, terminal_reason_codes_json=?, unresolved_work_json=? WHERE run_id=?")
      .run(this.now(), status, canonicalJson(budget.consumed), canonicalJson(reasons), canonicalJson(unresolved), runId);
  }
  run(runId) { return this.db.prepare("SELECT * FROM scout_runs WHERE run_id=?").get(runId); }
  close() { this.db.close(); }
}
