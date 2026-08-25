import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { ArtifactStore, PacketStore } from "../packages/scout/store.mjs";
import { ScoutLedger } from "../packages/scout/ledger.mjs";
import { createPacketValidator } from "../packages/scout/validate-packet.mjs";
import { runScoutV01, ScriptedProvider, validateAction } from "../packages/scout/runner.mjs";
import { packetToLibrarianRecord } from "../packages/scout/adapter.mjs";
import { Budget } from "../packages/scout/budget.mjs";
import { createGitFileTools, createHttpTool, robotsAllows, validatePublicUrl } from "../packages/scout/tools.mjs";
import { acquisitionId, contentId, excerptId, packetId } from "../packages/scout/canonical.mjs";
import { generateDogfoodReport } from "../packages/scout/report.mjs";
import { createCatalogStore } from "../packages/catalog/store.mjs";
import { prepareSourceObservation } from "../packages/catalog/identity-plan.mjs";
import { openState } from "../packages/maintainer/state.mjs";
import { runLibrarianV01 } from "../packages/librarian/run-v0.1-core.mjs";

delete process.env.OPENROUTER_API_KEY; delete process.env.NVIDIA_NIM_API_KEY;

const temp = path.join(import.meta.dirname, "tmp", "scout-v01");
assert.ok(temp.startsWith(path.join(import.meta.dirname, "tmp")));
fs.rmSync(temp, { recursive: true, force: true }); fs.mkdirSync(temp, { recursive: true });
const repo = path.join(temp, "generic-repository"); fs.mkdirSync(repo);
const catalogText = `# Resource Ledger

- [Aster](https://aster.example/info) — compact hosted utility with a [changelog](https://aster.example/changelog).
- [Birch](https://birch.example/info) — API with [status](https://birch.example/missing).
- [Cedar](https://cedar.example/info) — gated documentation.
- [Dahlia](https://dahlia.example/start) — relocated service page.
- [Elm](https://elm.example/info) — also indexed by a [directory](https://directory.example/elm).
- **Fern** — source-only listing without a URL.
- [Grove](mailto:hello@grove.example) — unsupported contact link.
`;
fs.writeFileSync(path.join(repo, "OVERVIEW.md"), "# Overview\n\nA small repository with several documents.\n");
fs.writeFileSync(path.join(repo, "RESOURCES.md"), catalogText);
fs.writeFileSync(path.join(repo, "NOTES.md"), "# Notes\n\n- release notes\n- contributor notes\n");
fs.writeFileSync(path.join(repo, "LARGE.md"), `# Large generic catalog\n\n${Array.from({ length: 250 }, (_, index) => `- [Resource ${String(index).padStart(3, "0")}](https://resource-${index}.example/info) — generic listing.`).join("\n")}\n`);
execFileSync("git", ["init", "-q"], { cwd: repo }); execFileSync("git", ["add", "."], { cwd: repo });
execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-q", "-m", "fixture"], { cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: "2026-08-24T00:00:00Z", GIT_COMMITTER_DATE: "2026-08-24T00:00:00Z" } });
const fixtureRepository = { root: repo, revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), commit_time: "2026-08-24T00:00:00Z", remote: "", tracked: ["LARGE.md", "NOTES.md", "OVERVIEW.md", "RESOURCES.md"] };

const response = (status, body, headers = {}) => new Response(body, { status, headers });
const calls = [];
async function transport(url) {
  calls.push(url);
  const parsed = new URL(url);
  if (parsed.pathname === "/robots.txt") {
    return response(200, parsed.hostname === "cedar.example" ? "User-agent: *\nDisallow: /info\n" : "User-agent: *\nDisallow:\n", { "content-type": "text/plain" });
  }
  if (url === "https://aster.example/info") return response(200, "Aster evidence: a durable public allowance.", { "content-type": "text/plain", "last-modified": "Sun, 23 Aug 2026 00:00:00 GMT" });
  if (url === "https://birch.example/info") return response(200, "Birch evidence: an included monthly unit.", { "content-type": "text/html" });
  if (url === "https://birch.example/missing") return response(404, "missing", { "content-type": "text/plain" });
  if (url === "https://dahlia.example/start") return response(302, "", { location: "/final", "content-type": "text/plain" });
  if (url === "https://dahlia.example/final") return response(200, "Dahlia evidence after redirect.", { "content-type": "text/plain" });
  if (url === "https://elm.example/info") return response(200, "Elm first-party evidence.", { "content-type": "text/plain" });
  if (url === "https://directory.example/elm") return response(200, "Directory statement about Elm.", { "content-type": "text/html" });
  throw new Error(`unmocked network attempt: ${url}`);
}
const lookup = async () => [{ address: "203.0.113.7", family: 4 }];
const actions = [
  { type: "list_files", cursor: 0 }, { type: "read_markdown", path: "RESOURCES.md" },
  (context) => {
    const markdown = context.observations.findLast((item) => item.type === "markdown");
    return { type: "select_listings", listings: markdown.listing_candidates.slice(0, 5).map((item, index) => ({ artifact_id: markdown.artifact_id, start_byte: item.start_byte, end_byte: item.end_byte, source_label: item.source_label, selection_reason: `structural sample ${index + 1}`, primary_link_index: 0 })) };
  },
  { type: "investigate_link", listing_index: 0, link_index: 0 },
  { type: "investigate_link", listing_index: 1, link_index: 0 }, { type: "investigate_link", listing_index: 1, link_index: 1 },
  { type: "investigate_link", listing_index: 2, link_index: 0 }, { type: "investigate_link", listing_index: 3, link_index: 0 },
  { type: "investigate_link", listing_index: 4, link_index: 0 }, { type: "investigate_link", listing_index: 4, link_index: 1 }, { type: "finalize" },
];
actions.splice(actions.length - 1, 0, { type: "skip_link", listing_index: 0, link_index: 1, reason_code: "other" });
const budgets = { max_requests: 20, max_pages: 15, max_bytes: 3000000, max_elapsed_ms: 180000, max_inference_calls: 16, max_depth: 1 };
const stateRoot = path.join(temp, "state"); const artifactStore = new ArtifactStore(stateRoot);
const validator = createPacketValidator(artifactStore); const packetStore = new PacketStore(stateRoot, validator);
const ledger = new ScoutLedger(path.join(stateRoot, "scout.sqlite"));
const run = () => runScoutV01({ seed: { kind: "git", locator: repo }, provider: new ScriptedProvider(actions), artifactStore, packetStore, ledger, budgets, target_packet_count: 5, transport, lookup });
const first = await run(), firstDispatches = calls.length, second = await run();
assert.equal(first.packets.length, 5); assert.equal(second.packets.length, 5);
assert.deepEqual(first.packets.map((x) => x.packet.packet_id), second.packets.map((x) => x.packet.packet_id));
assert.deepEqual(first.packets.map((x) => x.packet.investigation.status), ["partial", "partial", "blocked", "complete", "complete"]);
assert.ok(first.packets[4].packet.followed_pages.some((x) => x.authority.level === "linked_third_party"));
assert.ok(second.packets.every((x) => x.storage_status === "reused"));
assert.ok(firstDispatches <= budgets.max_requests); assert.ok(calls.length - firstDispatches <= budgets.max_requests);
assert.equal(ledger.db.prepare("SELECT COUNT(*) count FROM scout_runs").get().count, 2);
assert.equal(ledger.db.prepare("SELECT COUNT(DISTINCT packet_id) count FROM scout_packets").get().count, 5);
assert.ok(ledger.db.prepare("SELECT COUNT(*) count FROM scout_tool_calls WHERE started_at IS NOT NULL AND finished_at IS NOT NULL AND budget_before_json IS NOT NULL AND budget_after_json IS NOT NULL").get().count > 0);
assert.ok(["listing_candidates_discovered", "listings_selected", "link_followed", "link_skipped"].every((type) => ledger.db.prepare("SELECT COUNT(*) count FROM scout_events WHERE event_type=?").get(type).count > 0));
assert.equal(fs.readdirSync(path.join(stateRoot, "packets"), { recursive: true }).filter((name) => String(name).endsWith(".json")).length, 5);
for (const { packet } of first.packets) validator(packet);

const record1 = packetToLibrarianRecord(first.packets[0].packet, artifactStore), record2 = packetToLibrarianRecord(second.packets[0].packet, artifactStore);
assert.deepEqual(record1, record2); assert.equal(record1.source_kind, "repository"); assert.doesNotMatch(JSON.stringify(first.packets[0].packet), /product_id|opportunity_id|capabilit|entitlement|canonical_match/i);

function reseal(packet, { preserveOrigin = false } = {}) {
  const excerptMap = new Map();
  for (const excerpt of packet.excerpts) { const old = excerpt.excerpt_id; excerpt.excerpt_id = excerptId(excerpt); excerptMap.set(old, excerpt.excerpt_id); }
  const acquisitions = [packet.listing, ...packet.followed_pages, ...packet.skipped_links.map((item) => item.acquisition)];
  for (const acquisition of acquisitions) {
    acquisition.excerpt_ids = acquisition.excerpt_ids.map((id) => excerptMap.get(id) ?? id);
    acquisition.authority.excerpt_ids = acquisition.authority.excerpt_ids.map((id) => excerptMap.get(id) ?? id);
  }
  for (const uncertainty of packet.uncertainties) uncertainty.excerpt_ids = uncertainty.excerpt_ids.map((id) => excerptMap.get(id) ?? id);
  for (const followed of packet.followed_pages) {
    const copy = structuredClone(followed.link); delete copy.link_id; followed.link.link_id = contentId("link", copy);
    if (!preserveOrigin) followed.originating_link_id = followed.link.link_id;
  }
  for (const skipped of packet.skipped_links) {
    const copy = structuredClone(skipped.link); delete copy.link_id; skipped.link.link_id = contentId("link", copy);
    if (!preserveOrigin) skipped.acquisition.originating_link_id = skipped.link.link_id;
  }
  const acquisitionMap = new Map(), oldListing = packet.listing.acquisition_id;
  packet.listing.acquisition_id = acquisitionId(packet.listing); acquisitionMap.set(oldListing, packet.listing.acquisition_id);
  for (const acquisition of [...packet.followed_pages, ...packet.skipped_links.map((item) => item.acquisition)]) {
    const old = acquisition.acquisition_id;
    if (acquisition.parent_acquisition_id === oldListing) acquisition.parent_acquisition_id = packet.listing.acquisition_id;
    acquisition.acquisition_id = acquisitionId(acquisition); acquisitionMap.set(old, acquisition.acquisition_id);
  }
  for (const timestamp of packet.provenance.source_timestamps) timestamp.acquisition_id = acquisitionMap.get(timestamp.acquisition_id) ?? timestamp.acquisition_id;
  packet.packet_id = packetId(packet); return packet;
}
function rejected(label, mutator, pattern, options) { const value = structuredClone(first.packets[0].packet); mutator(value); reseal(value, options); assert.throws(() => validator(value), pattern, label); }
rejected("offset", (p) => { p.excerpts[0].start_byte += 1; }, /excerpt text mismatch/);
rejected("text", (p) => { p.excerpts[0].text += "x"; }, /excerpt text mismatch/);
rejected("missing artifact", (p) => { p.excerpts[0].artifact_id = `art_sha256_${"0".repeat(64)}`; }, /missing or corrupt artifact/);
rejected("orphan", (p) => { const orphan = { ...structuredClone(p.excerpts[0]), role: "authority_signal", excerpt_id: "" }; orphan.excerpt_id = excerptId(orphan); p.excerpts.push(orphan); }, /orphan excerpt/);
rejected("listing substitution", (p) => { p.listing = structuredClone(p.followed_pages[0]); }, /listing must be a depth-0 acquired investigated artifact/);
rejected("invented source label", (p) => { p.subject.source_label = "Not present in the listing"; }, /source_label must equal the exact label/);
rejected("budget overflow", (p) => { p.provenance.budget.consumed.pages = p.provenance.budget.configured.max_pages + 1; }, /budget pages exceeds/);
rejected("unknown originating link", (p) => { p.followed_pages[0].originating_link_id = `link_sha256_${"0".repeat(64)}`; }, /preserve its originating Link/, { preserveOrigin: true });
rejected("mutated link", (p) => { p.followed_pages[0].link.label = "invented"; }, /link does not resolve exactly/);
rejected("unknown timestamp acquisition", (p) => { p.provenance.source_timestamps[0].acquisition_id = `acq_sha256_${"0".repeat(64)}`; }, /timestamp references unknown/);
rejected("incoherent acquisition state", (p) => { p.followed_pages[0].status = "failed"; p.followed_pages[0].artifact_id = null; p.followed_pages[0].failure = { code: "http_error", detail: "" }; }, /blocked or failed acquisition must have blocked depth state/);
rejected("depth-0 parent", (p) => { p.listing.parent_acquisition_id = `acq_sha256_${"1".repeat(64)}`; }, /depth-0 listing cannot have parent/);
rejected("listing authority", (p) => { p.listing.authority = { level: "unknown", basis: "unknown", excerpt_ids: [] }; }, /authority must be collection\/seed/);
rejected("unknown tool provenance", (p) => { p.provenance.tools_used.push({ name: "shell.exec", version: "1" }); }, /unknown Scout tool capability/);
rejected("followed authority", (p) => { p.followed_pages[0].authority = { level: "unknown", basis: "unknown", excerpt_ids: [] }; }, /authority is incoherent/);
rejected("timestamp kind", (p) => { p.provenance.source_timestamps[0].kind = "http_last_modified"; }, /Last-Modified must reference acquired HTTP content/);
rejected("unsafe selection reason", (p) => { p.subject.selection_reason = "looks valid```powershell"; }, /safe single-line text/);
const corruptId = first.packets[0].packet.excerpts[0].artifact_id, corruptPath = artifactStore.paths(corruptId).body, original = fs.readFileSync(corruptPath);
fs.writeFileSync(corruptPath, Buffer.concat([original, Buffer.from("x")])); assert.throws(() => validator(first.packets[0].packet), /corrupt artifact/); fs.writeFileSync(corruptPath, original);

for (const [kind, maximum, code] of [["request", "max_requests", "budget_request_exhausted"], ["page", "max_pages", "budget_page_exhausted"], ["byte", "max_bytes", "budget_byte_exhausted"], ["inference", "max_inference_calls", "budget_inference_exhausted"]]) {
  const small = new Budget({ ...budgets, [maximum]: 1 }); small.reserve(kind); assert.throws(() => small.reserve(kind), new RegExp(code));
}
assert.throws(() => new Budget(budgets).depth(2), /depth_exceeded/);
let clock = 0; const timed = new Budget({ ...budgets, max_elapsed_ms: 1 }, () => clock); clock = 1; assert.throws(() => timed.checkTime(), /budget_time_exhausted/);
function countingFileSystem(overrides = {}) { const counts = { opens: 0, reads: 0 }; return { counts, realpathSync: fs.realpathSync, lstatSync: fs.lstatSync, openSync(...args) { counts.opens += 1; return fs.openSync(...args); }, fstatSync: fs.fstatSync, readSync(...args) { counts.reads += 1; return fs.readSync(...args); }, closeSync: fs.closeSync, ...overrides }; }
const fileBudget = new Budget({ ...budgets, max_pages: 1 }), fileFs = countingFileSystem(), boundedFiles = createGitFileTools({ repository: fixtureRepository, artifactStore, budget: fileBudget, fileSystem: fileFs });
boundedFiles.readFile("RESOURCES.md"); await assert.rejects(async () => boundedFiles.readFile("OVERVIEW.md"), /budget_page_exhausted/); assert.equal(fileFs.counts.opens, 1);
const byteFileFs = countingFileSystem(), byteFiles = createGitFileTools({ repository: fixtureRepository, artifactStore, budget: new Budget({ ...budgets, max_bytes: 1 }), fileSystem: byteFileFs });
assert.throws(() => byteFiles.readFile("RESOURCES.md"), /budget_byte_exhausted/); assert.equal(byteFileFs.counts.opens, 0);
let growthReads = 0; const growthFs = countingFileSystem({ fstatSync(handle) { const stat = fs.fstatSync(handle); return { ...stat, size: stat.size + 1, isFile: () => true }; }, readSync(...args) { growthReads += 1; return fs.readSync(...args); } });
const growthFiles = createGitFileTools({ repository: fixtureRepository, artifactStore, budget: new Budget(budgets), fileSystem: growthFs }); assert.throws(() => growthFiles.readFile("RESOURCES.md"), /content_too_large/); assert.equal(growthReads, 0);
let fileClock = 0; const timedFileFs = countingFileSystem(), timedFiles = createGitFileTools({ repository: fixtureRepository, artifactStore, budget: new Budget({ ...budgets, max_elapsed_ms: 1 }, () => fileClock), fileSystem: timedFileFs }); fileClock = 1; assert.throws(() => timedFiles.readFile("RESOURCES.md"), /budget_time_exhausted/); assert.equal(timedFileFs.counts.opens, 0);
await assert.rejects(() => validatePublicUrl("http://127.0.0.1/x"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://169.254.169.254/latest"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://[::1]/x"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://[::ffff:7f00:1]/x"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://[fe80::1]/x"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://user:pass@example.test/"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("file:///tmp/x"), /unsupported_scheme/);
let redirects = 0; const redirectBudget = new Budget({ ...budgets, max_requests: 2 }); const redirectTool = createHttpTool({ artifactStore, budget: redirectBudget, lookup, transport: async (url) => { redirects += 1; return url.endsWith("robots.txt") ? response(200, "", { "content-type": "text/plain" }) : response(302, "", { location: "http://127.0.0.1/private" }); } });
await assert.rejects(() => redirectTool.fetch("https://safe.example/start", { depth: 0, kind: "http_seed", authority: { level: "collection", basis: "seed", excerpt_ids: [] } }), /ssrf_blocked/); assert.equal(redirects, 2);
const collectionAuthority = { level: "collection", basis: "seed", excerpt_ids: [] };
const linkAuthority = { level: "linked_first_party", basis: "same_origin", excerpt_ids: [] };
let requestLimitedCalls = 0;
const requestLimited = createHttpTool({ artifactStore, budget: new Budget({ ...budgets, max_requests: 1 }), lookup, transport: async () => { requestLimitedCalls += 1; return response(200, "", { "content-type": "text/plain" }); } });
await assert.rejects(() => requestLimited.fetch("https://request-limit.example/page", { depth: 0, kind: "http_seed", authority: collectionAuthority }), /budget_request_exhausted/); assert.equal(requestLimitedCalls, 1);
let pageLimitedCalls = 0; const pageLimitedBudget = new Budget({ ...budgets, max_pages: 1 });
const pageLimited = createHttpTool({ artifactStore, budget: pageLimitedBudget, lookup, transport: async (url) => { pageLimitedCalls += 1; return response(200, url.endsWith("robots.txt") ? "" : "page", { "content-type": "text/plain" }); } });
await pageLimited.fetch("https://page-limit.example/one", { depth: 0, kind: "http_seed", authority: collectionAuthority });
await assert.rejects(() => pageLimited.fetch("https://page-limit.example/two", { depth: 0, kind: "http_seed", authority: collectionAuthority }), /budget_page_exhausted/); assert.equal(pageLimitedCalls, 2);
let streamCancelled = false, byteCalls = 0;
const byteLimited = createHttpTool({ artifactStore, budget: new Budget({ ...budgets, max_bytes: 3 }), lookup, transport: async (url) => { byteCalls += 1; if (url.endsWith("robots.txt")) return response(200, "", { "content-type": "text/plain" }); return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.enqueue(new Uint8Array([4])); }, cancel() { streamCancelled = true; } }), { status: 200, headers: { "content-type": "text/plain" } }); } });
await assert.rejects(() => byteLimited.fetch("https://byte-limit.example/page", { depth: 0, kind: "http_seed", authority: collectionAuthority }), /budget_byte_exhausted/); assert.equal(byteCalls, 2); assert.equal(streamCancelled, true);
let timeCancelled = false;
const timeLimited = createHttpTool({ artifactStore, budget: new Budget({ ...budgets, max_elapsed_ms: 25 }), lookup, transport: async (url) => url.endsWith("robots.txt") ? response(200, "", { "content-type": "text/plain" }) : new Response(new ReadableStream({ cancel() { timeCancelled = true; } }), { status: 200, headers: { "content-type": "text/plain" } }) });
await assert.rejects(() => timeLimited.fetch("https://time-limit.example/page", { depth: 0, kind: "http_seed", authority: collectionAuthority }), (error) => error.code === "budget_time_exhausted"); assert.equal(timeCancelled, true);
const nativeAbortRoot = path.join(temp, "native-abort"), nativeAbortLedger = new ScoutLedger(path.join(nativeAbortRoot, "ledger.sqlite")), nativeAbortBudget = new Budget(budgets);
const nativeAbortRun = nativeAbortLedger.start({ seed: { kind: "web", locator: "https://native-abort.example/page" }, provider: "fixture", requested_model: "fixture/free", prompt_version: "test", action_schema_version: "test", budget: budgets });
const nativeAbortTool = createHttpTool({ artifactStore, budget: nativeAbortBudget, lookup, ledger: nativeAbortLedger, runId: nativeAbortRun, transport: async (url) => {
  if (url.endsWith("robots.txt")) return response(200, "", { "content-type": "text/plain" });
  throw new DOMException("aborted", "AbortError");
} });
await assert.rejects(() => nativeAbortTool.fetch("https://native-abort.example/page", { depth: 0, kind: "http_seed", authority: collectionAuthority }), (error) => error.code === "fetch_timeout" && error.code !== 20);
const nativeAbortCall = nativeAbortLedger.db.prepare("SELECT status,failure_code FROM scout_tool_calls WHERE run_id=?").get(nativeAbortRun);
assert.deepEqual([nativeAbortCall.status, nativeAbortCall.failure_code], ["failed", "fetch_timeout"]);
assert.equal(JSON.parse(nativeAbortLedger.db.prepare("SELECT normalized_json FROM scout_events WHERE run_id=? AND event_type='tool'").get(nativeAbortRun).normalized_json).failure_code, "fetch_timeout"); nativeAbortLedger.close();
let depthCalls = 0; const depthLimited = createHttpTool({ artifactStore, budget: new Budget(budgets), lookup, transport: async () => { depthCalls += 1; return response(200, ""); } });
await assert.rejects(() => depthLimited.fetch("https://depth.example/page", { depth: 2, kind: "http_link", authority: linkAuthority }), /depth_exceeded/); assert.equal(depthCalls, 0);
assert.equal(robotsAllows("User-agent: *\nDisallow: /\nAllow: /public/", "/public/item"), true);
assert.equal(robotsAllows("User-agent: *\nAllow: /\nUser-agent: Brokie-Scout\nDisallow: /private\nAllow: /private/open", "/private/closed"), false);
assert.equal(robotsAllows("User-agent: *\nDisallow: /same\nAllow: /same", "/same"), true);
let robots5xxCalls = 0; const robots5xx = createHttpTool({ artifactStore, budget: new Budget(budgets), lookup, transport: async () => { robots5xxCalls += 1; return response(503, "temporary", { "content-type": "text/plain" }); } });
await assert.rejects(() => robots5xx.fetch("https://robots-5xx.example/page", { depth: 0, kind: "http_seed", authority: collectionAuthority }), /http_error/); assert.equal(robots5xxCalls, 1);
let robotsRedirectCalls = 0; const robotsRedirect = createHttpTool({ artifactStore, budget: new Budget(budgets), lookup, transport: async () => { robotsRedirectCalls += 1; return response(302, "", { location: "http://127.0.0.1/robots.txt", "content-type": "text/plain" }); } });
await assert.rejects(() => robotsRedirect.fetch("https://robots-redirect.example/page", { depth: 0, kind: "http_seed", authority: collectionAuthority }), /ssrf_blocked/); assert.equal(robotsRedirectCalls, 1);
let cacheCalls = 0; const cacheBudget = new Budget(budgets); const cacheTool = createHttpTool({ artifactStore, budget: cacheBudget, lookup, transport: async (url) => { cacheCalls += 1; return response(200, url.endsWith("robots.txt") ? "" : "shared", { "content-type": "text/plain" }); } });
const cachedA = await cacheTool.fetch("https://cache.example/shared", { depth: 1, kind: "http_link", parent_acquisition_id: `acq_sha256_${"1".repeat(64)}`, originating_link_id: `link_sha256_${"1".repeat(64)}`, authority: linkAuthority }); const afterA = cacheBudget.snapshot();
const cachedB = await cacheTool.fetch("https://cache.example/shared", { depth: 1, kind: "http_link", parent_acquisition_id: `acq_sha256_${"2".repeat(64)}`, originating_link_id: `link_sha256_${"2".repeat(64)}`, authority: { level: "linked_third_party", basis: "cross_origin", excerpt_ids: [] } });
assert.equal(cacheCalls, 2); assert.deepEqual(cacheBudget.snapshot(), afterA); assert.notEqual(cachedA.acquisition_id, cachedB.acquisition_id); assert.notEqual(cachedA.parent_acquisition_id, cachedB.parent_acquisition_id); assert.notDeepEqual(cachedA.authority, cachedB.authority);

