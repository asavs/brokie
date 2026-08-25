import fs from "node:fs";
import path from "node:path";
import { ArtifactStore, PacketStore } from "./store.mjs";
import { createPacketValidator } from "./validate-packet.mjs";

function json(value, fallback) { return value ? JSON.parse(value) : fallback; }
function safeLocator(locator) { try { const url = new URL(locator); if (url.username || url.password) { url.username = ""; url.password = ""; } return url.href; } catch { return locator; } }
export function generateDogfoodReport({ ledger, runId, stateRoot, outputPath, command }) {
  if (/[\r\n]|```|(?:api[_-]?key|authorization|bearer|password|token)\s*=/i.test(command)) throw new Error("unsafe reproduction command");
  const run = ledger.run(runId); if (!run) throw new Error(`unknown Scout run: ${runId}`);
  const packetRows = ledger.db.prepare("SELECT * FROM scout_packets WHERE run_id=? ORDER BY ordinal").all(runId);
  const artifactStore = new ArtifactStore(stateRoot), packetStore = new PacketStore(stateRoot, createPacketValidator(artifactStore));
  const packets = packetRows.map((row) => ({ row, packet: packetStore.read(row.packet_id) }));
  const events = ledger.db.prepare("SELECT event_type, normalized_json FROM scout_events WHERE run_id=? ORDER BY sequence").all(runId).map((row) => ({ type: row.event_type, value: JSON.parse(row.normalized_json) }));
  const attempts = ledger.db.prepare("SELECT requested_model,resolved_model,status FROM scout_attempts WHERE run_id=? ORDER BY attempt_number").all(runId);
  const seed = json(run.seed_json, {}), configured = json(run.budget_json, {}), consumed = json(run.counters_json, {});
  const files = [...new Set(events.filter((e) => e.type === "tool" && e.value.name === "file.read").map((e) => e.value.input.relative_path))];
  const gitInspection = events.find((e) => e.type === "tool" && e.value.name === "git.inspect")?.value.output;
  const followed = packets.flatMap(({ packet }) => packet.followed_pages.map((page) => ({ label: packet.subject.source_label, locator: safeLocator(page.requested_locator), final: safeLocator(page.final_locator), status: page.status, failure: page.failure?.code ?? "none" })));
  const skipped = packets.flatMap(({ packet }) => packet.skipped_links.map((item) => ({ label: packet.subject.source_label, locator: safeLocator(item.link.resolved_destination ?? item.link.raw_destination), reason: item.reason_code })));
  const uncertainties = [...new Set(packets.flatMap(({ packet }) => [...packet.uncertainties.map((u) => u.observation), ...packet.investigation.unresolved_questions]))];
  const resolved = [...new Set(attempts.map((x) => x.resolved_model).filter(Boolean))];
  const terminalReasons = json(run.terminal_reason_codes_json, []);
  const rows = packets.map(({ row, packet }) => `| ${row.ordinal} | ${packet.subject.source_label.replaceAll("|", "\\|")} | ${packet.subject.selection_reason.replaceAll("|", "\\|")} | \`${packet.packet_id}\` | ${packet.investigation.status} | ${row.storage_status} |`).join("\n");
  const report = `# Scout v0.1 dogfood report

Generated from the persistent Scout ledger and its referenced immutable packets. No source bodies, credentials, cookies, authorization headers, or raw provider responses are included.

## Run

- Run ID: \`${runId}\`
- UTC start: \`${run.started_at}\`
- UTC finish: \`${run.finished_at}\`
- Scout version: \`0.1.0\`
- Seed locator: \`${seed.locator}\`
- Exact Git commit: \`${packets[0]?.packet.seed.revision ?? gitInspection?.revision ?? "n/a"}\`
- Provider: \`${run.provider}\`
- Requested model: \`${run.requested_model}\`
- Resolved model(s): ${resolved.length ? resolved.map((x) => `\`${x}\``).join(", ") : "none"}
- Run status: \`${run.status}\`

## Budget accounting

| Resource | Configured maximum | Consumed |
| --- | ---: | ---: |
| HTTP requests | ${configured.max_requests} | ${consumed.requests ?? 0} |
| Content pages | ${configured.max_pages} | ${consumed.pages ?? 0} |
| Accepted raw bytes | ${configured.max_bytes} | ${consumed.bytes ?? 0} |
| Elapsed milliseconds | ${configured.max_elapsed_ms} | ${new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()} |
| Inference calls | ${configured.max_inference_calls} | ${consumed.inference_calls ?? 0} |
| Acquisition depth | ${configured.max_depth} | ${consumed.max_depth ?? 0} |

## Catalog boundary

Files inspected: ${files.length ? files.map((x) => `\`${x}\``).join(", ") : "none"}. ${packets.length ? "The selected boundary was the Markdown list structure recorded by the harness; the model selected exact byte ranges from that inspected structure rather than applying a source-specific parser." : "No catalog boundary was selected before the run ended."}

## Packets

| # | Source label | Selection reason | Packet ID | Investigation | Store |
| ---: | --- | --- | --- | --- | --- |
${rows || "| - | - | - | - | - | - |"}

Emitted packets: ${packetRows.filter((x) => x.storage_status === "emitted").length}. Reused packets: ${packetRows.filter((x) => x.storage_status === "reused").length}.

## Followed URLs

${followed.length ? followed.map((x) => `- ${x.label}: \`${x.locator}\` → \`${x.final}\` — ${x.status}${x.failure !== "none" ? ` (\`${x.failure}\`)` : ""}`).join("\n") : "- None."}

## Deliberately skipped selected links

${skipped.length ? skipped.map((x) => `- ${x.label}: \`${x.locator}\` — \`${x.reason}\``).join("\n") : "- None."}

## Normalized failures

${followed.filter((x) => x.failure !== "none").length || terminalReasons.length ? [...followed.filter((x) => x.failure !== "none").map((x) => `${x.label}: \`${x.failure}\``), ...terminalReasons.map((x) => `Run: \`${x}\``)].map((x) => `- ${x}`).join("\n") : "- None."}

## What Scout could not determine

${uncertainties.length ? uncertainties.map((x) => `- ${x}`).join("\n") : terminalReasons.length ? `- The run ended before packets were emitted: ${terminalReasons.map((x) => `\`${x}\``).join(", ")}.` : "- No acquisition uncertainty was recorded."}
- Scout intentionally did not determine catalog identity, entitlements, eligibility, capabilities, verification, or publication state.

## Reproduce

\`\`\`powershell
${command}
\`\`\`

The command requires the named provider credential in the environment. It has no paid-provider fallback.
`;
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true }); fs.writeFileSync(outputPath, report);
  return { outputPath: path.resolve(outputPath), packetCount: packets.length };
}
