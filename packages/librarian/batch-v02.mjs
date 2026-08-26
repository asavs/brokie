import fs from "node:fs";
import path from "node:path";
import { prepareSourceObservation } from "../catalog/identity-plan.mjs";
import { packetToLibrarianBundle } from "../scout/adapter-v02.mjs";
import { runLibrarianV02 } from "./run-v02-core.mjs";
import { claimNextLibrarianJob, finishLibrarianJob, librarianQueueSummary } from "./queue.mjs";

export async function runLibrarianBatchV02({ state, catalog, packets, artifacts, provider, stateRoot, limit = 1 }) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("batch limit must be a positive integer");
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const job = claimNextLibrarianJob(state);
    if (!job) break;
    let result;
    try {
      const packet = packets.read(job.packet_id);
      const { record } = packetToLibrarianBundle(packet, artifacts);
      const observation = prepareSourceObservation(record, job.observed_at);
      const tracePath = path.join(stateRoot, "librarian-runs", `${job.packet_id}-${job.attempt_count}.json`);
      fs.mkdirSync(path.dirname(tracePath), { recursive: true });
      result = await runLibrarianV02({ catalog, state, provider, record, observation, tracePath });
    } catch (error) {
      result = { status: "failed", error: String(error) };
    }
    finishLibrarianJob(state, job.packet_id, result);
    results.push({ packet_id: job.packet_id, ...result });
  }
  return { processed: results.length, results, queue: librarianQueueSummary(state) };
}
