export function enqueueScoutPackets(state, scoutRunId, packetIds, observedAt = new Date().toISOString()) {
  if (!scoutRunId || Number.isNaN(Date.parse(observedAt))) throw new Error("invalid packet queue metadata");
  const canonicalObservedAt = new Date(observedAt).toISOString();
  const next = state.prepare("SELECT COALESCE(MAX(enqueue_sequence), 0) + 1 AS value FROM librarian_packet_queue");
  const insert = state.prepare(`
    INSERT OR IGNORE INTO librarian_packet_queue (
      packet_id, scout_run_id, observed_at, enqueue_sequence
    ) VALUES (?, ?, ?, ?)
  `);
  let enqueued = 0;
  state.exec("BEGIN IMMEDIATE");
  try {
    for (const packetId of packetIds) {
      const result = insert.run(packetId, scoutRunId, canonicalObservedAt, next.get().value);
      enqueued += Number(result.changes);
    }
    state.exec("COMMIT");
  } catch (error) {
    state.exec("ROLLBACK");
    throw error;
  }
  return { enqueued, reused: packetIds.length - enqueued };
}

export function recoverInterruptedLibrarianJobs(state) {
  return Number(state.prepare(`
    UPDATE librarian_packet_queue
    SET status='queued', started_at=NULL, error='recovered interrupted worker'
    WHERE status='running'
  `).run().changes);
}

export function claimNextLibrarianJob(state, startedAt = new Date().toISOString()) {
  state.exec("BEGIN IMMEDIATE");
  try {
    const job = state.prepare(`
      SELECT * FROM librarian_packet_queue
      WHERE status='queued'
      ORDER BY enqueue_sequence
      LIMIT 1
    `).get();
    if (!job) {
      state.exec("COMMIT");
      return null;
    }
    state.prepare(`
      UPDATE librarian_packet_queue
      SET status='running', started_at=?, finished_at=NULL,
        attempt_count=attempt_count+1, error=''
      WHERE packet_id=? AND status='queued'
    `).run(startedAt, job.packet_id);
    state.exec("COMMIT");
    return state.prepare("SELECT * FROM librarian_packet_queue WHERE packet_id=?").get(job.packet_id);
  } catch (error) {
    state.exec("ROLLBACK");
    throw error;
  }
}

export function finishLibrarianJob(state, packetId, result, finishedAt = new Date().toISOString()) {
  const status = result.status === "review_required" ? "review_required" : "failed";
  const update = state.prepare(`
    UPDATE librarian_packet_queue
    SET status=?, finished_at=?, librarian_run_id=?, error=?
    WHERE packet_id=? AND status='running'
  `).run(status, finishedAt, result.run_id ?? null, result.error ?? "", packetId);
  if (update.changes !== 1) throw new Error(`running Librarian job not found: ${packetId}`);
  return state.prepare("SELECT * FROM librarian_packet_queue WHERE packet_id=?").get(packetId);
}

export function librarianQueueSummary(state) {
  return Object.fromEntries(state.prepare(`
    SELECT status, COUNT(*) AS count
    FROM librarian_packet_queue
    GROUP BY status
    ORDER BY status
  `).all().map(({ status, count }) => [status, Number(count)]));
}
