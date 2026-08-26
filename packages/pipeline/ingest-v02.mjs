import fs from "node:fs";
import path from "node:path";
import { openState } from "../maintainer/state.mjs";
import { enqueueScoutPackets, librarianQueueSummary } from "../librarian/queue.mjs";
import { defaultFanoutBudgetsV02, fanOutGitCollectionV02 } from "../scout/fanout-v02.mjs";
import { materializeGitSeed } from "../scout/git-seed-v02.mjs";
import { ScoutLedger } from "../scout/ledger.mjs";
import { ArtifactStore, PacketStore } from "../scout/store.mjs";
import { createPacketValidatorV02 } from "../scout/validate-packet-v02.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = null) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seed = option("seed");
if (!seed) throw new Error("--seed=<Git URL or local repository> is required");

const root = path.resolve(import.meta.dirname, "../..");
const stateRoot = path.resolve(option("state-dir", path.join(root, "var", "pipeline-v0.2")));
const maxCollectionFiles = Number(option("max-collection-files", "50"));
if (!Number.isInteger(maxCollectionFiles) || maxCollectionFiles < 1 || maxCollectionFiles > 200) {
  throw new Error("--max-collection-files must be between 1 and 200");
}
fs.mkdirSync(stateRoot, { recursive: true });

const materialized = materializeGitSeed(seed, {
  cacheRoot: path.join(stateRoot, "git-cache"),
  revision: option("revision"),
});
const artifacts = new ArtifactStore(stateRoot);
const ledger = new ScoutLedger(path.join(stateRoot, "scout-ledger.sqlite"));
const packets = new PacketStore(stateRoot, createPacketValidatorV02(artifacts));
const state = openState(path.join(stateRoot, "brokie-state.sqlite"));

try {
  const result = fanOutGitCollectionV02({
    seedPath: materialized.path,
    seedLocator: materialized.locator,
    revision: materialized.revision,
    collectionPath: option("collection"),
    maxCollectionFiles,
    budgets: { ...defaultFanoutBudgetsV02, max_pages: maxCollectionFiles },
    artifactStore: artifacts,
    packetStore: packets,
    ledger,
  });
  const queued = enqueueScoutPackets(
    state,
    result.run_id,
    result.packets.map(({ packet }) => packet.packet_id),
    result.repository.commit_time,
  );
  console.log(JSON.stringify({
    status: "complete",
    scout_run_id: result.run_id,
    seed: materialized.locator,
    revision: result.repository.revision,
    collection_path: result.collection_path,
    packet_count: result.packets.length,
    packets_emitted: result.packets.filter(({ storage_status }) => storage_status === "emitted").length,
    packets_reused: result.packets.filter(({ storage_status }) => storage_status === "reused").length,
    queue: { ...queued, status: librarianQueueSummary(state) },
    state_root: stateRoot,
  }, null, 2));
} finally {
  state.close();
  ledger.close();
}
