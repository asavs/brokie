import fs from "node:fs";
import path from "node:path";
import { createCompatibleProvider, providerEnvironmentKey } from "../librarian/provider.mjs";
import { ArtifactStore, PacketStore } from "./store.mjs";
import { ScoutLedger } from "./ledger.mjs";
import { createPacketValidator } from "./validate-packet.mjs";
import { runScoutV01 } from "./runner.mjs";
import { generateDogfoodReport } from "./report.mjs";

const args = process.argv.slice(2), option = (name, fallback = null) => args.find((x) => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const quotePowerShell = (value) => `'${String(value).replaceAll("'", "''")}'`;
const kind = option("kind", "git"), locator = option("seed"), providerName = option("provider", "openrouter"), model = option("model", providerName === "openrouter" ? "openrouter/free" : null);
if (!locator) throw new Error("--seed=<local-git-path-or-static-url> is required"); if (!model) throw new Error("--model is required for the selected provider");
const root = path.resolve(import.meta.dirname, "../.."), stateRoot = path.resolve(option("state-dir", path.join(root, "var", "scout-v0.1")));
fs.mkdirSync(stateRoot, { recursive: true }); const artifactStore = new ArtifactStore(stateRoot), ledger = new ScoutLedger(path.join(stateRoot, "scout-ledger.sqlite"));
const packetStore = new PacketStore(stateRoot, createPacketValidator(artifactStore)); const key = providerEnvironmentKey(providerName);
const provider = createCompatibleProvider({ provider: providerName, model, apiKey: process.env[key], timeoutMs: Number(option("timeout-ms", "120000")), maxTokens: Number(option("max-tokens", "2600")) });
const budgets = { max_requests: Number(option("max-requests", "20")), max_pages: Number(option("max-pages", "15")), max_bytes: Number(option("max-bytes", "3000000")), max_elapsed_ms: Number(option("max-elapsed-ms", "180000")), max_inference_calls: Number(option("max-inference-calls", "16")), max_depth: Number(option("max-depth", "1")) };
try {
  const result = await runScoutV01({ seed: { kind, locator }, provider, artifactStore, packetStore, ledger, budgets, target_packet_count: Number(option("target-packet-count", "5")) });
  const report = option("report"); if (report) generateDogfoodReport({ ledger, runId: result.run_id, stateRoot, outputPath: path.resolve(report), command: `npm run scout:v01 -- --kind=${quotePowerShell(kind)} --seed=${quotePowerShell(locator)} --provider=${quotePowerShell(providerName)} --model=${quotePowerShell(model)} --target-packet-count=5 --max-requests=${budgets.max_requests} --max-pages=${budgets.max_pages} --max-bytes=${budgets.max_bytes} --max-elapsed-ms=${budgets.max_elapsed_ms} --max-inference-calls=${budgets.max_inference_calls} --max-depth=${budgets.max_depth} --report=${quotePowerShell(report)}` });
  console.log(JSON.stringify({ run_id: result.run_id, status: result.status, packets: result.packets.map(({ packet, storage_status }) => ({ packet_id: packet.packet_id, source_label: packet.subject.source_label, status: packet.investigation.status, storage_status })), budget: result.budget, state_root: stateRoot, ledger_path: path.join(stateRoot, "scout-ledger.sqlite"), report: report ? path.resolve(report) : null }, null, 2));
  if (result.status === "failed") process.exitCode = 1;
} finally { ledger.close(); }
