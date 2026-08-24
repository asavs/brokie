import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CAPABILITIES, USER_NEEDS, sha } from "./lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const provider = args.provider ?? "nvidia";
const model = args.model ?? "deepseek-ai/deepseek-v4-flash";
const harness = args.harness ?? "direct";
const limit = Number(args.limit ?? 16);
const requestTimeoutMs = Number(args.timeout_ms ?? 90000);
const maxTokens = Number(args.max_tokens ?? 1800);
const baseUrl = provider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : "https://openrouter.ai/api/v1";
const keyName = provider === "nvidia" ? "NVIDIA_NIM_API_KEY" : "OPENROUTER_API_KEY";
const apiKey = process.env[keyName];
if (!apiKey) throw new Error(`${keyName} is not available to this process`);

const outputDir = path.join(import.meta.dirname, "generated", "runs");
fs.mkdirSync(outputDir, { recursive: true });
const staging = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "generated", "staging.json"), "utf8"));
const reference = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "reference-set.json"), "utf8"));
const prompt = fs.readFileSync(path.join(import.meta.dirname, "prompts", "librarian-v1.txt"), "utf8");
const wantedIds = new Set(reference.labels.slice(0, limit).map((label) => label.source_id));
const records = staging.records.filter((record) => wantedIds.has(record.source_id));
const runId = `run_${harness}_${provider}_${sha(`${model}\n${new Date().toISOString()}`, 12)}`;
const tracePath = path.join(outputDir, `${runId}.json`);
const startedAt = new Date();
const traces = [];
let inputTokens = 0;
let outputTokens = 0;
let resolvedModel = "";

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
  if (typeof result.explanation !== "string") throw new Error("invalid explanation");
}

for (const record of records) {
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
  const requestStarted = Date.now();
  let trace;
  let responseBody = null;
  let rawContent = "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider === "openrouter" ? { "HTTP-Referer": "https://brokie.local", "X-Title": "Brokie Librarian v0.0.1" } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: prompt }, { role: "user", content: userContent }],
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await response.json();
    responseBody = body;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
    resolvedModel ||= body.model ?? model;
    rawContent = body.choices?.[0]?.message?.content ?? "";
    const result = extractJson(rawContent);
    validate(result, record);
    inputTokens += body.usage?.prompt_tokens ?? 0;
    outputTokens += body.usage?.completion_tokens ?? 0;
    trace = { source_id: record.source_id, name: record.source_name, status: "ok", latency_ms: Date.now() - requestStarted, resolved_model: body.model ?? model, usage: body.usage ?? null, result, raw_content: rawContent };
  } catch (error) {
    trace = {
      source_id: record.source_id,
      name: record.source_name,
      status: "error",
      latency_ms: Date.now() - requestStarted,
      error: String(error),
      resolved_model: responseBody?.model ?? "",
      usage: responseBody?.usage ?? null,
      raw_content: rawContent,
      reasoning_content: responseBody?.choices?.[0]?.message?.reasoning_content ?? responseBody?.choices?.[0]?.message?.reasoning ?? "",
    };
  }
  traces.push(trace);
  fs.writeFileSync(tracePath, `${JSON.stringify({ run_id: runId, harness, provider, requested_model: model, resolved_model: resolvedModel, prompt_version: "librarian-v1", started_at: startedAt.toISOString(), traces }, null, 2)}\n`);
}

const finishedAt = new Date();
const status = traces.every((trace) => trace.status === "ok") ? "complete" : traces.some((trace) => trace.status === "ok") ? "partial" : "failed";
const db = new DatabaseSync(path.join(import.meta.dirname, "generated", "brokie-v0.0.1.sqlite"));
db.prepare(`INSERT OR REPLACE INTO librarian_runs
  (run_id,harness,provider,requested_model,resolved_model,prompt_version,started_at,finished_at,latency_ms,request_count,input_tokens,output_tokens,status,error,trace_path)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    runId, harness, provider, model, resolvedModel, "librarian-v1", startedAt.toISOString(), finishedAt.toISOString(),
    finishedAt - startedAt, traces.length, inputTokens || null, outputTokens || null, status,
    traces.filter((trace) => trace.status === "error").map((trace) => trace.error).join(" | "), path.relative(import.meta.dirname, tracePath),
  );
db.close();
console.log(JSON.stringify({ run_id: runId, status, records: traces.length, succeeded: traces.filter((trace) => trace.status === "ok").length, requested_model: model, resolved_model: resolvedModel, input_tokens: inputTokens, output_tokens: outputTokens, trace_path: tracePath }, null, 2));
