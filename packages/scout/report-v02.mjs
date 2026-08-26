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
  const rows = ledger.db.prepare("SELECT * FROM scout_packets WHERE run_id=? ORDER BY ordinal").all(runId);
  return rows.map((row) => {
    const packet = store.read(row.packet_id);
    validator(packet);
    return { row, packet };
  });
}

function pagesText(packet) {
  return packet.acquisitions.map((item) => {
    const reasons = item.content_reasons.map((reason) => `\`${safe(reason)}\``).join(", ");
    const suffix = reasons ? ` (${reasons})` : "";
    return `  - depth ${item.depth} ${item.role}: \`${safe(item.final_locator)}\` — ${item.status}/${item.content_state}${suffix}; raw \`${item.raw_artifact_id ?? "none"}\`; readable \`${item.readable_artifact_id ?? "none"}\``;
  }).join("\n");
}

function outcomesText(packet) {
  return packet.research_outcomes.map((item) => {
    const questions = item.unresolved_questions.map((question) => safe(question, 500)).join("; ");
    return `  - ${item.topic}: **${item.status}**${questions ? ` — ${questions}` : ""}`;
  }).join("\n");
}

function findingsText(packet) {
  if (!packet.findings.length) return "  - None.";
  return packet.findings.map((item) => {
    const excerpts = item.evidence_excerpt_ids.map((id) => `\`${id}\``).join(", ");
    return `  - ${item.topic} / ${item.derivation}: “${safe(item.statement, 800)}” — finding \`${item.finding_id}\`; excerpts ${excerpts}`;
  }).join("\n");
}

function conflictsText(packet) {
  if (!packet.conflicts.length) return "  - None.";
  return packet.conflicts.map((item) => `  - ${item.topic}: ${safe(item.observation, 800)} — \`${item.conflict_id}\``).join("\n");
}

function packetSection({ packet, row }, index) {
  return `### ${index + 1}. ${safe(packet.subject.source_label, 256)}

- Packet: \`${packet.packet_id}\` (${row.storage_status})
- Listed URL: \`${safe(packet.subject.primary_url)}\`
- Collection excerpt: \`${packet.subject.collection_excerpt_id}\`

Pages inspected:

${pagesText(packet)}

Research outcomes:

${outcomesText(packet)}

Selected findings:

${findingsText(packet)}

Conflicts:

${conflictsText(packet)}`;
}

function librarianRows(results) {
  if (!results.length) return "| None yet | not_run | n/a | n/a | Librarian evaluation has not been attached. |";
  return results.map((item) => {
    const model = item.resolved_model || item.requested_model;
    const summary = item.candidate_summary ?? item.error ?? "No summary";
    return `| ${safe(item.source_label, 256)} | ${safe(item.status)} | ${safe(item.provider)}/${safe(model)} | ${item.attempts}/${item.max_attempts}; ${item.max_tokens} max output tokens | ${safe(summary, 1000)} |`;
  }).join("\n");
}

function librarianState(results) {
  if (!results.length) return "- None.";
  return results.map((item) => `- ${safe(item.source_label, 256)}: \`${safe(path.resolve(item.state_path))}\``).join("\n");
}

function failedAttempts(attempts) {
  const failures = attempts.filter(({ failure_code }) => failure_code);
  if (!failures.length) return "- None.";
  return failures.map((item) => `- Attempt ${item.attempt_number}: \`${safe(item.failure_code)}\``).join("\n");
}

function terminalText(codes) {
  if (!codes.length) return "";
  return `\nTerminal codes: ${codes.map((item) => `\`${safe(item)}\``).join(", ")}.`;
}

function resolvedModels(attempts) {
  const values = [...new Set(attempts.map(({ resolved_model }) => resolved_model).filter(Boolean))];
  return values.length ? values.map((item) => `\`${safe(item)}\``).join(", ") : "none";
}

function loadReportData({ ledger, runId, stateRoot, librarianResults }) {
  const run = ledger.run(runId);
  if (!run) throw new Error("unknown Scout run");
  const attempts = ledger.db.prepare("SELECT attempt_number,status,failure_code,requested_model,resolved_model FROM scout_attempts WHERE run_id=? ORDER BY attempt_number").all(runId);
  return {
    run,
    attempts,
    packets: loadPackets(ledger, runId, stateRoot),
    request: json(run.research_request_json, {}),
    configured: json(run.budget_json, {}),
    consumed: json(run.counters_json, {}),
    terminal: json(run.terminal_reason_codes_json, []),
    elapsed: new Date(run.finished_at).getTime() - new Date(run.started_at).getTime(),
    librarianResults,
  };
}

function renderReport({ data, runId, stateRoot, command }) {
  const { run, attempts, packets, request, configured, consumed, terminal, elapsed, librarianResults } = data;
  const topics = (request.topics ?? []).map((item) => `- ${item.topic}: ${safe(item.question, 500)}`).join("\n");
  const packetSections = packets.map(packetSection).join("\n\n");
  return `# Scout v0.2 corrective dogfood report

Generated from the Scout ledger, immutable v0.2 packets, and supplied Librarian run summaries. Raw pages, provider responses, credentials, cookies, and authorization headers are excluded.

## Run

- Run ID: \`${safe(runId)}\`
- UTC start: \`${safe(run.started_at)}\`
- UTC finish: \`${safe(run.finished_at)}\`
- Status: \`${safe(run.status)}\`
- Seed: \`${safe(json(run.seed_json, {}).locator)}\`
- Provider: \`${safe(run.provider)}\`
- Requested model: \`${safe(run.requested_model)}\`
- Resolved models: ${resolvedModels(attempts)}

## Research request

${safe(request.objective, 1000)}

${topics}

## Budgets

| Resource | Maximum | Consumed |
| --- | ---: | ---: |
| Requests | ${configured.max_requests} | ${consumed.requests ?? 0} |
| Pages | ${configured.max_pages} | ${consumed.pages ?? 0} |
| Bytes | ${configured.max_bytes} | ${consumed.bytes ?? 0} |
| Inference calls | ${configured.max_inference_calls} | ${consumed.inference_calls ?? 0} |
| Depth | ${configured.max_depth} | ${consumed.max_depth ?? 0} |
| Elapsed milliseconds | ${configured.max_elapsed_ms} | ${elapsed} |

## External and terminal failures

${failedAttempts(attempts)}${terminalText(terminal)}

Provider-specific recovery is intentionally outside the Scout core. Failures remain named and inspectable.

## Research packets

${packetSections}

## Librarian results

| Source | Status | Model route | Attempts / limit | Candidate summary |
| --- | --- | --- | ---: | --- |
${librarianRows(librarianResults)}

Retained Librarian state:

${librarianState(librarianResults)}

## Boundary and retained state

- \`answered\` reflects selected source evidence for one requested topic, never HTTP status alone.
- Scout findings remain source-local; Librarian candidates remain untrusted and review-gated.
- Full ignored runtime state: \`${safe(path.resolve(stateRoot))}\`.

## Reproduce Scout

\`\`\`powershell
${command}
\`\`\`

The command requires the explicitly named free provider credential and has no paid fallback.
`;
}

export function generateDogfoodReportV02({ ledger, runId, stateRoot, outputPath, command, librarianResults = [] }) {
  if (/[\r\n]|```/.test(command) || SECRET.test(command)) throw new Error("unsafe reproduction command");
  const data = loadReportData({ ledger, runId, stateRoot, librarianResults });
  const report = renderReport({ data, runId, stateRoot, command });
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, report);
  return { outputPath: path.resolve(outputPath), packetCount: data.packets.length };
}