const webRoot = path.join(temp, "web-state"), webArtifacts = new ArtifactStore(webRoot), webLedger = new ScoutLedger(path.join(webRoot, "ledger.sqlite"));
const webPackets = new PacketStore(webRoot, createPacketValidator(webArtifacts));
const webTransport = async (url) => {
  if (url.endsWith("/robots.txt")) return response(200, "User-agent: *\nDisallow:\n", { "content-type": "text/plain" });
  if (url === "https://catalog.example/resources") return response(200, "<ul><li><a href=\"/detail\">Quartz</a> — static resource.</li></ul>", { "content-type": "text/html" });
  if (url === "https://catalog.example/detail") return response(200, "Quartz linked evidence.", { "content-type": "text/plain", "last-modified": "not a valid HTTP date" });
  throw new Error(`unmocked network attempt: ${url}`);
};
const webProvider = new ScriptedProvider([
  (context) => { const seedPage = context.observations.find((x) => x.type === "web_seed"), boundary = seedPage.listing_candidates[0]; return { type: "select_listings", listings: [{ artifact_id: seedPage.artifact_id, ...boundary, selection_reason: "HTML list boundary", primary_link_index: 0 }] }; },
  { type: "investigate_link", listing_index: 0, link_index: 0 }, { type: "finalize" },
]);
const webRun = await runScoutV01({ seed: { kind: "web", locator: "https://catalog.example/resources" }, provider: webProvider, artifactStore: webArtifacts, packetStore: webPackets, ledger: webLedger, budgets: { ...budgets, max_inference_calls: 3 }, target_packet_count: 1, transport: webTransport, lookup });
assert.equal(webRun.packets.length, 1); assert.equal(webRun.packets[0].packet.listing.kind, "http_seed"); assert.equal(webRun.packets[0].packet.investigation.status, "complete");
assert.deepEqual(webRun.packets[0].packet.provenance.source_timestamps, []);
assert.deepEqual(webRun.packets[0].packet.provenance.tools_used.map((tool) => tool.name), ["http.fetch", "markdown.inspect", "link.inspect"]); webLedger.close();

