import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prepareSourceObservation } from "../catalog/identity-plan.mjs";
import { createCatalogStore } from "../catalog/store.mjs";
import { openState } from "../maintainer/state.mjs";
import { sha } from "./lib.mjs";
import { createCompatibleProvider, providerEnvironmentKey } from "./provider.mjs";
import { runLibrarianV01 } from "./run-v0.1-core.mjs";
import { ArtifactStore } from "../scout/store.mjs";
import { packetToLibrarianRecord } from "../scout/adapter.mjs";
import { packetToLibrarianBundle } from "../scout/adapter-v02.mjs";

const cli = process.argv.slice(2);
const option = (name, fallback) =>
  cli.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = path.resolve(import.meta.dirname, "..", "..");
const providerName = option("provider", "openrouter");
const model = option("model", providerName === "openrouter" ? "openrouter/free" : null);
const sourceId = option("source-id", null);
const recordPath = option("record", null);
const packetPath = option("packet", null);
const stagingPath = path.resolve(
  option("staging", path.join(import.meta.dirname, "generated", "staging.json")),
);
const stateDir = path.resolve(option("state-dir", path.join(root, "var", "v0.1")));
const observedAt = option("observed-at", new Date().toISOString());
if (!model) throw new Error("--model is required for the selected provider");
if ([recordPath, sourceId, packetPath].filter(Boolean).length !== 1) {
  throw new Error("provide exactly one of --packet=<packet.json>, --record=<normalized-record.json>, or --source-id=<id>");
}

let record;
if (packetPath) {
  const packet = JSON.parse(fs.readFileSync(path.resolve(packetPath), "utf8"));
  const defaultScoutState = packet.schema_version === "0.2.0" ? "scout-v0.2" : "scout-v0.1";
  const scoutState = path.resolve(option("scout-state", path.join(root, "var", defaultScoutState)));
  const artifacts = new ArtifactStore(scoutState);
  record = packet.schema_version === "0.2.0" ? packetToLibrarianBundle(packet, artifacts).record : packetToLibrarianRecord(packet, artifacts);
} else if (recordPath) {
  record = JSON.parse(fs.readFileSync(path.resolve(recordPath), "utf8"));
  if (record.record) record = record.record;
} else {
  const staging = JSON.parse(fs.readFileSync(stagingPath, "utf8"));
  record = staging.records.find(({ source_id: candidateId }) => candidateId === sourceId);
  if (!record) throw new Error(`source record not found in staging: ${sourceId}`);
}

fs.mkdirSync(stateDir, { recursive: true });
const observation = prepareSourceObservation(record, observedAt);
const keyName = providerEnvironmentKey(providerName);
const provider = createCompatibleProvider({
  provider: providerName,
  model,
  apiKey: process.env[keyName],
  timeoutMs: Number(option("timeout-ms", 120_000)),
  maxTokens: Number(option("max-tokens", 6_000)),
  allowPaid: option("allow-paid-provider", "") === providerName,
});
const catalog = new DatabaseSync(path.join(stateDir, "catalog-v0.1.sqlite"));
createCatalogStore(catalog);
const state = openState(path.join(stateDir, "brokie-state.sqlite"));
const runId = `run_${sha(
  `${observation.source_snapshot_id}\n${provider.provider}\n${provider.model}`,
  24,
)}`;
const tracePath = path.join(stateDir, "runs", `${runId}.json`);

try {
  const result = await runLibrarianV01({
    catalog,
    state,
    provider,
    record,
    observation,
    tracePath,
  });
  console.log(
    JSON.stringify(
      {
        ...result,
        catalog_path: path.join(stateDir, "catalog-v0.1.sqlite"),
        state_path: path.join(stateDir, "brokie-state.sqlite"),
        trace_path: tracePath,
      },
      null,
      2,
    ),
  );
  if (result.status === "failed") process.exitCode = 1;
} finally {
  catalog.close();
  state.close();
}
