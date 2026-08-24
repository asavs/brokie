import path from "node:path";
import { fileURLToPath } from "node:url";
import { openState } from "./state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const command = args[0] || "list";
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const statePath = path.resolve(option("state", path.join(root, "var", "brokie-state.sqlite")));
const db = openState(statePath);

try {
  if (command === "list") {
    const status = option("status", "open");
    const rows = db.prepare("SELECT review_id,item_type,identity_key,reason,status,created_at,decided_at,decision_note FROM review_queue WHERE status=? ORDER BY created_at,review_id").all(status);
    console.log(JSON.stringify({ status, count: rows.length, data: rows }, null, 2));
  } else if (command === "show") {
    const row = db.prepare("SELECT * FROM review_queue WHERE review_id=?").get(args[1]);
    if (!row) throw new Error(`Unknown review item: ${args[1]}`);
    console.log(JSON.stringify({ ...row, payload: JSON.parse(row.payload_json), payload_json: undefined }, null, 2));
  } else if (command === "decide") {
    const reviewId = args[1];
    const status = args[2];
    if (!reviewId || !["accepted", "rejected", "deferred"].includes(status)) throw new Error("Usage: review.mjs decide <review_id> <accepted|rejected|deferred> [--note=text]");
    const result = db.prepare("UPDATE review_queue SET status=?,decision_note=?,decided_at=? WHERE review_id=? AND status IN ('open','deferred')").run(status, option("note", ""), new Date().toISOString(), reviewId);
    if (!result.changes) throw new Error(`Review item not found or already finalized: ${reviewId}`);
    console.log(JSON.stringify({ review_id: reviewId, status }, null, 2));
  } else throw new Error("Commands: list, show <id>, decide <id> <status>");
} finally { db.close(); }