const largeState = scoutState("large-context"), largeProvider = new ScriptedProvider([
  { type: "list_files", cursor: 0 }, { type: "read_markdown", path: "LARGE.md" },
  (context) => {
    const markdown = context.observations.findLast((item) => item.type === "markdown");
    assert.equal(markdown.listing_candidate_count, 250); assert.equal(markdown.listing_candidates.length, 40);
    assert.equal(markdown.candidate_links.length, 40); assert.ok(markdown.candidate_links.flatMap((item) => item.links).length <= 160);
    return { type: "select_listings", listings: markdown.listing_candidates.slice(0, 5).map((item) => ({ artifact_id: markdown.artifact_id, start_byte: item.start_byte, end_byte: item.end_byte, source_label: item.source_label, selection_reason: "bounded structural sample", primary_link_index: 0 })) };
  },
  { type: "finalize" },
]);
const largeRun = await runScoutV01({ seed: { kind: "git", locator: repo }, provider: largeProvider, artifactStore: largeState.artifacts, packetStore: largeState.packets, ledger: largeState.scoutLedger, budgets, target_packet_count: 5, transport, lookup });
assert.equal(largeRun.packets.length, 5); assert.ok(largeRun.packets.every(({ packet }) => packet.investigation.status === "blocked")); largeState.scoutLedger.close();

