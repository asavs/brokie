import fs from "node:fs";
import path from "node:path";

const tracePath = process.argv[2];
if (!tracePath) throw new Error("Usage: node local-index/v001/evaluate.mjs <run-trace.json>");
const reference = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "reference-set.json"), "utf8"));
const run = JSON.parse(fs.readFileSync(tracePath, "utf8"));
const staging = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "generated", "staging.json"), "utf8"));
const expected = new Map(reference.labels.map((label) => [label.source_id, label]));
const sources = new Map(staging.records.map((record) => [record.source_id, record]));
const rows = [];

function setScores(actualValues, expectedValues) {
  const actual = new Set(actualValues);
  const wanted = new Set(expectedValues);
  const tp = [...actual].filter((value) => wanted.has(value)).length;
  const fp = [...actual].filter((value) => !wanted.has(value)).length;
  const fn = [...wanted].filter((value) => !actual.has(value)).length;
  return { tp, fp, fn };
}

for (const trace of run.traces) {
  const label = expected.get(trace.source_id);
  if (!label || trace.status !== "ok") {
    rows.push({ source_id: trace.source_id, name: trace.name, status: trace.status, include_correct: false, capability: { tp: 0, fp: 0, fn: label?.capabilities.length ?? 0 }, needs: { tp: 0, fp: 0, fn: label?.user_needs.length ?? 0 } });
    continue;
  }
  rows.push({
    source_id: trace.source_id,
    name: trace.name,
    status: "ok",
    include_correct: trace.result.include === label.include,
    capability: setScores(trace.result.capabilities, label.capabilities),
    needs: setScores(trace.result.user_needs, label.user_needs),
  });
}

const sum = (field, part) => rows.reduce((total, row) => total + row[field][part], 0);
const precision = (tp, fp) => tp + fp ? tp / (tp + fp) : 1;
const recall = (tp, fn) => tp + fn ? tp / (tp + fn) : 1;
const capTp = sum("capability", "tp"), capFp = sum("capability", "fp"), capFn = sum("capability", "fn");
const needTp = sum("needs", "tp"), needFp = sum("needs", "fp"), needFn = sum("needs", "fn");
const successful = run.traces.filter((trace) => trace.status === "ok");
const requirements = successful.flatMap((trace) => (trace.result.requirements || []).map((requirement) => ({ trace, requirement })));
const groundedRequirements = requirements.filter(({ trace, requirement }) => {
  const raw = sources.get(trace.source_id)?.raw_text?.toLowerCase() || "";
  return requirement.evidence && raw.includes(String(requirement.evidence).toLowerCase());
});
const duplicateLabels = reference.labels.filter((label) => label.duplicate_group);
const duplicateHits = duplicateLabels.filter((label) => {
  const trace = successful.find((candidate) => candidate.source_id === label.source_id);
  const peerNames = duplicateLabels.filter((peer) => peer.duplicate_group === label.duplicate_group && peer.source_id !== label.source_id).map((peer) => peer.name.toLowerCase());
  return (trace?.result.possible_duplicate_names || []).some((name) => peerNames.includes(String(name).toLowerCase()));
});
const duplicateProposals = successful.flatMap((trace) => (trace.result.possible_duplicate_names || []).map((name) => ({ trace, name: String(name) })));
const validDuplicateProposals = duplicateProposals.filter(({ trace, name }) => {
  const label = expected.get(trace.source_id);
  return label?.duplicate_group && duplicateLabels.some((peer) => peer.source_id !== label.source_id && peer.duplicate_group === label.duplicate_group && peer.name.toLowerCase() === name.toLowerCase());
});
const report = {
  run_id: run.run_id,
  harness: run.harness,
  provider: run.provider,
  requested_model: run.requested_model,
  resolved_model: run.resolved_model,
  records_expected: reference.labels.length,
  records_returned: run.traces.length,
  schema_valid_rate: run.traces.filter((trace) => trace.status === "ok").length / reference.labels.length,
  inclusion_accuracy: rows.filter((row) => row.include_correct).length / reference.labels.length,
  capability_precision: precision(capTp, capFp),
  capability_recall: recall(capTp, capFn),
  user_need_precision: precision(needTp, needFp),
  user_need_recall: recall(needTp, needFn),
  unknown_preservation_rate: successful.length ? successful.filter((trace) => (trace.result.unsupported_or_unknown || []).length > 0).length / successful.length : 0,
  requirement_evidence_grounding_rate: requirements.length ? groundedRequirements.length / requirements.length : 1,
  duplicate_precision: duplicateProposals.length ? validDuplicateProposals.length / duplicateProposals.length : 1,
  duplicate_recall: duplicateLabels.length ? duplicateHits.length / duplicateLabels.length : 1,
  requirement_claims_checked: requirements.length,
  rows,
};
const reportPath = tracePath.replace(/\.json$/, ".evaluation.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, rows: undefined, report_path: reportPath }, null, 2));
