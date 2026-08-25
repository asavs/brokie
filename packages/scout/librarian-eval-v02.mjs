import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prepareSourceObservation } from "../catalog/identity-plan.mjs";
import { createCatalogStore } from "../catalog/store.mjs";
import { createCompatibleProvider, providerEnvironmentKey } from "../librarian/provider.mjs";
import { runLibrarianV01 } from "../librarian/run-v0.1-core.mjs";
import { openState } from "../maintainer/state.mjs";
import { packetToLibrarianBundle } from "./adapter-v02.mjs";
import { summarizeLibrarianCandidate } from "./librarian-eval-v02-core.mjs";
import { ScoutLedger } from "./ledger.mjs";
import { generateDogfoodReportV02 } from "./report-v02.mjs";
import { ArtifactStore, PacketStore } from "./store.mjs";
import { createPacketValidatorV02 } from "./validate-packet-v02.mjs";

const args = process.argv.slice(2), option = (name, fallback = null) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const stateRoot = path.resolve(option("state-dir", "var/scout-v0.2")), runId = option("run-id"), packetSetPath = option("packet-set"), providerName = option("provider", "openrouter"), model = option("model", providerName === "openrouter" ? "openrouter/free" : null);
const maxTokens = Number(option("max-tokens", "6000")), timeoutMs = Number(option("timeout-ms", "120000"));
if ((!runId && !packetSetPath) || (runId && packetSetPath) || !model) throw new Error("use exactly one of --run-id or --packet-set, and provide --model");
if (!Number.isInteger(maxTokens) || maxTokens < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("invalid Librarian limits");

const ledger = new ScoutLedger(path.join(stateRoot, "scout-ledger.sqlite"));
const artifacts = new ArtifactStore(stateRoot), packets = new PacketStore(stateRoot, createPacketValidatorV02(artifacts));
let evaluationId, selections;
if (packetSetPath) {
  const spec = JSON.parse(fs.readFileSync(path.resolve(packetSetPath), "utf8"));
  if (typeof spec.evaluation_id !== "string" || !Array.isArray(spec.packets) || !spec.packets.length) throw new Error("invalid packet-set manifest");
  evaluationId = spec.evaluation_id;
  selections = spec.packets.map((entry) => {
    if (typeof entry.packet_id !== "string" || typeof entry.source_run_id !== "string") throw new Error("invalid packet-set entry");
    const run = ledger.run(entry.source_run_id); if (!run?.finished_at) throw new Error(`finished Scout run not found: ${entry.source_run_id}`);
    const direct = ledger.db.prepare("SELECT 1 FROM scout_packets WHERE run_id=? AND packet_id=?").get(entry.source_run_id, entry.packet_id);
    if (!direct) {
      const manifestPath = path.join(stateRoot, "runs", `packet-derivation-${entry.packet_id}.json`), manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
      const sourceLinked = manifest?.derived_packet_id === entry.packet_id && ledger.db.prepare("SELECT 1 FROM scout_packets WHERE run_id=? AND packet_id=?").get(entry.source_run_id, manifest.source_packet_id);
      if (!sourceLinked) throw new Error(`packet is not linked to source run: ${entry.packet_id}`);
    }
    return { packet_id: entry.packet_id, run };
  });
} else {
  const run = ledger.run(runId); if (!run?.finished_at) throw new Error(`finished Scout run not found: ${runId}`);
  evaluationId = runId; selections = ledger.db.prepare("SELECT packet_id FROM scout_packets WHERE run_id=? ORDER BY ordinal").all(runId).map((row) => ({ ...row, run }));
}
if (new Set(selections.map(({ packet_id }) => packet_id)).size !== selections.length) throw new Error("packet-set contains duplicates");
const provider = createCompatibleProvider({ provider: providerName, model, apiKey: process.env[providerEnvironmentKey(providerName)], maxTokens, timeoutMs });
const results = [];
try {
  for (const { packet_id: packetId, run } of selections) {
    const packet = packets.read(packetId), { record } = packetToLibrarianBundle(packet, artifacts);
    const subjectRoot = path.join(stateRoot, "librarian", packet.packet_id), catalogPath = path.join(subjectRoot, "catalog-v0.1.sqlite"), statePath = path.join(subjectRoot, "brokie-state.sqlite");
    fs.mkdirSync(subjectRoot, { recursive: true });
    const catalog = new DatabaseSync(catalogPath); createCatalogStore(catalog); const state = openState(statePath);
    try {
      const observation = prepareSourceObservation(record, run.finished_at), tracePath = path.join(subjectRoot, "runs", `${observation.source_snapshot_id}.json`);
      const result = await runLibrarianV01({ catalog, state, provider, record, observation, tracePath });
      const accepted = state.prepare("SELECT parsed_candidate_json FROM librarian_attempts WHERE run_id=? AND status='accepted' ORDER BY attempt_number LIMIT 1").get(result.run_id);
      const candidate = accepted?.parsed_candidate_json ? JSON.parse(accepted.parsed_candidate_json) : null;
      results.push({ source_label: packet.subject.source_label, scout_packet_id: packet.packet_id, source_scout_run_id: run.run_id, status: result.status, run_id: result.run_id, provider: providerName, requested_model: model, resolved_model: result.resolved_model ?? "", attempts: result.attempts, max_attempts: 2, max_tokens: maxTokens, candidate_summary: candidate ? summarizeLibrarianCandidate(candidate) : null, error: result.error ? String(result.error).replace(/\s+/g, " ").slice(0, 900) : null, state_path: subjectRoot });
    } finally { catalog.close(); state.close(); }
  }
  const resultsPath = path.resolve(option("results", path.join(stateRoot, "runs", `${evaluationId}-librarian-results.json`)));
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true }); fs.writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  const manifestPath = runId ? path.join(stateRoot, "runs", `${runId}-manifest.json`) : null, manifest = manifestPath && fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
  const reportPath = option("report", manifest?.report_path ?? null);
  if (reportPath && !runId) throw new Error("packet-set reports are assembled from the retained evaluation manifest");
  if (reportPath) generateDogfoodReportV02({ ledger, runId, stateRoot, outputPath: path.resolve(reportPath), command: manifest?.reproduction_command ?? "Reproduction command unavailable; see retained run manifest.", librarianResults: results });
  console.log(JSON.stringify({ evaluation_id: evaluationId, scout_run_id: runId, packet_count: selections.length, results_path: resultsPath, report_path: reportPath ? path.resolve(reportPath) : null, results }, null, 2));
  if (results.some(({ status }) => status === "failed")) process.exitCode = 1;
} finally { ledger.close(); }