assert.throws(() => validateAction({ type: "list_files", cursor: -1 }), /invalid_agent_action/);
assert.throws(() => validateAction({ type: "skip_link", listing_index: 0, link_index: 0, reason_code: "invented" }), /invalid_agent_action/);
assert.throws(() => validateAction({ type: "select_listings", listings: [{ artifact_id: `art_sha256_${"0".repeat(64)}`, start_byte: 0, end_byte: 1, source_label: "", selection_reason: "x", primary_link_index: 0 }] }), /invalid_agent_action/);
for (const hostile of ["line one\nline two", "```powershell", "api_key=do-not-render"]) assert.throws(() => validateAction({ type: "select_listings", listings: [{ artifact_id: `art_sha256_${"0".repeat(64)}`, start_byte: 0, end_byte: 1, source_label: "valid", selection_reason: hostile, primary_link_index: 0 }] }), /invalid_agent_action/);
assert.throws(() => validateAction({ type: "select_listings", listings: [{ artifact_id: `art_sha256_${"0".repeat(64)}`, start_byte: 0, end_byte: 1, source_label: "line one\nline two", selection_reason: "valid", primary_link_index: 0 }] }), /invalid_agent_action/);

function scoutState(name) { const root = path.join(temp, name), artifacts = new ArtifactStore(root), scoutLedger = new ScoutLedger(path.join(root, "ledger.sqlite")); return { root, artifacts, scoutLedger, packets: new PacketStore(root, createPacketValidator(artifacts)) }; }
const atomicState = scoutState("atomic-selection");
const corruptSecondSelection = (context) => { const action = actions[2](context); action.listings[1].source_label = `${action.listings[1].source_label} corrupted`; return action; };
const atomicProvider = new ScriptedProvider([...actions.slice(0, 2), corruptSecondSelection, actions[2], { type: "finalize" }]);
const atomicRun = await runScoutV01({ seed: { kind: "git", locator: repo }, provider: atomicProvider, artifactStore: atomicState.artifacts, packetStore: atomicState.packets, ledger: atomicState.scoutLedger, budgets, target_packet_count: 5, transport, lookup });
assert.equal(atomicRun.status, "blocked"); assert.equal(atomicRun.packets.length, 5); assert.ok(atomicRun.packets.every(({ packet }) => packet.investigation.status === "blocked"));
assert.equal(atomicState.scoutLedger.db.prepare("SELECT COUNT(*) count FROM scout_events WHERE run_id=? AND event_type='listings_selected'").get(atomicRun.run_id).count, 1);
const atomicAttempt = atomicState.scoutLedger.db.prepare("SELECT status,failure_code FROM scout_attempts WHERE run_id=? AND attempt_number=3").get(atomicRun.run_id);
assert.deepEqual([atomicAttempt.status, atomicAttempt.failure_code], ["invalid_agent_action", "invalid_agent_action"]); atomicState.scoutLedger.close();

