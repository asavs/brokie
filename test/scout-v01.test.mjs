import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { ArtifactStore, PacketStore } from "../packages/scout/store.mjs";
import { ScoutLedger } from "../packages/scout/ledger.mjs";
import { createPacketValidator } from "../packages/scout/validate-packet.mjs";
import { runScoutV01, ScriptedProvider } from "../packages/scout/runner.mjs";
import { packetToLibrarianRecord } from "../packages/scout/adapter.mjs";
import { Budget } from "../packages/scout/budget.mjs";
import { createHttpTool, validatePublicUrl } from "../packages/scout/tools.mjs";
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

- [Aster](https://aster.example/info) — compact hosted utility.
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
execFileSync("git", ["init", "-q"], { cwd: repo }); execFileSync("git", ["add", "."], { cwd: repo });
execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-q", "-m", "fixture"], { cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: "2026-08-24T00:00:00Z", GIT_COMMITTER_DATE: "2026-08-24T00:00:00Z" } });

const response = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), async arrayBuffer() { return Buffer.from(body); } });
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
  { type: "inspect_git" }, { type: "list_files", cursor: 0 }, { type: "read_markdown", path: "RESOURCES.md" },
  (context) => {
    const markdown = context.observations.findLast((item) => item.type === "markdown");
    return { type: "select_listings", listings: markdown.structure.list_items.slice(0, 5).map((item, index) => ({ artifact_id: markdown.artifact_id, start_byte: item.start_byte, end_byte: item.end_byte, source_label: ["Aster", "Birch", "Cedar", "Dahlia", "Elm"][index], selection_reason: `structural sample ${index + 1}`, primary_link_index: 0 })) };
  },
  { type: "investigate_link", listing_index: 0, link_index: 0 },
  { type: "investigate_link", listing_index: 1, link_index: 0 }, { type: "investigate_link", listing_index: 1, link_index: 1 },
  { type: "investigate_link", listing_index: 2, link_index: 0 }, { type: "investigate_link", listing_index: 3, link_index: 0 },
  { type: "investigate_link", listing_index: 4, link_index: 0 }, { type: "investigate_link", listing_index: 4, link_index: 1 }, { type: "finalize" },
];
const budgets = { max_requests: 20, max_pages: 15, max_bytes: 3000000, max_elapsed_ms: 180000, max_inference_calls: 16, max_depth: 1 };
const stateRoot = path.join(temp, "state"); const artifactStore = new ArtifactStore(stateRoot);
const validator = createPacketValidator(artifactStore); const packetStore = new PacketStore(stateRoot, validator);
const ledger = new ScoutLedger(path.join(stateRoot, "scout.sqlite"));
const run = () => runScoutV01({ seed: { kind: "git", locator: repo }, provider: new ScriptedProvider(actions), artifactStore, packetStore, ledger, budgets, target_packet_count: 5, transport, lookup });
const first = await run(), firstDispatches = calls.length, second = await run();
assert.equal(first.packets.length, 5); assert.equal(second.packets.length, 5);
assert.deepEqual(first.packets.map((x) => x.packet.packet_id), second.packets.map((x) => x.packet.packet_id));
assert.deepEqual(first.packets.map((x) => x.packet.investigation.status), ["complete", "partial", "blocked", "complete", "complete"]);
assert.ok(first.packets[4].packet.followed_pages.some((x) => x.authority.level === "linked_third_party"));
assert.ok(second.packets.every((x) => x.storage_status === "reused"));
assert.ok(firstDispatches <= budgets.max_requests); assert.ok(calls.length - firstDispatches <= budgets.max_requests);
assert.equal(ledger.db.prepare("SELECT COUNT(*) count FROM scout_runs").get().count, 2);
assert.equal(ledger.db.prepare("SELECT COUNT(DISTINCT packet_id) count FROM scout_packets").get().count, 5);
assert.equal(fs.readdirSync(path.join(stateRoot, "packets"), { recursive: true }).filter((name) => String(name).endsWith(".json")).length, 5);
for (const { packet } of first.packets) validator(packet);

const record1 = packetToLibrarianRecord(first.packets[0].packet, artifactStore), record2 = packetToLibrarianRecord(second.packets[0].packet, artifactStore);
assert.deepEqual(record1, record2); assert.equal(record1.source_kind, "repository"); assert.doesNotMatch(JSON.stringify(first.packets[0].packet), /product_id|opportunity_id|capabilit|entitlement|canonical_match/i);

