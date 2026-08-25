import { execFileSync } from "node:child_process";
import path from "node:path";
import { paginate } from "./inspect.mjs";

function coded(code) { const error = new Error(code); error.code = code; return error; }
function git(cwd, args, encoding = "utf8") {
  return execFileSync("git", ["-c", `safe.directory=${cwd.replaceAll("\\", "/")}`, "-C", cwd, ...args], { encoding, windowsHide: true });
}

export function inspectGitRevision(locator, revision = "HEAD") {
  const supplied = path.resolve(locator);
  const root = git(supplied, ["rev-parse", "--show-toplevel"]).trim();
  const resolvedRevision = git(root, ["rev-parse", `${revision}^{commit}`]).trim();
  const commit_time = git(root, ["show", "-s", "--format=%cI", resolvedRevision]).trim();
  const remote = (() => { try { return git(root, ["config", "--get", "remote.origin.url"]).trim(); } catch { return ""; } })();
  const tree = git(root, ["ls-tree", "-r", "-z", "--full-tree", resolvedRevision]);
  const entries = tree.split("\0").filter(Boolean).map((line) => {
    const match = /^(\d+)\s+(\w+)\s+([0-9a-f]+)\t([\s\S]+)$/.exec(line);
    if (!match) throw coded("parse_error");
    return { mode: match[1], type: match[2], object_id: match[3], path: match[4] };
  }).filter(({ type, mode }) => type === "blob" && mode !== "120000").sort((a, b) => a.path.localeCompare(b.path, "en"));
  return { root: path.resolve(root), revision: resolvedRevision, commit_time, remote, entries, tracked: entries.map(({ path: relativePath }) => relativePath) };
}

export function createGitRevisionTools({ repository, artifactStore, budget, ledger, runId }) {
  const entries = new Map(repository.entries.map((entry) => [entry.path.replaceAll("\\", "/"), entry]));
  return {
    listFiles(cursor = 0) { return paginate(repository.tracked, cursor, 200); },
    readFile(relativePath) {
      const started = Date.now(), startedAt = new Date().toISOString(), before = budget.snapshot();
      let status = "failed", failureCode = null, output = null;
      try {
        const normalized = String(relativePath).replaceAll("\\", "/");
        if (path.isAbsolute(relativePath) || relativePath.includes("\0") || relativePath.split("/").includes("..")) throw coded("path_escape");
        const entry = entries.get(normalized); if (!entry) throw coded("untracked_file");
        budget.depth(0); budget.reserve("page");
        const bytes = git(repository.root, ["cat-file", "blob", entry.object_id], null);
        budget.ensure("byte", bytes.length); budget.reserve("byte", bytes.length);
        const media_type = normalized.toLowerCase().endsWith(".html") ? "text/html" : "text/markdown";
        const artifact = artifactStore.put(bytes, { kind: "repository_file", media_type });
        status = "acquired"; output = { artifact_id: artifact.artifact_id, byte_length: bytes.length, revision: repository.revision, object_id: entry.object_id };
        ledger?.event(runId, "tool", { name: "git.blob.read", version: "0.2.0", input: { relative_path: normalized, revision: repository.revision }, status, output, budget: budget.snapshot() });
        return { bytes, artifact, object_id: entry.object_id };
      } catch (error) {
        failureCode = error.code ?? "other";
        ledger?.event(runId, "tool", { name: "git.blob.read", version: "0.2.0", input: { relative_path: String(relativePath), revision: repository.revision }, status: "failed", failure_code: failureCode, budget: budget.snapshot() });
        throw error;
      } finally {
        ledger?.toolCall(runId, { name: "git.blob.read", version: "0.2.0", started_at: startedAt, finished_at: new Date().toISOString(), input: { relative_path: String(relativePath), revision: repository.revision }, status, output, failure_code: failureCode, budget_before: before, budget_after: budget.snapshot(), elapsed_ms: Date.now() - started });
      }
    },
  };
}

