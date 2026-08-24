import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sha } from "../librarian/lib.mjs";
import { openState } from "./state.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const cli = process.argv.slice(2);
const positional = cli.filter((arg) => !arg.startsWith("--"));
const option = (name, fallback) => cli.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const readmePath = positional[0];
const csvPath = positional[1];
const stateDir = path.resolve(option("state-dir", path.join(root, "var")));
if (!readmePath || !csvPath) throw new Error("Usage: node packages/maintainer/refresh.mjs <catalog.md> <startup.csv> [--state-dir=<path>]");

const started = new Date();
const runId = `refresh_${started.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${sha(`${started.toISOString()}\n${readmePath}\n${csvPath}`, 8)}`;
const snapshotsDir = path.join(stateDir, "snapshots");
const snapshotDir = path.join(snapshotsDir, runId);
const statePath = path.join(stateDir, "brokie-state.sqlite");
const latestPath = path.join(stateDir, "latest.json");
const currentPath = path.join(stateDir, "current.json");
fs.mkdirSync(snapshotsDir, { recursive: true });

const previousPointer = fs.existsSync(currentPath) ? JSON.parse(fs.readFileSync(currentPath, "utf8")) : null;
const previousStagingPath = previousPointer?.snapshot_dir ? path.join(previousPointer.snapshot_dir, "staging.json") : null;
const previous = previousStagingPath && fs.existsSync(previousStagingPath) ? JSON.parse(fs.readFileSync(previousStagingPath, "utf8")) : null;
const state = openState(statePath);
state.prepare(`INSERT INTO refresh_runs(run_id,started_at,status,previous_run_id,catalog_path,summary_json)
  VALUES(?,?,?,?,?,?)`).run(runId, started.toISOString(), "running", previousPointer?.run_id || null, snapshotDir, "{}");

function identity(record) {
  const url = String(record.source_url || "").trim().toLowerCase().replace(/\/$/, "");
  const name = String(record.source_name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${record.source_kind}|${name}|${url}`;
}

function material(record) {
  return {
    name: record.source_name,
    url: record.source_url,
    description: record.source_description,
    offer_detail: record.source_offer_detail,
    eligibility: record.source_eligibility,
    estimated_value_usd: record.estimated_value_usd,
    capabilities: record.annotations.capabilities.map((item) => item.id).sort(),
    needs: record.annotations.needs.map((item) => item.id).sort(),
  };
}

try {
  const built = spawnSync(process.execPath, [path.join(root, "packages", "librarian", "build.mjs"), path.resolve(readmePath), path.resolve(csvPath), `--output-dir=${snapshotDir}`], { encoding: "utf8" });
  if (built.status !== 0) throw new Error(`catalog build failed: ${built.stderr || built.stdout}`);
  const next = JSON.parse(fs.readFileSync(path.join(snapshotDir, "staging.json"), "utf8"));
  const beforeMap = new Map((previous?.records || []).map((record) => [identity(record), record]));
  const afterMap = new Map(next.records.map((record) => [identity(record), record]));
  const changes = [];
  for (const [key, after] of afterMap) {
    const before = beforeMap.get(key);
    if (!before) changes.push({ type: "added", identity_key: key, source_id: after.source_id, before: null, after: material(after) });
    else if (JSON.stringify(material(before)) !== JSON.stringify(material(after))) changes.push({ type: "changed", identity_key: key, source_id: after.source_id, before: material(before), after: material(after) });
  }
  for (const [key, before] of beforeMap) if (!afterMap.has(key)) changes.push({ type: "removed", identity_key: key, source_id: before.source_id, before: material(before), after: null });

  const initialLoad = !previous;
  const now = new Date().toISOString();
  const enqueue = state.prepare(`INSERT OR IGNORE INTO review_queue
    (review_id,fingerprint,run_id,item_type,identity_key,source_id,payload_json,reason,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  if (!initialLoad) for (const change of changes) {
    const fingerprint = sha(JSON.stringify(change), 32);
    enqueue.run(`review_${fingerprint.slice(0, 16)}`, fingerprint, runId, `catalog_${change.type}`, change.identity_key, change.source_id, JSON.stringify(change), `Catalog opportunity was ${change.type}; review before accepting the new state as trusted.`, now);
  }
  const summary = { run_id: runId, initial_load: initialLoad, records: next.records.length, added: changes.filter((item) => item.type === "added").length, changed: changes.filter((item) => item.type === "changed").length, removed: changes.filter((item) => item.type === "removed").length, review_items_added: initialLoad ? 0 : changes.length };
  fs.writeFileSync(path.join(snapshotDir, "changes.json"), `${JSON.stringify({ ...summary, changes }, null, 2)}\n`);
  const pointer = { run_id: runId, snapshot_dir: snapshotDir, catalog_db: path.join(snapshotDir, "brokie-v0.0.1.sqlite"), staging_json: path.join(snapshotDir, "staging.json") };
  fs.writeFileSync(latestPath, `${JSON.stringify(pointer, null, 2)}\n`);
  if (initialLoad) {
    const currentDir = path.join(stateDir, "current");
    fs.mkdirSync(currentDir, { recursive: true });
    for (const name of ["brokie-v0.0.1.sqlite", "staging.json", "build-summary.json", "changes.json"]) fs.copyFileSync(path.join(snapshotDir, name), path.join(currentDir, name));
    fs.writeFileSync(currentPath, `${JSON.stringify({ ...pointer, catalog_db: path.join(currentDir, "brokie-v0.0.1.sqlite"), staging_json: path.join(currentDir, "staging.json"), promoted_at: now, automatic_initial_baseline: true }, null, 2)}\n`);
  }
  state.prepare("UPDATE refresh_runs SET finished_at=?, status='complete', summary_json=? WHERE run_id=?").run(now, JSON.stringify(summary), runId);
  console.log(JSON.stringify({ ...summary, state_path: statePath, snapshot_dir: snapshotDir }, null, 2));
} catch (error) {
  state.prepare("UPDATE refresh_runs SET finished_at=?, status='failed', error=? WHERE run_id=?").run(new Date().toISOString(), error.message, runId);
  throw error;
} finally { state.close(); }
