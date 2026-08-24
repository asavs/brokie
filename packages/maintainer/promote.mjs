import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openState } from "./state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const stateDir = path.resolve(option("state-dir", path.join(root, "var")));
const latestPath = path.join(stateDir, "latest.json");
if (!fs.existsSync(latestPath)) throw new Error("No observed snapshot exists; run refresh first.");
const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
const db = openState(path.join(stateDir, "brokie-state.sqlite"));

try {
  const unresolved = db.prepare("SELECT review_id,status,item_type FROM review_queue WHERE run_id=? AND status!='accepted' ORDER BY review_id").all(latest.run_id);
  if (unresolved.length) throw new Error(`Snapshot cannot be promoted: ${unresolved.length} review item(s) are not accepted: ${unresolved.map((item) => `${item.review_id}:${item.status}`).join(", ")}`);
  const currentDir = path.join(stateDir, "current");
  fs.mkdirSync(currentDir, { recursive: true });
  for (const name of ["brokie-v0.0.1.sqlite", "staging.json", "build-summary.json", "changes.json"]) fs.copyFileSync(path.join(latest.snapshot_dir, name), path.join(currentDir, name));
  const promoted = { ...latest, catalog_db: path.join(currentDir, "brokie-v0.0.1.sqlite"), staging_json: path.join(currentDir, "staging.json"), promoted_at: new Date().toISOString(), automatic_initial_baseline: false };
  fs.writeFileSync(path.join(stateDir, "current.json"), `${JSON.stringify(promoted, null, 2)}\n`);
  console.log(JSON.stringify({ status: "promoted", run_id: latest.run_id, catalog_db: promoted.catalog_db }, null, 2));
} finally { db.close(); }
