import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { acquisitionId } from "./canonical.mjs";
import { inspectLinks, inspectMarkdown, paginate } from "./inspect.mjs";

function coded(code, detail = "", properties = {}) { const error = new Error(code); error.code = code; error.detail = detail; Object.assign(error, properties); return error; }

export function sanitizeLocator(locator) {
  try { const url = new URL(locator); if (url.username || url.password) { url.username = ""; url.password = ""; } return url.href; } catch { return String(locator); }
}

export function inspectGitRepository(locator) {
  const supplied = path.resolve(locator);
  const git = (cwd, args) => execFileSync("git", ["-c", `safe.directory=${cwd.replaceAll("\\", "/")}`, "-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();
  const root = git(supplied, ["rev-parse", "--show-toplevel"]);
  const revision = git(root, ["rev-parse", "HEAD"]);
  const commit_time = git(root, ["show", "-s", "--format=%cI", "HEAD"]);
  const remote = (() => { try { return git(root, ["config", "--get", "remote.origin.url"]); } catch { return ""; } })();
  const tracked = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean).sort((a, b) => a.localeCompare(b, "en"));
  return { root: path.resolve(root), revision, commit_time, remote, tracked };
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function createGitFileTools({ repository, artifactStore, budget, ledger, runId, fileSystem = fs }) {
  const tracked = new Set(repository.tracked.map((item) => item.replaceAll("\\", "/")));
  return {
    listFiles(cursor = 0) { return paginate(repository.tracked, cursor, 200); },
    readFile(relativePath) {
      const started = Date.now(), startedAt = new Date().toISOString(), before = budget.snapshot(); let status = "failed", failureCode = null, output = null;
      try {
        if (path.isAbsolute(relativePath) || relativePath.includes("\0") || !tracked.has(relativePath.replaceAll("\\", "/"))) throw coded(path.isAbsolute(relativePath) || relativePath.includes("..") ? "path_escape" : "untracked_file");
        budget.depth(0); budget.reserve("page");
        const candidate = path.resolve(repository.root, relativePath);
        let real;
        try { real = fileSystem.realpathSync(candidate); } catch { throw coded("untracked_file"); }
        if (!inside(repository.root, real)) throw coded("path_escape");
        const stat = fileSystem.lstatSync(candidate);
        if (stat.isSymbolicLink() || !stat.isFile()) throw coded("path_escape");
        budget.ensure("byte", stat.size);
        const handle = fileSystem.openSync(real, "r"); let bytes;
        try {
          const opened = fileSystem.fstatSync(handle); if (!opened.isFile() || opened.size !== stat.size) throw coded("content_too_large");
          bytes = Buffer.alloc(opened.size); let offset = 0;
          while (offset < bytes.length) { budget.checkTime(); const count = fileSystem.readSync(handle, bytes, offset, Math.min(64 * 1024, bytes.length - offset), offset); if (!count) { bytes = bytes.subarray(0, offset); break; } budget.reserve("byte", count); offset += count; }
          const probe = Buffer.alloc(1); if (fileSystem.readSync(handle, probe, 0, 1, opened.size) > 0) throw coded("content_too_large");
        } finally { fileSystem.closeSync(handle); }
        const artifact = artifactStore.put(bytes, { kind: "repository_file", media_type: relativePath.toLowerCase().endsWith(".html") ? "text/html" : "text/markdown" });
        status = "acquired"; output = { artifact_id: artifact.artifact_id, byte_length: bytes.length };
        ledger?.event(runId, "tool", { name: "file.read", version: "0.1.0", input: { relative_path: relativePath }, status, output, budget: budget.snapshot() });
        return { bytes, artifact };
      } catch (error) { failureCode = error.code ?? "other"; ledger?.event(runId, "tool", { name: "file.read", version: "0.1.0", input: { relative_path: relativePath }, status: "failed", failure_code: failureCode, budget: budget.snapshot() }); throw error; }
      finally { ledger?.toolCall(runId, { name: "file.read", version: "0.1.0", started_at: startedAt, finished_at: new Date().toISOString(), input: { relative_path: relativePath }, status, output, failure_code: failureCode, budget_before: before, budget_after: budget.snapshot(), elapsed_ms: Date.now() - started }); }
    },
    inspectMarkdown(bytes) { return inspectMarkdown(bytes); },
    inspectLinks(bytes, options) { return inspectLinks(bytes, options); },
  };
}

function ipv4Blocked(address) {
  const p = address.split(".").map(Number); const n = ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  const cidr = (base, bits) => (n >>> (32 - bits)) === (base >>> (32 - bits));
  return cidr(0x00000000, 8) || cidr(0x0a000000, 8) || cidr(0x64400000, 10) || cidr(0x7f000000, 8) || cidr(0xa9fe0000, 16) || cidr(0xac100000, 12) || cidr(0xc0a80000, 16) || cidr(0xe0000000, 4);
}
function ipv6Blocked(address) {
  let a = address.toLowerCase().replace(/^\[|\]$/g, "");
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (dotted) {
    const octets = dotted[1].split(".").map(Number);
    a = `${a.slice(0, dotted.index)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = a.split("::"); if (halves.length > 2) return true;
  const left = halves[0] ? halves[0].split(":") : [], right = halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return true;
  const words = groups.map((x) => Number.parseInt(x, 16));
  if (words.every((x) => x === 0) || words.slice(0, 7).every((x) => x === 0) && words[7] === 1) return true;
  const first = words[0];
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return true;
  if (words.slice(0, 5).every((x) => x === 0) && words[5] === 0xffff) {
    return ipv4Blocked(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  return false;
}

export async function validatePublicUrl(locator, lookup = dns.lookup) {
  let url; try { url = new URL(locator); } catch { throw coded("unsupported_scheme"); }
  if (!["http:", "https:"].includes(url.protocol)) throw coded("unsupported_scheme");
  if (url.username || url.password) throw coded("ssrf_blocked");
  const literal = net.isIP(url.hostname.replace(/^\[|\]$/g, ""));
  const addresses = literal ? [{ address: url.hostname.replace(/^\[|\]$/g, ""), family: literal }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address, family }) => family === 4 ? ipv4Blocked(address) : ipv6Blocked(address))) throw coded("ssrf_blocked");
  return url;
}

export function robotsAllows(body, pathname, agent = "Brokie-Scout") {
  const groups = []; let current = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const split = line.indexOf(":"); if (split < 0) continue;
    const key = line.slice(0, split).trim().toLowerCase(), value = line.slice(split + 1).trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && ["allow", "disallow"].includes(key)) current.rules.push({ kind: key, pattern: value });
  }
  const lowered = agent.toLowerCase();
  const scored = groups.map((group) => ({ group, score: Math.max(-1, ...group.agents.map((value) => value === "*" ? 0 : lowered.includes(value) ? value.length : -1)) })).filter((item) => item.score >= 0);
  if (!scored.length) return true;
  const best = Math.max(...scored.map((item) => item.score)), matches = [];
  for (const { group, score } of scored) if (score === best) for (const rule of group.rules) {
    if (!rule.pattern) continue;
    const anchored = rule.pattern.endsWith("$"), source = rule.pattern.replace(/\$$/, "").split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    if (new RegExp(`^${source}${anchored ? "$" : ""}`).test(pathname)) matches.push(rule);
  }
  if (!matches.length) return true;
  matches.sort((a, b) => b.pattern.length - a.pattern.length || (a.kind === "allow" ? -1 : 1));
  return matches[0].kind === "allow";
}

export function createHttpTool({ artifactStore, budget, transport = fetch, lookup = dns.lookup, ledger, runId, userAgent = "Brokie-Scout/0.1 (+https://github.com/asavs/brokie)", maxRedirects = 5 }) {
  const robotsCache = new Map(); const fetched = new Map();
  async function readBody(response, signal) {
    if (!response.body?.getReader) throw coded("other", "transport did not provide a bounded response stream");
    const chunks = [], reader = response.body.getReader();
    const abort = () => { reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      while (true) {
        budget.checkTime(); const { done, value } = await reader.read(); if (done) break;
        if (signal.aborted) throw coded("budget_time_exhausted");
        const chunk = Buffer.from(value); budget.reserve("byte", chunk.length); chunks.push(chunk);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { signal.removeEventListener("abort", abort); }
    if (signal.aborted) throw coded("budget_time_exhausted");
    return Buffer.concat(chunks);
  }
  async function dispatch(locator, { countPage, acceptBody = true } = {}) {
    let current = String(locator);
    if (countPage) budget.reserve("page");
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const url = await validatePublicUrl(current, lookup); budget.reserve("request");
      const controller = new AbortController(); const remaining = Math.max(1, budget.remainingElapsedMs()); let deadlineExpired = false;
      const timer = setTimeout(() => { deadlineExpired = true; controller.abort(); }, remaining);
      let response, raw;
      try { response = await transport(url.href, { method: "GET", redirect: "manual", headers: { "User-Agent": userAgent, Accept: "text/html,text/plain,text/markdown" }, signal: controller.signal }); raw = await readBody(response, controller.signal); }
      catch (error) { if (error?.code) throw error; throw coded(deadlineExpired ? "budget_time_exhausted" : error?.name === "AbortError" ? "fetch_timeout" : "http_error"); }
      finally { clearTimeout(timer); }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location"); if (!location) throw coded("http_error");
        if (hop >= maxRedirects) throw coded("redirect_limit_exceeded");
        current = new URL(location, url).href; continue;
      }
      if (!response.ok) throw coded("http_error", `HTTP ${response.status}`, { http_status: response.status });
      if (!acceptBody) return { bytes: raw, final_locator: url.href, status: response.status, headers: response.headers };
      const mediaType = (response.headers.get("content-type") ?? "").split(";", 1)[0].toLowerCase();
      if (!new Set(["text/html", "text/plain", "text/markdown", "text/x-markdown"]).has(mediaType)) throw coded("unsupported_content_type");
      return { bytes: raw, final_locator: url.href, status: response.status, headers: response.headers, media_type: mediaType };
    }
    throw coded("redirect_limit_exceeded");
  }
  async function obeyRobots(url) {
    const origin = url.origin;
    if (!robotsCache.has(origin)) {
      try { const result = await dispatch(`${origin}/robots.txt`, { countPage: false, acceptBody: false }); robotsCache.set(origin, result.bytes.toString("utf8")); }
      catch (error) {
        if ([404, 410].includes(error.http_status)) robotsCache.set(origin, "");
        else if ([401, 403].includes(error.http_status)) throw coded("robots_denied");
        else throw error;
      }
    }
    if (!robotsAllows(robotsCache.get(origin), `${url.pathname}${url.search}`)) throw coded("robots_denied");
  }
  return {
    async fetch(locator, { depth, kind, parent_acquisition_id = null, originating_link_id = null, authority }) {
      const started = Date.now(), startedAt = new Date().toISOString(), before = budget.snapshot(); let status = "failed", failureCode = null, output = null;
      try {
        budget.depth(depth);
        const cacheKey = `${depth}\n${locator}`;
        let cached = fetched.get(cacheKey); const cacheHit = Boolean(cached);
        if (!cached) {
          budget.reserve("page");
          const parsed = await validatePublicUrl(locator, lookup); await obeyRobots(parsed);
          const result = await dispatch(locator, { countPage: false });
          const artifact = artifactStore.put(result.bytes, { kind: "http_body", media_type: result.media_type });
          cached = { artifact_id: artifact.artifact_id, bytes: result.bytes, final_locator: result.final_locator, http_status: result.status, last_modified: result.headers.get("last-modified") };
          fetched.set(cacheKey, cached);
        }
        const acquisition = { acquisition_id: "", kind, requested_locator: locator, final_locator: cached.final_locator, depth, depth_state: "resolved", parent_acquisition_id, originating_link_id, status: "acquired", artifact_id: cached.artifact_id, http_status: cached.http_status, failure: null, authority, link: null, excerpt_ids: [] };
        acquisition.acquisition_id = acquisitionId(acquisition);
        const value = { ...acquisition, bytes: cached.bytes, last_modified: cached.last_modified };
        status = cacheHit ? "cache_hit" : "acquired"; output = { artifact_id: cached.artifact_id, final_locator: cached.final_locator };
        ledger?.event(runId, "tool", { name: "http.fetch", version: "0.1.0", input: { locator: sanitizeLocator(locator), depth }, status, output, budget: budget.snapshot() }); return value;
      } catch (error) { failureCode = error.code ?? "other"; ledger?.event(runId, "tool", { name: "http.fetch", version: "0.1.0", input: { locator: sanitizeLocator(locator), depth }, status: "failed", failure_code: failureCode, budget: budget.snapshot() }); throw error; }
      finally { ledger?.toolCall(runId, { name: "http.fetch", version: "0.1.0", started_at: startedAt, finished_at: new Date().toISOString(), input: { locator: sanitizeLocator(locator), depth }, status, output, failure_code: failureCode, budget_before: before, budget_after: budget.snapshot(), elapsed_ms: Date.now() - started }); }
    },
  };
}

export function failedAcquisition({ kind, locator, depth, parent_acquisition_id = null, originating_link_id = null, authority, code, status = "blocked" }) {
  const value = { acquisition_id: "", kind, requested_locator: locator, final_locator: locator, depth, depth_state: status === "skipped" ? "discovered" : "blocked", parent_acquisition_id, originating_link_id, status, artifact_id: null, http_status: null, failure: { code, detail: "" }, authority, link: null, excerpt_ids: [] };
  value.acquisition_id = acquisitionId(value); return value;
}
