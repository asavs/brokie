import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROUTE_CLASSES = new Set(["free", "quota", "paid"]);
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

function messageText(message) {
  if (typeof message.content === "string") return message.content;
  return JSON.stringify(message.content);
}

function splitMessages(messages) {
  const system = messages.filter(({ role }) => role === "system").map(messageText).join("\n\n");
  const conversation = messages.filter(({ role }) => role !== "system").map(({ role, content }) => ({ role, content: typeof content === "string" ? content : JSON.stringify(content) }));
  return { system: system || "Complete the supplied task.", conversation };
}

function assistantText(message) {
  return (message?.content ?? []).filter(({ type }) => type === "text").map(({ text }) => text).join("");
}

function normalizedUsage(usage = {}) {
  return {
    prompt_tokens: usage.input ?? usage.input_tokens ?? usage.prompt_tokens ?? 0,
    completion_tokens: usage.output ?? usage.output_tokens ?? usage.completion_tokens ?? 0,
  };
}

export function parseOmpJsonOutput(stdout, requestedModel) {
  const events = String(stdout).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const completed = events.filter((event) => event.type === "message_end" && event.message?.role === "assistant").at(-1);
  if (!completed) throw new Error("OMP did not emit a completed assistant message");
  const message = completed.message;
  if (["error", "aborted"].includes(message.stopReason)) {
    throw new Error(message.errorMessage || `OMP request ${message.stopReason}`);
  }
  const content = assistantText(message);
  if (!content.trim()) throw new Error("OMP returned an empty assistant response");
  const resolved = [message.provider, message.model].filter(Boolean).join("/") || requestedModel;
  return { content, reasoning: null, resolved_model: resolved, usage: normalizedUsage(message.usage), harness: "omp" };
}

function execute(command, args, { cwd, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, signal, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [], stderr = [];
    let bytes = 0;
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const collect = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) child.kill();
      else target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(stdout).toString("utf8");
      const errors = Buffer.concat(stderr).toString("utf8").trim();
      if (bytes > MAX_OUTPUT_BYTES) reject(new Error("OMP output exceeded the bounded capture size"));
      else if (code !== 0) reject(new Error(`OMP exited ${code}: ${errors || "no diagnostic"}`));
      else resolve({ stdout: output, stderr: errors });
    });
  });
}

export function createOmpProvider({
  model,
  routeClass = "quota",
  allowPaid = false,
  profile = "",
  command = "omp",
  timeoutMs = 120_000,
  executeImpl = execute,
}) {
  if (!model) throw new Error("OMP model is required");
  if (!ROUTE_CLASSES.has(routeClass)) throw new Error(`invalid OMP route class: ${routeClass}`);
  if (routeClass === "paid" && !allowPaid) throw new Error("paid OMP route requires explicit authorization");
  return {
    provider: `omp-${routeClass}`,
    model,
    route_class: routeClass,
    async complete(messages, { signal } = {}) {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "brokie-omp-"));
      try {
        const { system, conversation } = splitMessages(messages);
        const systemPath = path.join(temporary, "SYSTEM.md");
        const requestPath = path.join(temporary, "request.json");
        fs.writeFileSync(systemPath, system);
        fs.writeFileSync(requestPath, JSON.stringify({ conversation }));
        const args = [
          "-p", "--mode=json", "--no-session", "--no-tools", "--no-extensions",
          "--no-skills", "--no-rules", ...(profile ? [`--profile=${profile}`] : []), `--model=${model}`,
          "--thinking=off", `--max-time=${Math.max(1, Math.ceil(timeoutMs / 1000))}`,
          `--system-prompt=${systemPath}`, `@${requestPath}`,
        ];
        const result = await executeImpl(command, args, { cwd: temporary, signal, timeoutMs });
        return parseOmpJsonOutput(result.stdout, model);
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    },
  };
}
