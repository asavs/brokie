import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { CAPABILITIES, USER_NEEDS, sha } from "./lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const modelId = args.model ?? "nvidia/nemotron-3-ultra-550b-a55b";
const limit = Number(args.limit ?? 16);
const agentDir = path.join(import.meta.dirname, "pi-agent");
const outputDir = path.join(import.meta.dirname, "generated", "runs");
fs.mkdirSync(outputDir, { recursive: true });
if (!process.env.NVIDIA_NIM_API_KEY) throw new Error("NVIDIA_NIM_API_KEY is not available to this process");

const staging = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "generated", "staging.json"), "utf8"));
const reference = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "reference-set.json"), "utf8"));
const systemPrompt = fs.readFileSync(path.join(import.meta.dirname, "prompts", "librarian-v1.txt"), "utf8");
const wantedIds = new Set(reference.labels.slice(0, limit).map((label) => label.source_id));
const records = staging.records.filter((record) => wantedIds.has(record.source_id));
const runId = `run_pi_nvidia_${sha(`${modelId}\n${new Date().toISOString()}`, 12)}`;
const tracePath = path.join(outputDir, `${runId}.json`);
const startedAt = new Date();
const traces = [];

function extractJson(content) {
  const trimmed = String(content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("response did not contain a JSON object");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function validate(result, record) {
  const capabilityIds = new Set(CAPABILITIES.map(([id]) => id));
  const needIds = new Set(USER_NEEDS.map(([id]) => id));
  if (result.source_id !== record.source_id) throw new Error("source_id mismatch");
  if (typeof result.include !== "boolean") throw new Error("include must be boolean");
  if (!Array.isArray(result.capabilities) || result.capabilities.some((id) => !capabilityIds.has(id))) throw new Error("invalid capabilities");
  if (!Array.isArray(result.user_needs) || result.user_needs.some((id) => !needIds.has(id))) throw new Error("invalid user_needs");
  if (!Array.isArray(result.requirements) || !Array.isArray(result.possible_duplicate_names) || !Array.isArray(result.unsupported_or_unknown)) throw new Error("missing arrays");
  if (typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 1) throw new Error("invalid confidence");
}

const runtime = await ModelRuntime.create({
  agentDir,
  authPath: path.join(agentDir, "auth.json"),
  modelsPath: path.join(agentDir, "models.json"),
  allowModelNetwork: false,
});
await runtime.setRuntimeApiKey("nvidia", process.env.NVIDIA_NIM_API_KEY);
const model = runtime.getModel("nvidia", modelId);
if (!model) throw new Error(`Pi did not load nvidia/${modelId}`);

for (const record of records) {
  const requestStarted = Date.now();
  let text = "";
  let session;
  try {
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const loader = new DefaultResourceLoader({
      cwd: import.meta.dirname,
      agentDir,
      settingsManager,
      systemPromptOverride: () => systemPrompt,
    });
    await loader.reload();
    ({ session } = await createAgentSession({
      cwd: import.meta.dirname,
      agentDir,
      model,
      thinkingLevel: "off",
      modelRuntime: runtime,
      tools: [],
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
      settingsManager,
    }));
    session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") text += event.assistantMessageEvent.delta;
    });
    const comparisonNames = records.filter((candidate) => candidate.source_id !== record.source_id).map((candidate) => candidate.source_name);
    const userContent = JSON.stringify({
      controlled_capabilities: Object.fromEntries(CAPABILITIES),
      controlled_user_needs: Object.fromEntries(USER_NEEDS),
      comparison_candidate_names: comparisonNames,
      record: {
        source_id: record.source_id,
        name: record.source_name,
        category: record.source_category,
        description: record.source_description,
        offer_detail: record.source_offer_detail,
        eligibility: record.source_eligibility,
        parent_provider: record.parent_provider,
      },
    });
    await session.prompt(userContent);
    const result = extractJson(text);
    validate(result, record);
    traces.push({ source_id: record.source_id, name: record.source_name, status: "ok", latency_ms: Date.now() - requestStarted, resolved_model: model.id, result, raw_content: text });
  } catch (error) {
    traces.push({ source_id: record.source_id, name: record.source_name, status: "error", latency_ms: Date.now() - requestStarted, error: String(error), raw_content: text });
  } finally {
    session?.dispose();
  }
  fs.writeFileSync(tracePath, `${JSON.stringify({ run_id: runId, harness: "pi-sdk", provider: "nvidia", requested_model: modelId, resolved_model: model.id, prompt_version: "librarian-v1", started_at: startedAt.toISOString(), traces }, null, 2)}\n`);
}

const finishedAt = new Date();
const status = traces.every((trace) => trace.status === "ok") ? "complete" : traces.some((trace) => trace.status === "ok") ? "partial" : "failed";
const db = new DatabaseSync(path.join(import.meta.dirname, "generated", "brokie-v0.0.1.sqlite"));
db.prepare(`INSERT OR REPLACE INTO librarian_runs
  (run_id,harness,provider,requested_model,resolved_model,prompt_version,started_at,finished_at,latency_ms,request_count,input_tokens,output_tokens,status,error,trace_path)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    runId, "pi-sdk", "nvidia", modelId, model.id, "librarian-v1", startedAt.toISOString(), finishedAt.toISOString(),
    finishedAt - startedAt, traces.length, null, null, status,
    traces.filter((trace) => trace.status === "error").map((trace) => trace.error).join(" | "), path.relative(import.meta.dirname, tracePath),
  );
db.close();
console.log(JSON.stringify({ run_id: runId, status, records: traces.length, succeeded: traces.filter((trace) => trace.status === "ok").length, requested_model: modelId, resolved_model: model.id, trace_path: tracePath }, null, 2));
