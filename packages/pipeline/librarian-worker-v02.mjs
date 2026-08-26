import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCatalogStore } from "../catalog/store.mjs";
import { runLibrarianBatchV02 } from "../librarian/batch-v02.mjs";
import { recoverInterruptedLibrarianJobs } from "../librarian/queue.mjs";
import { openState } from "../maintainer/state.mjs";
import { createOmpProvider } from "../runtime/omp-provider.mjs";
import { ArtifactStore, PacketStore } from "../scout/store.mjs";
import { createPacketValidatorV02 } from "../scout/validate-packet-v02.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = null) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const has = (name) => args.includes(`--${name}`);
const model = option("model");
if (!model) throw new Error("--model=<OMP provider/model> is required");

const root = path.resolve(import.meta.dirname, "../..");
const stateRoot = path.resolve(option("state-dir", path.join(root, "var", "pipeline-v0.2")));
const limit = Number(option("limit", "1"));
fs.mkdirSync(stateRoot, { recursive: true });
const state = openState(path.join(stateRoot, "brokie-state.sqlite"));
const catalog = new DatabaseSync(path.join(stateRoot, "catalog-v0.1.sqlite"));
createCatalogStore(catalog);
const artifacts = new ArtifactStore(stateRoot);
const packets = new PacketStore(stateRoot, createPacketValidatorV02(artifacts));
const provider = createOmpProvider({
  model,
  routeClass: option("route-class", "quota"),
  allowPaid: has("allow-paid"),
  profile: option("profile", ""),
  timeoutMs: Number(option("timeout-ms", "120000")),
});

try {
  const recovered = recoverInterruptedLibrarianJobs(state);
  const result = await runLibrarianBatchV02({ state, catalog, packets, artifacts, provider, stateRoot, limit });
  console.log(JSON.stringify({ ...result, recovered, state_root: stateRoot, catalog_path: path.join(stateRoot, "catalog-v0.1.sqlite") }, null, 2));
  if (result.results.some(({ status }) => status === "failed")) process.exitCode = 1;
} finally {
  catalog.close();
  state.close();
}
