import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function remoteLocator(locator) {
  if (path.isAbsolute(locator) || /^[A-Za-z]:[\\/]/.test(locator)) return null;
  let parsed;
  try { parsed = new URL(locator); } catch { return null; }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error("remote Git seeds must use HTTP or HTTPS");
  }
  parsed.hash = "";
  return parsed.href;
}

function cacheName(locator) {
  return crypto.createHash("sha256").update(locator).digest("hex").slice(0, 24);
}

function validClone(target) {
  return fs.existsSync(path.join(target, ".git"));
}

function cloneRemote(locator, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  git(["clone", "--no-checkout", "--filter=blob:none", "--quiet", "--", locator, target]);
}

function refreshRemote(target) {
  git(["-C", target, "fetch", "--quiet", "--prune", "origin"]);
}

export function materializeGitSeed(locator, { cacheRoot, revision = null } = {}) {
  const remote = remoteLocator(locator);
  if (!remote) {
    const local = path.resolve(locator);
    if (!fs.existsSync(local)) throw new Error(`Git seed does not exist: ${local}`);
    return { path: local, locator: local, revision: revision ?? "HEAD", cached: false };
  }
  if (!cacheRoot) throw new Error("remote Git seed requires cacheRoot");
  const target = path.join(path.resolve(cacheRoot), cacheName(remote));
  if (fs.existsSync(target) && !validClone(target)) {
    throw new Error(`Git cache path is not a repository: ${target}`);
  }
  if (validClone(target)) refreshRemote(target);
  else cloneRemote(remote, target);
  return {
    path: target,
    locator: remote,
    revision: revision ?? "refs/remotes/origin/HEAD",
    cached: true,
  };
}