const duplicateState = scoutState("duplicate-link-actions"), duplicateProvider = new ScriptedProvider([...actions.slice(0, 3),
  { type: "investigate_link", listing_index: 0, link_index: 0 }, { type: "investigate_link", listing_index: 0, link_index: 0 },
  { type: "skip_link", listing_index: 0, link_index: 1, reason_code: "other" }, { type: "skip_link", listing_index: 0, link_index: 1, reason_code: "other" }, { type: "finalize" },
]);
const duplicateRun = await runScoutV01({ seed: { kind: "git", locator: repo }, provider: duplicateProvider, artifactStore: duplicateState.artifacts, packetStore: duplicateState.packets, ledger: duplicateState.scoutLedger, budgets, target_packet_count: 5, transport, lookup });
assert.equal(duplicateRun.packets.length, 5); assert.equal(duplicateRun.packets[0].packet.followed_pages.length, 1); assert.equal(duplicateRun.packets[0].packet.skipped_links.length, 1);
assert.deepEqual(duplicateState.scoutLedger.db.prepare("SELECT attempt_number,status,failure_code FROM scout_attempts WHERE run_id=? AND failure_code='invalid_agent_action' ORDER BY attempt_number").all(duplicateRun.run_id).map((row) => [row.attempt_number, row.status, row.failure_code]), [[5, "invalid_agent_action", "invalid_agent_action"], [7, "invalid_agent_action", "invalid_agent_action"]]); duplicateState.scoutLedger.close();

