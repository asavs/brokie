import fs from "node:fs";
import path from "node:path";
import { createCompatibleProvider, providerEnvironmentKey } from "../librarian/provider.mjs";
import { ArtifactStore, PacketStore } from "./store.mjs";
import { ScoutLedger } from "./ledger.mjs";
import { createPacketValidatorV02 } from "./validate-packet-v02.mjs";
import { runScoutV02 } from "./runner-v02.mjs";
import { generateDogfoodReportV02 } from "./report-v02.mjs";

const args = process.argv.slice(2), option = (name, fallback = null) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const kind = option("kind", "git"), locator = option("seed"), providerName = option("provider", "openrouter"), model = option("model", providerName === "openrouter" ? "openrouter/free" : null);
if (!locator || !model) throw new Error("--seed and --model are required");
const root = path.resolve(import.meta.dirname, "../.."), stateRoot = path.resolve(option("state-dir", path.join(root, "var", "scout-v0.2")));
const targetsPath = option("targets", null), targetLabel = option("target-label", null);
if (targetsPath && targetLabel) throw new Error("use either --targets or --target-label");
const targetLabels = targetLabel ? [targetLabel] : targetsPath ? JSON.parse(fs.readFileSync(path.resolve(targetsPath), "utf8")).source_labels : [];
const targetCount = Number(option("target-packet-count", targetLabels.length || "5"));
const budgets = { max_requests: Number(option("max-requests", "30")), max_pages: Number(option("max-pages", "12")), max_bytes: Number(option("max-bytes", "5000000")), max_elapsed_ms: Number(option("max-elapsed-ms", "300000")), max_inference_calls: Number(option("max-inference-calls", "24")), max_depth: Number(option("max-depth", "2")) };
fs.mkdirSync(stateRoot, { recursive: true }); const artifacts = new ArtifactStore(stateRoot), ledger = new ScoutLedger(path.join(stateRoot, "scout-ledger.sqlite"));
const packets = new PacketStore(stateRoot, createPacketValidatorV02(artifacts)); const key = providerEnvironmentKey(providerName);
const provider = createCompatibleProvider({ provider: providerName, model, apiKey: process.env[key], timeoutMs: Number(option("timeout-ms", "120000")), maxTokens: Number(option("max-tokens", "5000")) });
try {
  const result = await runScoutV02({ seed: { kind, locator }, provider, artifactStore: artifacts, packetStore: packets, ledger, budgets, target_packet_count: targetCount, target_labels: targetLabels, restricted_trace_root: path.join(stateRoot, "restricted-traces") });
  const reportPath = option("report", null);
  const command = `npm run scout:v02 -- --kind=${quote(kind)} --seed=${quote(locator)} --provider=${quote(providerName)} --model=${quote(model)}${targetsPath ? ` --targets=${quote(targetsPath)}` : ""}${targetLabel ? ` --target-label=${quote(targetLabel)}` : ""} --target-packet-count=${targetCount} --max-requests=${budgets.max_requests} --max-pages=${budgets.max_pages} --max-bytes=${budgets.max_bytes} --max-elapsed-ms=${budgets.max_elapsed_ms} --max-inference-calls=${budgets.max_inference_calls} --max-depth=${budgets.max_depth} --state-dir=${quote(stateRoot)}${reportPath ? ` --report=${quote(reportPath)}` : ""}`;
  const manifestPath = path.join(stateRoot, "runs", `${result.run_id}-manifest.json`); fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({ run_id: result.run_id, reproduction_command: command, report_path: reportPath ? path.resolve(reportPath) : null }, null, 2)}\n`);
  if (reportPath) generateDogfoodReportV02({ ledger, runId: result.run_id, stateRoot, outputPath: path.resolve(reportPath), command });
  console.log(JSON.stringify({ run_id: result.run_id, status: result.status, packets: result.packets.map(({ packet, storage_status, research_status }) => ({ packet_id: packet.packet_id, packet_path: packets.packetPath(packet.packet_id), source_label: packet.subject.source_label, research_status, storage_status, outcomes: packet.research_outcomes.map(({ topic, status }) => ({ topic, status })) })), budget: result.budget, state_root: stateRoot, ledger_path: path.join(stateRoot, "scout-ledger.sqlite"), manifest_path: manifestPath, report: reportPath ? path.resolve(reportPath) : null }, null, 2));
  if (result.status === "failed") process.exitCode = 1;
} finally { ledger.close(); }
