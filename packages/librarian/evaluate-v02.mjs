import path from "node:path";
import { runEvaluationV02 } from "./evaluation-v02.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = path.resolve(import.meta.dirname, "../..");
const manifestPath = path.resolve(option("manifest", path.join(root, "evaluations", "librarian-v0.2-ten.json")));
const sourceRoot = path.resolve(option("source-state-dir", path.join(root, "var", "pipeline-url-final2")));
const evaluationId = path.basename(manifestPath, ".json").replace("librarian-v0.2-ten", "librarian-v0.2-ten-2026-08-26");
const outputRoot = path.resolve(option("output-dir", path.join(root, "var", evaluationId)));

const result = await runEvaluationV02({ manifestPath, sourceRoot, outputRoot });
console.log(JSON.stringify({ evaluation_id: result.evaluation_id, jobs: result.job_count, max_model_calls: result.max_model_calls, output_root: outputRoot }, null, 2));
