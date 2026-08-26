import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createCatalogStore } from "../packages/catalog/store.mjs";
import { runLibrarianBatchV02 } from "../packages/librarian/batch-v02.mjs";
import { enqueueScoutPackets, librarianQueueSummary } from "../packages/librarian/queue.mjs";
import { openState } from "../packages/maintainer/state.mjs";
import { createOmpProvider, parseOmpJsonOutput } from "../packages/runtime/omp-provider.mjs";
import { defaultFanoutBudgetsV02, fanOutGitCollectionV02 } from "../packages/scout/fanout-v02.mjs";
import { ScoutLedger } from "../packages/scout/ledger.mjs";
import { ArtifactStore, PacketStore } from "../packages/scout/store.mjs";
import { createPacketValidatorV02 } from "../packages/scout/validate-packet-v02.mjs";

const temporary = path.join(import.meta.dirname, "tmp", "pipeline-v02");
assert.ok(temporary.startsWith(path.join(import.meta.dirname, "tmp")));
fs.rmSync(temporary, { recursive: true, force: true });
const repositoryPath = path.join(temporary, "source");
const stateRoot = path.join(temporary, "state");
fs.mkdirSync(repositoryPath, { recursive: true });

const offer = "Observability for AI/LLM apps built on OpenTelemetry. Traces model calls and tool steps with tokens, cost, latency and errors; send OTLP over HTTP from any language or use the TypeScript SDKs. Free plan includes 10,000 spans/month, 7-day retention, 1 project and 2 seats, no credit card.";
fs.writeFileSync(path.join(repositoryPath, "README.md"), `# Free tools\n\n  - [Table of contents](#tools)\n\n- [Alpha](https://alpha.test) - ${offer}\n- [Beta](https://beta.test) - ${offer}\n`);
fs.writeFileSync(path.join(repositoryPath, "notes.md"), "# Notes\n\nNo catalog here.\n");
execFileSync("git", ["init", "--quiet"], { cwd: repositoryPath });
execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: repositoryPath });
execFileSync("git", ["config", "user.name", "Fixture"], { cwd: repositoryPath });
execFileSync("git", ["add", "README.md", "notes.md"], { cwd: repositoryPath });
execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repositoryPath });

const artifacts = new ArtifactStore(stateRoot);
const ledger = new ScoutLedger(path.join(stateRoot, "scout-ledger.sqlite"));
const packets = new PacketStore(stateRoot, createPacketValidatorV02(artifacts));
const fanoutOptions = {
  seedPath: repositoryPath,
  seedLocator: "https://example.test/free-tools.git",
  revision: "HEAD",
  maxCollectionFiles: 10,
  budgets: { ...defaultFanoutBudgetsV02, max_pages: 10 },
  artifactStore: artifacts,
  packetStore: packets,
  ledger,
};
const first = fanOutGitCollectionV02(fanoutOptions);
const second = fanOutGitCollectionV02(fanoutOptions);
assert.equal(first.collection_path, "README.md");
assert.equal(first.packets.length, 2);
assert.deepEqual(first.packets.map(({ packet }) => packet.packet_id), second.packets.map(({ packet }) => packet.packet_id));
assert.ok(first.packets.every(({ packet }) => packet.pages.length === 0));
assert.ok(first.packets.every(({ storage_status }) => storage_status === "emitted"));
assert.ok(second.packets.every(({ storage_status }) => storage_status === "reused"));

const state = openState(path.join(stateRoot, "brokie-state.sqlite"));
const packetIds = first.packets.map(({ packet }) => packet.packet_id);
assert.deepEqual(enqueueScoutPackets(state, first.run_id, packetIds, first.repository.commit_time), { enqueued: 2, reused: 0 });
assert.deepEqual(enqueueScoutPackets(state, second.run_id, packetIds, second.repository.commit_time), { enqueued: 0, reused: 2 });
assert.deepEqual(librarianQueueSummary(state), { queued: 2 });

const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures", "data-contract", "telemetry-dev.json"), "utf8"));
const provider = {
  provider: "mock-harness",
  model: "mock/free",
  async complete(messages) {
    const request = JSON.parse(messages[1].content);
    const candidate = structuredClone(fixture.candidate);
    const name = request.source_name;
    const url = /https?:\/\/[^)\s]+/.exec(request.scout_material_bundle.collection.text)[0];
    candidate.source_snapshot_id = request.source_snapshot_id;
    candidate.observed_at = request.observed_at;
    candidate.product.source_name = name;
    candidate.product.proposed_canonical_name.text = name;
    candidate.product.links[0].url = url;
    candidate.evidence_spans.find(({ id }) => id === "ev_name").quote = name;
    candidate.evidence_spans.find(({ id }) => id === "ev_url").quote = url;
    return { content: JSON.stringify(candidate), resolved_model: "mock/free", usage: { prompt_tokens: 1, completion_tokens: 1 } };
  },
};
const catalog = new DatabaseSync(path.join(stateRoot, "catalog.sqlite"));
createCatalogStore(catalog);
const batch = await runLibrarianBatchV02({ state, catalog, packets, artifacts, provider, stateRoot, limit: 10 });
assert.equal(batch.processed, 2);
assert.ok(batch.results.every(({ status }) => status === "review_required"));
assert.deepEqual(batch.queue, { review_required: 2 });
assert.equal(catalog.prepare("SELECT COUNT(*) AS count FROM source_snapshots").get().count, 2);
assert.equal(state.prepare("SELECT COUNT(*) AS count FROM revision_review_queue").get().count, 2);

const ompEvent = JSON.stringify({
  type: "message_end",
  message: { role: "assistant", provider: "fixture", model: "free", stopReason: "stop", content: [{ type: "text", text: "{\"ok\":true}" }], usage: { input: 7, output: 3 } },
});
assert.deepEqual(parseOmpJsonOutput(`${ompEvent}\n`, "requested/free"), {
  content: "{\"ok\":true}", reasoning: null, resolved_model: "fixture/free",
  usage: { prompt_tokens: 7, completion_tokens: 3 }, harness: "omp",
});
assert.throws(() => createOmpProvider({ model: "fixture/paid", routeClass: "paid" }), /explicit authorization/);
let ompArgs;
const omp = createOmpProvider({
  model: "fixture/free",
  routeClass: "free",
  executeImpl: async (_command, args) => { ompArgs = args; return { stdout: `${ompEvent}\n`, stderr: "" }; },
});
const ompResult = await omp.complete([{ role: "system", content: "Return JSON." }, { role: "user", content: "Hello" }]);
assert.equal(ompResult.content, "{\"ok\":true}");
assert.ok(ompArgs.includes("--no-tools"));
assert.ok(ompArgs.includes("--no-session"));

catalog.close();
state.close();
ledger.close();
console.log(JSON.stringify({ status: "ok", packets: packetIds.length, idempotent_fanout: "verified", shared_librarian_queue: "verified", omp_boundary: "verified" }));