function rejected(mutator, pattern) { const value = structuredClone(first.packets[0].packet); mutator(value); assert.throws(() => validator(value), pattern); }
rejected((p) => { p.excerpts[0].start_byte += 1; }, /packet_id mismatch|excerpt/);
rejected((p) => { p.excerpts[0].text += "x"; }, /packet_id mismatch|excerpt/);
rejected((p) => { p.excerpts[0].artifact_id = `art_sha256_${"0".repeat(64)}`; }, /packet_id mismatch|artifact/);
rejected((p) => { p.excerpts.push(structuredClone(p.excerpts[0])); }, /packet_id mismatch|duplicate|orphan/);
rejected((p) => { p.listing = structuredClone(p.followed_pages[0]); }, /packet_id mismatch|listing/);
const corruptId = first.packets[0].packet.excerpts[0].artifact_id, corruptPath = artifactStore.paths(corruptId).body, original = fs.readFileSync(corruptPath);
fs.writeFileSync(corruptPath, Buffer.concat([original, Buffer.from("x")])); assert.throws(() => validator(first.packets[0].packet), /corrupt artifact/); fs.writeFileSync(corruptPath, original);

for (const [kind, maximum, code] of [["request", "max_requests", "budget_request_exhausted"], ["page", "max_pages", "budget_page_exhausted"], ["byte", "max_bytes", "budget_byte_exhausted"], ["inference", "max_inference_calls", "budget_inference_exhausted"]]) {
  const small = new Budget({ ...budgets, [maximum]: 1 }); small.reserve(kind); assert.throws(() => small.reserve(kind), new RegExp(code));
}
assert.throws(() => new Budget(budgets).depth(2), /depth_exceeded/);
let clock = 0; const timed = new Budget({ ...budgets, max_elapsed_ms: 1 }, () => clock); clock = 1; assert.throws(() => timed.checkTime(), /budget_time_exhausted/);
await assert.rejects(() => validatePublicUrl("http://127.0.0.1/x"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://169.254.169.254/latest"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://[::1]/x"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://[::ffff:7f00:1]/x"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://[fe80::1]/x"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("http://user:pass@example.test/"), /ssrf_blocked/);
await assert.rejects(() => validatePublicUrl("file:///tmp/x"), /unsupported_scheme/);
let redirects = 0; const redirectBudget = new Budget({ ...budgets, max_requests: 2 }); const redirectTool = createHttpTool({ artifactStore, budget: redirectBudget, lookup, transport: async (url) => { redirects += 1; return url.endsWith("robots.txt") ? response(200, "", { "content-type": "text/plain" }) : response(302, "", { location: "http://127.0.0.1/private" }); } });
await assert.rejects(() => redirectTool.fetch("https://safe.example/start", { depth: 0, kind: "http_seed", authority: { level: "collection", basis: "seed", excerpt_ids: [] } }), /ssrf_blocked/); assert.equal(redirects, 2);

const webRoot = path.join(temp, "web-state"), webArtifacts = new ArtifactStore(webRoot), webLedger = new ScoutLedger(path.join(webRoot, "ledger.sqlite"));
const webPackets = new PacketStore(webRoot, createPacketValidator(webArtifacts));
const webTransport = async (url) => {
  if (url.endsWith("/robots.txt")) return response(200, "User-agent: *\nDisallow:\n", { "content-type": "text/plain" });
  if (url === "https://catalog.example/resources") return response(200, "<ul><li><a href=\"/detail\">Quartz</a> — static resource.</li></ul>", { "content-type": "text/html" });
  if (url === "https://catalog.example/detail") return response(200, "Quartz linked evidence.", { "content-type": "text/plain" });
  throw new Error(`unmocked network attempt: ${url}`);
};
const webProvider = new ScriptedProvider([
  (context) => { const seedPage = context.observations.find((x) => x.type === "web_seed"); return { type: "select_listings", listings: [{ artifact_id: seedPage.artifact_id, start_byte: 0, end_byte: Buffer.byteLength("<ul><li><a href=\"/detail\">Quartz</a> — static resource.</li></ul>"), source_label: "Quartz", selection_reason: "HTML list boundary", primary_link_index: 0 }] }; },
  { type: "investigate_link", listing_index: 0, link_index: 0 }, { type: "finalize" },
]);
const webRun = await runScoutV01({ seed: { kind: "web", locator: "https://catalog.example/resources" }, provider: webProvider, artifactStore: webArtifacts, packetStore: webPackets, ledger: webLedger, budgets: { ...budgets, max_inference_calls: 3 }, target_packet_count: 1, transport: webTransport, lookup });
assert.equal(webRun.packets.length, 1); assert.equal(webRun.packets[0].packet.listing.kind, "http_seed"); assert.equal(webRun.packets[0].packet.investigation.status, "complete"); webLedger.close();

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
ledger.close();
console.log(JSON.stringify({ status: "ok", packet_ids: first.packets.map((x) => x.packet.packet_id), packet_statuses: first.packets.map((x) => x.packet.investigation.status), runs: [first.run_id, second.run_id], dispatched_requests: calls.length }));
