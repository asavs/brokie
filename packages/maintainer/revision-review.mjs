import crypto from "node:crypto";

const decisions = new Map([
  ["accepted", "trust"],
  ["rejected", "reject"],
  ["deferred", "request_revision"],
]);

function eventId(reviewId, revisionType, revisionId, decision) {
  const digest = crypto
    .createHash("sha256")
    .update(`${reviewId}\n${revisionType}\n${revisionId}\n${decision}`)
    .digest("hex")
    .slice(0, 40);
  return `rev_${digest}`;
}

function parseOpportunityRevisionIds(value) {
  let ids;
  try {
    ids = JSON.parse(value);
  } catch {
    throw new Error("revision review has invalid opportunity_revision_ids_json");
  }
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id)) {
    throw new Error("revision review has invalid opportunity revision IDs");
  }
  return [...new Set(ids)];
}

function recordCatalogEvent(catalog, event) {
  catalog.prepare(`
    INSERT OR IGNORE INTO review_events (
      review_event_id, product_revision_id, opportunity_revision_id,
      decision, reviewer_kind, reviewer_id, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.review_event_id,
    event.product_revision_id,
    event.opportunity_revision_id,
    event.decision,
    event.reviewer_kind,
    event.reviewer_id,
    event.note,
    event.created_at,
  );
  const stored = catalog
    .prepare("SELECT * FROM review_events WHERE review_event_id = ?")
    .get(event.review_event_id);
  for (const key of [
    "product_revision_id",
    "opportunity_revision_id",
    "decision",
  ]) {
    if ((stored?.[key] ?? null) !== (event[key] ?? null)) {
      throw new Error(`review event collision for ${event.review_event_id}`);
    }
  }
  return stored;
}

export function applyRevisionReviewDecision(
  { state, catalog },
  reviewId,
  {
    decision,
    note = "",
    reviewerId = "local-human",
    decidedAt = new Date().toISOString(),
  },
) {
  const catalogDecision = decisions.get(decision);
  if (!catalogDecision) throw new Error(`invalid revision review decision: ${decision}`);
  if (!reviewerId.trim()) throw new Error("reviewerId is required");

  const review = state
    .prepare("SELECT * FROM revision_review_queue WHERE review_id = ?")
    .get(reviewId);
  if (!review) throw new Error(`revision review not found: ${reviewId}`);
  const alreadyProcessed = review.status === "processed";
  if (alreadyProcessed) {
    if (
      review.decision !== decision ||
      review.decision_note !== note
    ) {
      throw new Error(`revision review already finalized with a different decision: ${reviewId}`);
    }
    note = review.decision_note;
    decidedAt = review.decided_at;
  }
  if (!alreadyProcessed && review.status !== "open") {
    throw new Error(`revision review is not open: ${reviewId}`);
  }

  const revisionTargets = [
    { revisionType: "product", revisionId: review.product_revision_id },
    ...parseOpportunityRevisionIds(review.opportunity_revision_ids_json).map((revisionId) => ({
      revisionType: "opportunity",
      revisionId,
    })),
  ];
  let reviewEvents = revisionTargets.map(({ revisionType, revisionId }) => ({
    review_event_id: eventId(reviewId, revisionType, revisionId, catalogDecision),
    product_revision_id: revisionType === "product" ? revisionId : null,
    opportunity_revision_id: revisionType === "opportunity" ? revisionId : null,
    decision: catalogDecision,
    reviewer_kind: "human",
    reviewer_id: reviewerId.trim(),
    note,
    created_at: decidedAt,
  }));

  catalog.exec("BEGIN IMMEDIATE");
  try {
    reviewEvents = reviewEvents.map((event) => recordCatalogEvent(catalog, event));
    catalog.exec("COMMIT");
  } catch (error) {
    catalog.exec("ROLLBACK");
    throw error;
  }

  if (alreadyProcessed) return { review, review_events: reviewEvents };

  const effectiveNote = reviewEvents[0]?.note ?? note;
  const effectiveDecidedAt = reviewEvents[0]?.created_at ?? decidedAt;
  const result = state.prepare(`
    UPDATE revision_review_queue
    SET status = 'processed', decision = ?, decision_note = ?,
      processed_at = ?, decided_at = ?
    WHERE review_id = ? AND status = 'open'
  `).run(decision, effectiveNote, effectiveDecidedAt, effectiveDecidedAt, reviewId);
  if (result.changes !== 1) {
    throw new Error(`catalog decision recorded but review finalization must be retried: ${reviewId}`);
  }
  return {
    review: state.prepare("SELECT * FROM revision_review_queue WHERE review_id = ?").get(reviewId),
    review_events: reviewEvents,
  };
}
