import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { acquisitionId } from "./canonical.mjs";
import { inspectLinks, inspectMarkdown, paginate } from "./inspect.mjs";

function coded(code, detail = "") { const error = new Error(code); error.code = code; error.detail = detail; return error; }

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

export function createGitFileTools({ repository, artifactStore, budget, ledger, runId }) {
  const tracked = new Set(repository.tracked.map((item) => item.replaceAll("\\", "/")));
  return {
    listFiles(cursor = 0) { return paginate(repository.tracked, cursor, 200); },
    readFile(relativePath) {
      if (path.isAbsolute(relativePath) || relativePath.includes("\0") || !tracked.has(relativePath.replaceAll("\\", "/"))) throw coded(path.isAbsolute(relativePath) || relativePath.includes("..") ? "path_escape" : "untracked_file");
      budget.depth(0); budget.reserve("page");
      const candidate = path.resolve(repository.root, relativePath);
      let real;
      try { real = fs.realpathSync(candidate); } catch { throw coded("untracked_file"); }
      if (!inside(repository.root, real)) throw coded("path_escape");
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) throw coded("path_escape");
      budget.reserve("byte", stat.size);
      const bytes = fs.readFileSync(real);
      if (bytes.length > stat.size) budget.reserve("byte", bytes.length - stat.size);
      const artifact = artifactStore.put(bytes, { kind: "repository_file", media_type: relativePath.toLowerCase().endsWith(".html") ? "text/html" : "text/markdown" });
      ledger?.event(runId, "tool", { name: "file.read", version: "0.1.0", input: { relative_path: relativePath }, status: "acquired", output: { artifact_id: artifact.artifact_id, byte_length: bytes.length }, budget: budget.snapshot() });
      return { bytes, artifact };
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

function robotsAllows(body, pathname) {
  let applies = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const split = line.indexOf(":"); if (split < 0) continue;
    const key = line.slice(0, split).trim().toLowerCase(), value = line.slice(split + 1).trim();
    if (key === "user-agent") applies = value === "*";
    if (applies && key === "disallow" && value && pathname.startsWith(value)) return false;
  }
  return true;
}

export function createHttpTool({ artifactStore, budget, transport = fetch, lookup = dns.lookup, ledger, runId, userAgent = "Brokie-Scout/0.1 (+https://github.com/asavs/brokie)", maxRedirects = 5 }) {
  const robotsCache = new Map(); const fetched = new Map();
  async function readBody(response) {
    if (!response.body?.getReader) {
      const raw = Buffer.from(await response.arrayBuffer()); budget.reserve("byte", raw.length); return raw;
    }
    const chunks = [], reader = response.body.getReader();
    try {
      while (true) {
        budget.checkTime(); const { done, value } = await reader.read(); if (done) break;
        const chunk = Buffer.from(value); budget.reserve("byte", chunk.length); chunks.push(chunk);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    return Buffer.concat(chunks);
  }
  async function dispatch(locator, { countPage, acceptBody = true } = {}) {
    let current = String(locator);
    if (countPage) budget.reserve("page");
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const url = await validatePublicUrl(current, lookup); budget.reserve("request");
      const controller = new AbortController(); const remaining = Math.max(1, budget.configured.max_elapsed_ms - (Date.now() - budget.started));
      const timer = setTimeout(() => controller.abort(), remaining);
      let response;
      try { response = await transport(url.href, { method: "GET", redirect: "manual", headers: { "User-Agent": userAgent, Accept: "text/html,text/plain,text/markdown" }, signal: controller.signal }); }
      catch (error) { throw coded(error?.name === "AbortError" ? "fetch_timeout" : "http_error"); }
      finally { clearTimeout(timer); }
      const raw = await readBody(response);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location"); if (!location) throw coded("http_error");
        if (hop >= maxRedirects) throw coded("redirect_limit_exceeded");
        current = new URL(location, url).href; continue;
      }
      if (!response.ok) throw coded("http_error", `HTTP ${response.status}`);
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
      catch (error) { if (error.code === "http_error") robotsCache.set(origin, ""); else throw error; }
    }
    if (!robotsAllows(robotsCache.get(origin), url.pathname)) throw coded("robots_denied");
  }
  return {
    async fetch(locator, { depth, kind, parent_acquisition_id = null, originating_link_id = null, authority }) {
      budget.depth(depth);
      const cacheKey = `${depth}\n${locator}`;
      if (fetched.has(cacheKey)) { ledger?.event(runId, "tool", { name: "http.fetch", version: "0.1.0", input: { locator, depth }, status: "cache_hit", output: { artifact_id: fetched.get(cacheKey).artifact_id }, budget: budget.snapshot() }); return fetched.get(cacheKey); }
      budget.reserve("page");
      const parsed = await validatePublicUrl(locator, lookup); await obeyRobots(parsed);
      try {
        const result = await dispatch(locator, { countPage: false });
        const artifact = artifactStore.put(result.bytes, { kind: "http_body", media_type: result.media_type });
        const acquisition = { acquisition_id: "", kind, requested_locator: locator, final_locator: result.final_locator, depth, depth_state: "resolved", parent_acquisition_id, originating_link_id, status: "acquired", artifact_id: artifact.artifact_id, http_status: result.status, failure: null, authority, excerpt_ids: [] };
        acquisition.acquisition_id = acquisitionId(acquisition);
        const value = { ...acquisition, bytes: result.bytes, last_modified: result.headers.get("last-modified") };
        fetched.set(cacheKey, value); ledger?.event(runId, "tool", { name: "http.fetch", version: "0.1.0", input: { locator, depth }, status: "acquired", output: { artifact_id: artifact.artifact_id, final_locator: result.final_locator }, budget: budget.snapshot() }); return value;
      } catch (error) { ledger?.event(runId, "tool", { name: "http.fetch", version: "0.1.0", input: { locator, depth }, status: "failed", failure_code: error.code ?? "other", budget: budget.snapshot() }); throw error; }
    },
  };
}

export function failedAcquisition({ kind, locator, depth, parent_acquisition_id = null, originating_link_id = null, authority, code, status = "blocked" }) {
  const value = { acquisition_id: "", kind, requested_locator: locator, final_locator: locator, depth, depth_state: "blocked", parent_acquisition_id, originating_link_id, status, artifact_id: null, http_status: null, failure: { code, detail: "" }, authority, excerpt_ids: [] };
  value.acquisition_id = acquisitionId(value); return value;
}
