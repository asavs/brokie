import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const readme = positional[0];
const csv = positional[1];
const stateDir = path.resolve(option("state-dir", path.join(root, "var")));
if (!readme || !csv) throw new Error("Usage: node packages/maintainer/job.mjs <catalog.md> <startup.csv> [--state-dir=<path>]");

fs.mkdirSync(path.join(stateDir, "logs"), { recursive: true });
const lockPath = path.join(stateDir, "refresh.lock");
let lock;
try {
  lock = fs.openSync(lockPath, "wx");
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(JSON.stringify({ status: "skipped", reason: "refresh_already_running", lock_path: lockPath }));
    process.exit(75);
  }
  throw error;
}

const startedAt = new Date().toISOString();
try {
  fs.writeFileSync(lock, `${JSON.stringify({ pid: process.pid, started_at: startedAt })}\n`);
  const result = spawnSync(process.execPath, [path.join(root, "packages", "maintainer", "refresh.mjs"), path.resolve(readme), path.resolve(csv), `--state-dir=${stateDir}`], { encoding: "utf8" });
  const entry = { started_at: startedAt, finished_at: new Date().toISOString(), exit_code: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  fs.appendFileSync(path.join(stateDir, "logs", "refresh.ndjson"), `${JSON.stringify(entry)}\n`);
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exitCode = result.status || 1;
  } else process.stdout.write(result.stdout);
} finally {
  fs.closeSync(lock);
  fs.unlinkSync(lockPath);
}
