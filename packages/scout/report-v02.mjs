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
function json(value, fallback) { return value ? JSON.parse(value) : fallback; }

export function generateDogfoodReportV02({ ledger, runId, stateRoot, outputPath, command, librarianResults = [] }) {
  if (/[\r\n]|```/.test(command) || SECRET.test(command)) throw new Error("unsafe reproduction command");
  const run = ledger.run(runId); if (!run) throw new Error("unknown Scout run");
  const artifacts = new ArtifactStore(stateRoot), validator = createPacketValidatorV02(artifacts), store = new PacketStore(stateRoot, validator);
  const packetRows = ledger.db.prepare("SELECT * FROM scout_packets WHERE run_id=? ORDER BY ordinal").all(runId);
  const packets = packetRows.map((row) => ({ row, packet: store.read(row.packet_id) })); for (const { packet } of packets) validator(packet);
  const attempts = ledger.db.prepare("SELECT attempt_number,status,failure_code,requested_model,resolved_model FROM scout_attempts WHERE run_id=? ORDER BY attempt_number").all(runId);
  const request = json(run.research_request_json, {}), configured = json(run.budget_json, {}), consumed = json(run.counters_json, {}), terminal = json(run.terminal_reason_codes_json, []);
  const elapsed = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  const resolved = [...new Set(attempts.map(({ resolved_model }) => resolved_model).filter(Boolean))];
  const packetSections = packets.map(({ packet, row }, index) => {
    const pages = packet.acquisitions.map((item) => `  - depth ${item.depth} ${item.role}: \`${safe(item.final_locator)}\` — ${item.status}/${item.content_state}${item.content_reasons.length ? ` (${item.content_reasons.map((reason) => `\`${safe(reason)}\``).join(", ")})` : ""}; raw \`${item.raw_artifact_id ?? "none"}\`; readable \`${item.readable_artifact_id ?? "none"}\``).join("\n");
    const outcomes = packet.research_outcomes.map((item) => `  - ${item.topic}: **${item.status}**${item.unresolved_questions.length ? ` — ${item.unresolved_questions.map((question) => safe(question, 500)).join("; ")}` : ""}`).join("\n");
    const findings = packet.findings.length ? packet.findings.map((item) => `  - ${item.topic} / ${item.derivation}: “${safe(item.statement, 800)}” — finding \`${item.finding_id}\`; excerpts ${item.evidence_excerpt_ids.map((id) => `\`${id}\``).join(", ")}`).join("\n") : "  - None.";
    const conflicts = packet.conflicts.length ? packet.conflicts.map((item) => `  - ${item.topic}: ${safe(item.observation, 800)} — \`${item.conflict_id}\``).join("\n") : "  - None.";
    return `### ${index + 1}. ${safe(packet.subject.source_label, 256)}\n\n- Packet: \`${packet.packet_id}\` (${row.storage_status})\n- Listed URL: \`${safe(packet.subject.primary_url)}\`\n- Collection excerpt: \`${packet.subject.collection_excerpt_id}\`\n\nPages inspected:\n\n${pages}\n\nResearch outcomes:\n\n${outcomes}\n\nSelected findings:\n\n${findings}\n\nConflicts:\n\n${conflicts}`;
  }).join("\n\n");
  const librarian = librarianResults.length ? librarianResults.map((item) => `| ${safe(item.source_label, 256)} | ${safe(item.status)} | ${safe(item.provider)}/${safe(item.resolved_model || item.requested_model)} | ${item.attempts}/${item.max_attempts}; ${item.max_tokens} max output tokens | ${safe(item.candidate_summary ?? item.error ?? "No summary", 1000)} |`).join("\n") : "| None yet | not_run | n/a | n/a | Librarian evaluation has not been attached. |";
  const librarianState = librarianResults.length ? librarianResults.map((item) => `- ${safe(item.source_label, 256)}: \`${safe(path.resolve(item.state_path))}\``).join("\n") : "- None.";
  const report = `# Scout v0.2 corrective dogfood report

Generated from the Scout ledger, immutable v0.2 packets, and supplied Librarian run summaries. Raw pages, provider responses, credentials, cookies, and authorization headers are excluded.

## Run

- Run ID: \`${safe(runId)}\`
- UTC start: \`${safe(run.started_at)}\`
- UTC finish: \`${safe(run.finished_at)}\`
- Status: \`${safe(run.status)}\`
- Seed: \`${safe(json(run.seed_json, {}).locator)}\`
- Provider: \`${safe(run.provider)}\`
- Requested model: \`${safe(run.requested_model)}\`
- Resolved models: ${resolved.length ? resolved.map((item) => `\`${safe(item)}\``).join(", ") : "none"}

## Research request

${safe(request.objective, 1000)}

${(request.topics ?? []).map((item) => `- ${item.topic}: ${safe(item.question, 500)}`).join("\n")}

## Budgets

| Resource | Maximum | Consumed |
| --- | ---: | ---: |
| Requests | ${configured.max_requests} | ${consumed.requests ?? 0} |
| Pages | ${configured.max_pages} | ${consumed.pages ?? 0} |
| Bytes | ${configured.max_bytes} | ${consumed.bytes ?? 0} |
| Inference calls | ${configured.max_inference_calls} | ${consumed.inference_calls ?? 0} |
| Depth | ${configured.max_depth} | ${consumed.max_depth ?? 0} |
| Elapsed milliseconds | ${configured.max_elapsed_ms} | ${elapsed} |

## Recovered and terminal actions

${attempts.filter(({ failure_code }) => failure_code).length ? attempts.filter(({ failure_code }) => failure_code).map((item) => `- Attempt ${item.attempt_number}: \`${safe(item.failure_code)}\``).join("\n") : "- None."}
${terminal.length ? `\nTerminal codes: ${terminal.map((item) => `\`${safe(item)}\``).join(", ")}.` : ""}

## Research packets

${packetSections}

## Librarian results

| Source | Status | Model route | Attempts / limit | Candidate summary |
| --- | --- | --- | ---: | --- |
${librarian}

Retained Librarian state:

${librarianState}

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
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true }); fs.writeFileSync(outputPath, report);
  return { outputPath: path.resolve(outputPath), packetCount: packets.length };
}
