import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prepareSourceObservation } from "../catalog/identity-plan.mjs";
import { createCatalogStore } from "../catalog/store.mjs";
import { openState } from "../maintainer/state.mjs";
import { createOmpProvider } from "../runtime/omp-provider.mjs";
import { packetToLibrarianBundle } from "../scout/adapter-v02.mjs";
import { ArtifactStore, PacketStore } from "../scout/store.mjs";
import { createPacketValidatorV02 } from "../scout/validate-packet-v02.mjs";
import { runLibrarianV02 } from "./run-v02-core.mjs";

const routeClasses = new Set(["free", "quota"]);

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function packetFiles(root) {
  const packetRoot = path.join(root, "packets");
  return fs.readdirSync(packetRoot, { withFileTypes: true }).flatMap((directory) => {
    if (!directory.isDirectory()) return [];
    const directoryPath = path.join(packetRoot, directory.name);
    return fs.readdirSync(directoryPath).filter((name) => name.endsWith(".json")).map((name) => path.join(directoryPath, name));
  });
}

function selectedPackets(sourceRoot, labels) {
  const selected = new Map();
  for (const packetPath of packetFiles(sourceRoot)) {
    const packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
    if (!labels.has(packet.subject.source_label)) continue;
    if (selected.has(packet.subject.source_label)) throw new Error(`duplicate packet label: ${packet.subject.source_label}`);
    selected.set(packet.subject.source_label, packet);
  }
  for (const label of labels) if (!selected.has(label)) throw new Error(`packet label not found: ${label}`);
  return selected;
}

function validateManifest(manifest) {
  const jobs = manifest.cases.reduce((count, item) => count + item.routes.length, 0);
  if (!Number.isInteger(manifest.max_jobs) || jobs > manifest.max_jobs) throw new Error(`evaluation has ${jobs} jobs, above max_jobs`);
  for (const item of manifest.cases) {
    for (const routeId of item.routes) {
      const route = manifest.routes[routeId];
      if (!route) throw new Error(`unknown route: ${routeId}`);
      if (!routeClasses.has(route.route_class)) throw new Error(`disallowed route class: ${route.route_class}`);
    }
  }
  return jobs;
}

function observedAtByPacket(sourceRoot) {
  const sourceState = new DatabaseSync(path.join(sourceRoot, "brokie-state.sqlite"), { readOnly: true });
  try {
    return new Map(sourceState.prepare("SELECT packet_id, observed_at FROM librarian_packet_queue").all().map((row) => [row.packet_id, row.observed_at]));
  } finally {
    sourceState.close();
  }
}

function usageTotal(attempts) {
  return attempts.reduce((total, attempt) => {
    const usage = attempt.usage || {};
    total.prompt_tokens += usage.prompt_tokens || 0;
    total.completion_tokens += usage.completion_tokens || 0;
    return total;
  }, { prompt_tokens: 0, completion_tokens: 0 });
}

function attemptSummary(attempt = {}) {
  return {
    resolved_model: attempt.resolved_model || "",
    proposal: attempt.proposal || null,
    compiler_actions: attempt.compiler_actions || [],
    candidate: attempt.candidate || null,
    validation_errors: attempt.validation_errors || [],
    attempt_error: attempt.error || "",
  };
}

function summarizeTrace(trace, context) {
  const accepted = trace.attempts.find(({ status }) => status === "accepted") || trace.attempts.at(-1);
  const attempt = attemptSummary(accepted);
  return {
    ...context,
    status: trace.status,
    run_id: trace.run_id,
    resolved_model: attempt.resolved_model,
    attempts: trace.attempts.length,
    usage: usageTotal(trace.attempts),
    proposal: attempt.proposal,
    compiler_actions: attempt.compiler_actions,
    candidate: attempt.candidate,
    validation_errors: attempt.validation_errors,
    error: trace.error || attempt.attempt_error,
  };
}

async function evaluateJob({ sourceRoot, outputRoot, packet, observedAt, routeId, route, purpose }) {
  const jobId = `${slug(packet.subject.source_label)}--${routeId}`;
  const jobRoot = path.join(outputRoot, "jobs", jobId);
  const resultPath = path.join(jobRoot, "result.json");
  if (fs.existsSync(resultPath)) return { ...JSON.parse(fs.readFileSync(resultPath, "utf8")), reused: true };
  fs.mkdirSync(jobRoot, { recursive: true });
  const artifacts = new ArtifactStore(sourceRoot);
  const packets = new PacketStore(sourceRoot, createPacketValidatorV02(artifacts));
  const { record } = packetToLibrarianBundle(packets.read(packet.packet_id), artifacts);
  const observation = prepareSourceObservation(record, observedAt);
  const state = openState(path.join(jobRoot, "state.sqlite"));
  const catalog = new DatabaseSync(path.join(jobRoot, "catalog.sqlite"));
  const tracePath = path.join(jobRoot, "trace.json");
  try {
    createCatalogStore(catalog);
    const provider = createOmpProvider({ model: route.model, routeClass: route.route_class, timeoutMs: route.timeout_ms });
    await runLibrarianV02({ catalog, state, provider, record, observation, tracePath });
    const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
    const result = summarizeTrace(trace, {
      evaluation_id: path.basename(outputRoot), job_id: jobId, source_label: packet.subject.source_label,
      packet_id: packet.packet_id, listing: packet.collection.text, purpose, route_id: routeId,
      requested_model: route.model, route_class: route.route_class,
    });
    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    catalog.close();
    state.close();
  }
}

export async function runEvaluationV02({ manifestPath, sourceRoot, outputRoot }) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const jobCount = validateManifest(manifest);
  if (path.basename(outputRoot) !== manifest.evaluation_id) throw new Error("output directory must end with evaluation_id");
  const labels = new Set(manifest.cases.map(({ source_label: label }) => label));
  const packets = selectedPackets(sourceRoot, labels);
  const observed = observedAtByPacket(sourceRoot);
  const results = [];
  for (const item of manifest.cases) {
    const packet = packets.get(item.source_label);
    const observedAt = observed.get(packet.packet_id);
    if (!observedAt) throw new Error(`queue observation not found: ${packet.packet_id}`);
    for (const routeId of item.routes) {
      const result = await evaluateJob({ sourceRoot, outputRoot, packet, observedAt, routeId, route: manifest.routes[routeId], purpose: item.purpose });
      results.push(result);
      process.stdout.write(`${result.reused ? "reused" : "finished"} ${result.job_id}: ${result.status} in ${result.attempts} attempt(s)\n`);
    }
  }
  const summary = { evaluation_id: manifest.evaluation_id, job_count: jobCount, max_model_calls: jobCount * 2, results };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
