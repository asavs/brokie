import fs from "node:fs";
import path from "node:path";
import { ArtifactStore, PacketStore } from "./store.mjs";
import { createPacketValidatorV02 } from "./validate-packet-v02.mjs";

const SECRET = /(?:api[_-]?key|authorization|bearer|password|token)\s*=/i;

function safe(value, maximum = 2000) {
  const text = String(value ?? "");
  if (text.length > maximum || /[\r\n]|```/.test(text) || SECRET.test(text)) throw new Error("unsafe report field");
  return text.replaceAll("`", "\\`").replaceAll("|", "\\|");
}

function json(value, fallback) {
  return value ? JSON.parse(value) : fallback;
}

function loadPackets(ledger, runId, stateRoot) {
  const artifacts = new ArtifactStore(stateRoot);
  const validator = createPacketValidatorV02(artifacts);
  const store = new PacketStore(stateRoot, validator);
  return ledger.db.prepare("SELECT * FROM scout_packets WHERE run_id=? ORDER BY ordinal").all(runId)
    .map((row) => {
      const packet = store.read(row.packet_id);
      validator(packet);
      return { row, packet };
    });
}

function pagesText(packet) {
  if (!packet.pages.length) return "  - No linked pages acquired.";
  return packet.pages.map((page) => {
    const reasons = page.content_reasons.map((reason) => `\`${safe(reason)}\``).join(", ");
    const detail = reasons || page.failure?.code || "no reported problem";
    return `  - depth ${page.depth}: \`${safe(page.final_url)}\` — ${page.status}; ${detail}; raw \`${page.raw_artifact_id ?? "none"}\`; readable \`${page.readable_artifact_id ?? "none"}\``;
  }).join("\n");
}

function packetSection({ packet, row }, index) {
  return `### ${index + 1}. ${safe(packet.subject.source_label, 256)}

- Packet: \`${packet.packet_id}\` (${row.storage_status})
- Listed URL: \`${safe(packet.subject.primary_url)}\`
- Collection material: \`${packet.collection.artifact_id}\` bytes ${packet.collection.start_byte}-${packet.collection.end_byte}

Material brought back:

${pagesText(packet)}`;
}

function failedAttempts(attempts) {
  const failures = attempts.filter(({ failure_code }) => failure_code);
  if (!failures.length) return "- None.";
  return failures.map((item) => `- Attempt ${item.attempt_number}: \`${safe(item.failure_code)}\``).join("\n");
}

function resolvedModels(attempts) {
  const values = [...new Set(attempts.map(({ resolved_model }) => resolved_model).filter(Boolean))];
  return values.length ? values.map((item) => `\`${safe(item)}\``).join(", ") : "none";
}

function librarianRows(results) {
  if (!results.length) return "| None yet | not_run | n/a | Librarian has not processed these materials. |";
  return results.map((item) => {
    const model = item.resolved_model || item.requested_model;
    const summary = item.candidate_summary ?? item.error ?? "No summary";
    return `| ${safe(item.source_label, 256)} | ${safe(item.status)} | ${safe(item.provider)}/${safe(model)} | ${safe(summary, 1000)} |`;
  }).join("\n");
}

function loadData({ ledger, runId, stateRoot, librarianResults }) {
  const run = ledger.run(runId);
  if (!run) throw new Error("unknown Scout run");
  const attempts = ledger.db.prepare("SELECT attempt_number,status,failure_code,resolved_model FROM scout_attempts WHERE run_id=? ORDER BY attempt_number").all(runId);
  return {
    run,
    attempts,
    packets: loadPackets(ledger, runId, stateRoot),
    configured: json(run.budget_json, {}),
    consumed: json(run.counters_json, {}),
    terminal: json(run.terminal_reason_codes_json, []),
    librarianResults,
  };
}

function budgetTable(configured, consumed) {
  return `| Resource | Maximum | Consumed |
| --- | ---: | ---: |
| Requests | ${configured.max_requests} | ${consumed.requests ?? 0} |
| Pages | ${configured.max_pages} | ${consumed.pages ?? 0} |
| Bytes | ${configured.max_bytes} | ${consumed.bytes ?? 0} |
| Inference calls | ${configured.max_inference_calls} | ${consumed.inference_calls ?? 0} |
| Depth | ${configured.max_depth} | ${consumed.max_depth ?? 0} |`;
}

function renderReport(data, runId, stateRoot, command) {
  const { run, attempts, packets, configured, consumed, terminal, librarianResults } = data;
  return `# Scout v0.2 acquisition report

Scout went looking for free stuff and retained what it found. This report contains locations and artifact IDs, not Scout interpretations.

## Run

- Run ID: \`${safe(runId)}\`
- Status: \`${safe(run.status)}\`
- Seed: \`${safe(json(run.seed_json, {}).locator)}\`
- Provider/model: \`${safe(run.provider)}\` / \`${safe(run.requested_model)}\`
- Resolved models: ${resolvedModels(attempts)}

## Budgets

${budgetTable(configured, consumed)}

## External failures

${failedAttempts(attempts)}

Terminal codes: ${terminal.length ? terminal.map((item) => `\`${safe(item)}\``).join(", ") : "none"}.

## Scout packets

${packets.map(packetSection).join("\n\n")}

## Librarian results

| Source | Status | Model route | Candidate summary |
| --- | --- | --- | --- |
${librarianRows(librarianResults)}

## Boundary

- Scout acquired source material. It did not decide what the material means.
- Librarian candidates remain review-gated.
- Full ignored runtime state: \`${safe(path.resolve(stateRoot))}\`.

## Reproduce Scout

\`\`\`powershell
${command}
\`\`\`
`;
}

export function generateDogfoodReportV02({ ledger, runId, stateRoot, outputPath, command, librarianResults = [] }) {
  if (/[\r\n]|```/.test(command) || SECRET.test(command)) throw new Error("unsafe reproduction command");
  const data = loadData({ ledger, runId, stateRoot, librarianResults });
  const report = renderReport(data, runId, stateRoot, command);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, report);
  return { outputPath: path.resolve(outputPath), packetCount: data.packets.length };
}
