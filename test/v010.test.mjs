import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createApi } from "../apps/api/server.mjs";

const root = path.resolve(import.meta.dirname, "..");
const temp = path.join(root, "test", "tmp", "v010");
assert.ok(temp.startsWith(path.join(root, "test", "tmp")), "refusing to clean an unexpected test path");
fs.rmSync(temp, { recursive: true, force: true });

function run(script, ...args) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${script} failed:\n${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

const csv = path.join(root, "test", "fixtures", "startup-offers.csv");
const first = run("packages/maintainer/refresh.mjs", path.join(root, "test", "fixtures", "free-for-dev.md"), csv, `--state-dir=${temp}`);
assert.equal(first.initial_load, true);
assert.equal(first.review_items_added, 0);
assert.equal(first.added, first.records, "initial identity count must not collapse distinct records");

const second = run("packages/maintainer/refresh.mjs", path.join(root, "test", "fixtures", "free-for-dev-v2.md"), csv, `--state-dir=${temp}`);
assert.equal(second.initial_load, false);
assert.equal(second.changed, 1);
assert.equal(second.added, 1);
assert.equal(second.removed, 0);
assert.equal(second.review_items_added, 2);

const statePath = path.join(temp, "brokie-state.sqlite");
const state = new DatabaseSync(statePath, { readOnly: true });
const openReviews = state.prepare("SELECT review_id FROM review_queue WHERE status='open' ORDER BY review_id").all();
assert.equal(openReviews.length, 2);
state.close();

run("packages/maintainer/review.mjs", "decide", openReviews[0].review_id, "accepted", "--note=fixture decision", `--state=${statePath}`);
const decidedState = new DatabaseSync(statePath, { readOnly: true });
assert.equal(decidedState.prepare("SELECT status FROM review_queue WHERE review_id=?").get(openReviews[0].review_id).status, "accepted");
decidedState.close();

const blockedPromotion = spawnSync(process.execPath, [path.join(root, "packages/maintainer/promote.mjs"), `--state-dir=${temp}`], { cwd: root, encoding: "utf8" });
assert.notEqual(blockedPromotion.status, 0, "promotion must be blocked while review items remain open");
run("packages/maintainer/review.mjs", "decide", openReviews[1].review_id, "accepted", "--note=fixture decision", `--state=${statePath}`);
const promoted = run("packages/maintainer/promote.mjs", `--state-dir=${temp}`);
assert.equal(promoted.status, "promoted");

const latest = JSON.parse(fs.readFileSync(path.join(temp, "latest.json"), "utf8"));
const server = createApi({ catalogPath: latest.catalog_db, statePath });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const health = await fetch(`${base}/health`).then((response) => response.json());
  assert.equal(health.status, "ok");
  const search = await fetch(`${base}/v1/opportunities?q=model&need=free-inference`).then((response) => response.json());
  assert.ok(search.count >= 1);
  assert.ok(search.data.every((item) => item.user_needs.some((need) => need.id === "free-inference")));
  assert.ok(search.data[0].raw_text && search.data[0].source_locator, "API must preserve inspectable evidence");
  const outcomeSearch = await fetch(`${base}/v1/opportunities?q=${encodeURIComponent("call AI model through API")}`).then((response) => response.json());
  assert.ok(outcomeSearch.count >= 1, "natural outcome words should match controlled need labels");
  const reviews = await fetch(`${base}/v1/reviews?status=open`).then((response) => response.json());
  assert.equal(reviews.count, 0);
  const writeAttempt = await fetch(`${base}/v1/opportunities`, { method: "POST" });
  assert.equal(writeAttempt.status, 405);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const jobTemp = path.join(root, "test", "tmp", "job");
fs.rmSync(jobTemp, { recursive: true, force: true });
fs.mkdirSync(jobTemp, { recursive: true });
fs.writeFileSync(path.join(jobTemp, "refresh.lock"), "occupied\n");
const lockedJob = spawnSync(process.execPath, [path.join(root, "packages/maintainer/job.mjs"), path.join(root, "test/fixtures/free-for-dev.md"), csv, `--state-dir=${jobTemp}`], { cwd: root, encoding: "utf8" });
assert.equal(lockedJob.status, 75, "concurrent unattended job should exit with temporary-failure status");
fs.unlinkSync(path.join(jobTemp, "refresh.lock"));
const job = run("packages/maintainer/job.mjs", path.join(root, "test/fixtures/free-for-dev.md"), csv, `--state-dir=${jobTemp}`);
assert.equal(job.initial_load, true);
assert.equal(fs.existsSync(path.join(jobTemp, "refresh.lock")), false, "job lock must be released");
assert.equal(fs.readFileSync(path.join(jobTemp, "logs", "refresh.ndjson"), "utf8").trim().split("\n").length, 1);

console.log(JSON.stringify({ status: "ok", refresh: second, api: "verified", review_decision: "verified" }, null, 2));
