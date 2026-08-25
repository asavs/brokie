import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCatalogStore } from "../catalog/store.mjs";
import { applyRevisionReviewDecision } from "./revision-review.mjs";
import { openState } from "./state.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const args = process.argv.slice(2);
const command = args[0] || "list";
const option = (name, fallback) =>
  args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const statePath = path.resolve(option("state", path.join(root, "var", "v0.1", "brokie-state.sqlite")));
const catalogPath = path.resolve(
  option("catalog", path.join(root, "var", "v0.1", "catalog-v0.1.sqlite")),
);
const state = openState(statePath);

try {
  if (command === "list") {
    const status = option("status", "open");
    const rows = state.prepare(`
      SELECT review_id, run_id, product_revision_id, opportunity_revision_ids_json,
        reason, status, decision, created_at, decided_at, decision_note
      FROM revision_review_queue
      WHERE status = ?
      ORDER BY created_at, review_id
    `).all(status);
    console.log(JSON.stringify({ status, count: rows.length, data: rows }, null, 2));
  } else if (command === "show") {
    const row = state
      .prepare("SELECT * FROM revision_review_queue WHERE review_id = ?")
      .get(args[1]);
    if (!row) throw new Error(`Unknown revision review: ${args[1]}`);
    console.log(
      JSON.stringify(
        { ...row, opportunity_revision_ids: JSON.parse(row.opportunity_revision_ids_json) },
        null,
        2,
      ),
    );
  } else if (command === "decide") {
    const reviewId = args[1];
    const decision = args[2];
    if (!reviewId || !["accepted", "rejected", "deferred"].includes(decision)) {
      throw new Error(
        "Usage: review-v0.1.mjs decide <review_id> <accepted|rejected|deferred> [--note=text] [--reviewer=id]",
      );
    }
    if (!fs.existsSync(catalogPath)) throw new Error(`Catalog does not exist: ${catalogPath}`);
    const catalog = new DatabaseSync(catalogPath);
    try {
      createCatalogStore(catalog);
      const result = applyRevisionReviewDecision(
        { state, catalog },
        reviewId,
        {
          decision,
          note: option("note", ""),
          reviewerId: option("reviewer", "local-human"),
          decidedAt: option("decided-at", new Date().toISOString()),
        },
      );
      console.log(
        JSON.stringify(
          {
            review_id: result.review.review_id,
            decision: result.review.decision,
            catalog_decision: result.review_events[0]?.decision ?? null,
            review_event_ids: result.review_events.map(({ review_event_id: id }) => id),
          },
          null,
          2,
        ),
      );
    } finally {
      catalog.close();
    }
  } else {
    throw new Error("Commands: list, show <id>, decide <id> <decision>");
  }
} finally {
  state.close();
}