const failureState = scoutState("provider-failure"); const selectionProvider = new ScriptedProvider(actions.slice(0, 3)); let selectionCalls = 0;
const failAfterSelection = { provider: "scripted", model: "scripted/free", async complete(messages, options) { selectionCalls += 1; if (selectionCalls <= 3) return selectionProvider.complete(messages, options); throw Object.assign(new Error("provider unavailable"), { code: "provider_error" }); } };
const preserved = await runScoutV01({ seed: { kind: "git", locator: repo }, provider: failAfterSelection, artifactStore: failureState.artifacts, packetStore: failureState.packets, ledger: failureState.scoutLedger, budgets, target_packet_count: 5, transport, lookup });
assert.equal(selectionCalls, 4); assert.equal(preserved.status, "blocked"); assert.equal(preserved.packets.length, 5); assert.ok(preserved.packets.every(({ packet }) => packet.investigation.status === "blocked" && packet.investigation.reason_codes.includes("provider_error"))); failureState.scoutLedger.close();

const invalidState = scoutState("invalid-actions"), invalidProvider = new ScriptedProvider([{ type: "list_files", cursor: -1 }, { type: "skip_link", listing_index: -1, link_index: 0, reason_code: "other" }]);
const invalidRun = await runScoutV01({ seed: { kind: "git", locator: repo }, provider: invalidProvider, artifactStore: invalidState.artifacts, packetStore: invalidState.packets, ledger: invalidState.scoutLedger, budgets, target_packet_count: 5, transport, lookup });
assert.equal(invalidProvider.calls, 2); assert.equal(invalidRun.status, "failed");
const invalidLedgerRun = invalidState.scoutLedger.run(invalidRun.run_id); assert.equal(invalidLedgerRun.status, "failed"); assert.deepEqual(JSON.parse(invalidLedgerRun.terminal_reason_codes_json), ["invalid_agent_action", "invalid_agent_action"]);
assert.deepEqual(invalidState.scoutLedger.db.prepare("SELECT status,failure_code FROM scout_attempts WHERE run_id=? ORDER BY attempt_number").all(invalidRun.run_id).map((row) => [row.status, row.failure_code]), [["invalid_agent_action", "invalid_agent_action"], ["invalid_agent_action", "invalid_agent_action"]]); invalidState.scoutLedger.close();

const inferenceState = scoutState("inference-limit"), inferenceProvider = new ScriptedProvider(actions);
const inferenceRun = await runScoutV01({ seed: { kind: "git", locator: repo }, provider: inferenceProvider, artifactStore: inferenceState.artifacts, packetStore: inferenceState.packets, ledger: inferenceState.scoutLedger, budgets: { ...budgets, max_inference_calls: 1 }, target_packet_count: 5, transport, lookup });
assert.equal(inferenceProvider.calls, 1); assert.equal(inferenceRun.status, "failed"); inferenceState.scoutLedger.close();

const timeState = scoutState("provider-time"), timeProvider = { provider: "stall", model: "stall/free", calls: 0, aborted: false, complete(_messages, { signal }) { this.calls += 1; return new Promise((resolve, reject) => signal.addEventListener("abort", () => { this.aborted = true; reject(Object.assign(new Error("budget_time_exhausted"), { code: "budget_time_exhausted" })); }, { once: true })); } };
const timedRun = await runScoutV01({ seed: { kind: "git", locator: repo }, provider: timeProvider, artifactStore: timeState.artifacts, packetStore: timeState.packets, ledger: timeState.scoutLedger, budgets: { ...budgets, max_elapsed_ms: 25 }, target_packet_count: 5, transport, lookup, repositoryInspector() { return fixtureRepository; } });
assert.equal(timeProvider.calls, 1); assert.equal(timeProvider.aborted, true); assert.equal(timedRun.status, "failed");
const timedLedgerRun = timeState.scoutLedger.run(timedRun.run_id), timedAttempt = timeState.scoutLedger.db.prepare("SELECT status,failure_code FROM scout_attempts WHERE run_id=?").get(timedRun.run_id);
assert.deepEqual(JSON.parse(timedLedgerRun.terminal_reason_codes_json), ["budget_time_exhausted"]); assert.deepEqual([timedAttempt.status, timedAttempt.failure_code], ["budget_time_exhausted", "budget_time_exhausted"]); timeState.scoutLedger.close();

const repositoryState = scoutState("repository-failure");
const repositoryFailure = await runScoutV01({ seed: { kind: "git", locator: repo }, provider: new ScriptedProvider(actions), artifactStore: repositoryState.artifacts, packetStore: repositoryState.packets, ledger: repositoryState.scoutLedger, budgets, target_packet_count: 5, transport, lookup, repositoryInspector() { throw Object.assign(new Error("broken repository"), { code: "other" }); } });
assert.equal(repositoryFailure.status, "failed"); assert.equal(repositoryState.scoutLedger.run(repositoryFailure.run_id).status, "failed"); repositoryState.scoutLedger.close();

const storeState = scoutState("store-failure"), corruptStore = { put() { throw Object.assign(new Error("corrupt store"), { code: "store_corruption" }); } };
const storeFailure = await runScoutV01({ seed: { kind: "web", locator: "https://catalog.example/resources" }, provider: new ScriptedProvider([webProvider.actions?.[0] ?? ((context) => { const seedPage = context.observations.find((x) => x.type === "web_seed"), boundary = seedPage.listing_candidates[0]; return { type: "select_listings", listings: [{ artifact_id: seedPage.artifact_id, ...boundary, selection_reason: "HTML list boundary", primary_link_index: 0 }] }; }), { type: "investigate_link", listing_index: 0, link_index: 0 }, { type: "finalize" }]), artifactStore: storeState.artifacts, packetStore: corruptStore, ledger: storeState.scoutLedger, budgets: { ...budgets, max_inference_calls: 3 }, target_packet_count: 1, transport: webTransport, lookup });
assert.equal(storeFailure.status, "failed"); assert.equal(storeState.scoutLedger.run(storeFailure.run_id).status, "failed"); storeState.scoutLedger.close();

const reportPath = path.join(temp, "fixture-report.md");
generateDogfoodReport({ ledger, runId: first.run_id, stateRoot, outputPath: reportPath, command: "npm run scout:v01 -- --kind=git --seed=C:\\fixture --provider=nvidia --model=fixture/free" });
const report = fs.readFileSync(reportPath, "utf8"); assert.match(report, /structural sample 1/); assert.match(report, /Aster/); assert.match(report, /Deliberately skipped selected links/); assert.doesNotMatch(report, /NVIDIA_NIM_API_KEY|OPENROUTER_API_KEY|Bearer /);
assert.throws(() => generateDogfoodReport({ ledger, runId: first.run_id, stateRoot, outputPath: reportPath, command: "npm run x -- --api_key=secret" }), /unsafe reproduction command/);
ledger.db.prepare("UPDATE scout_runs SET provider=? WHERE run_id=?").run("unsafe\n```provider", first.run_id);
assert.throws(() => generateDogfoodReport({ ledger, runId: first.run_id, stateRoot, outputPath: reportPath, command: "npm run scout:v01" }), /unsafe report field/);
ledger.db.prepare("UPDATE scout_runs SET provider=? WHERE run_id=?").run("scripted", first.run_id);

const fixtureCandidate = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures", "data-contract", "telemetry-dev.json"), "utf8"));
const observedAt = "2026-08-24T12:00:00.000Z", observation = prepareSourceObservation(record1, observedAt), candidate = structuredClone(fixtureCandidate.candidate);
candidate.source_snapshot_id = observation.source_snapshot_id; candidate.observed_at = observedAt; candidate.product.source_name = record1.source_name;
// Use a source-grounded compact candidate to prove identity/classification begins after handoff.
candidate.evidence_spans = [{ id: "ev_1", quote: record1.raw_text.slice(0, Math.min(80, record1.raw_text.length)) }];
const support = { basis: "inferred", evidence_ids: ["ev_1"] };
candidate.product.description = { text: "Hosted utility described by the supplied source.", support };
candidate.product.facets = [{ namespace: "capability", concept_id: "ai_observability", support }];
candidate.product.claimed_outcomes = [];
candidate.product.proposed_canonical_name = { text: record1.source_name, support };
candidate.product.links = [];
function rewriteSupports(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value.evidence_ids)) value.evidence_ids = ["ev_1"];
  for (const nested of Object.values(value)) rewriteSupports(nested);
}
rewriteSupports(candidate);
for (const opportunity of candidate.opportunities) {
  opportunity.availability.support = support;
  for (const entitlement of opportunity.entitlements) entitlement.support = support;
  opportunity.constraints = []; opportunity.conditions = []; opportunity.ambiguities = []; opportunity.links = [];
}
const catalog = new DatabaseSync(":memory:"); createCatalogStore(catalog); const librarianState = openState(":memory:");
const librarianProvider = { provider: "mock", model: "mock/free", async complete() { return { content: JSON.stringify(candidate), resolved_model: "mock/resolved-free", usage: null }; } };
const librarian = await runLibrarianV01({ catalog, state: librarianState, provider: librarianProvider, record: record1, observation });
assert.equal(librarian.status, "review_required", librarian.error); assert.ok(librarian.ingested.product_revision_id); assert.ok(Object.keys(librarian.ingested.opportunities).length > 0);
catalog.close(); librarianState.close();

const core = fs.readdirSync(path.resolve(import.meta.dirname, "../packages/scout")).filter((name) => name.endsWith(".mjs")).map((name) => fs.readFileSync(path.resolve(import.meta.dirname, "../packages/scout", name), "utf8")).join("\n");
assert.doesNotMatch(core, /free-for-dev|aster|birch|cedar|dahlia|elm/i);
const packetSchemaText = fs.readFileSync(path.resolve(import.meta.dirname, "../schemas/scout-packet.v0.1.schema.json"), "utf8");
assert.doesNotMatch(packetSchemaText, /product_id|opportunity_id|facets|capabilities|entitlements|conditions|constraints|canonical_match|deduplication/i);
const gateCoverage = {
  1: "repeat IDs, create-only packet count, and two ledger runs",
  2: "resealed offset/text/artifact/orphan/corruption negatives",
  3: "listing substitution and followed-link lineage negatives",
  4: "complete/partial/blocked plus provider-failure packet preservation",
  5: "actual HTTP/provider/file dispatch limits, redirects, failures, time, bytes, depth",
  6: "case-insensitive generic-core source scan",
  7: "schema forbidden-field scan and Librarian review_required integration",
  8: "credential deletion, injected transports, and unmocked-network failures",
  9: "package test script retains every release-0.1.1 command and Scout tests",
};
assert.deepEqual(Object.keys(gateCoverage), ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
const scripts = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8")).scripts;
assert.ok(["test:contract", "test:store", "test:ingest", "test:librarian", "test:api", "test:v001", "test:v010", "test:scout"].every((name) => scripts.test.includes(name)));
ledger.close();
console.log(JSON.stringify({ status: "ok", packet_ids: first.packets.map((x) => x.packet.packet_id), packet_statuses: first.packets.map((x) => x.packet.investigation.status), runs: [first.run_id, second.run_id], dispatched_requests: calls.length, gate_coverage: gateCoverage }));
