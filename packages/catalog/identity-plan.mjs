import { sha } from "../librarian/lib.mjs";

function normalizedSourceIdentity(record) {
  const url = String(record.source_url ?? "").trim().toLocaleLowerCase("en-US").replace(/\/$/, "");
  if (url) return `${record.source_kind}|url|${url}`;
  const platform = String(record.source_platform ?? "").trim().toLocaleLowerCase("en-US");
  const name = String(record.source_name ?? "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
  return `${record.source_kind}|name|${platform}|${name}`;
}

export function prepareSourceObservation(record, observedAt = new Date().toISOString()) {
  if (Number.isNaN(Date.parse(observedAt))) throw new Error(`invalid observation timestamp: ${observedAt}`);
  if (!record?.source_kind || !record.source_locator || !record.source_name) {
    throw new Error("source record requires source_kind, source_locator, and source_name");
  }
  if (typeof record.raw_text !== "string" || record.raw_text.trim() === "") {
    throw new Error("source record requires non-empty raw_text");
  }
  const sourceIdentity = normalizedSourceIdentity(record);
  return {
    source_text: record.raw_text,
    source_name: record.source_name,
    source_identity: sourceIdentity,
    source_snapshot_id: `srcsnap_${sha(`${sourceIdentity}\n${observedAt}`, 24)}`,
    observed_at: observedAt,
    source: {
      identity: sourceIdentity,
      locator: record.source_locator,
      kind: record.source_kind,
      platform: record.source_platform || null,
    },
  };
}

function latestProductRevision(db, productId) {
  return db
    .prepare(`
      SELECT product_revision_id
      FROM product_revisions
      WHERE product_id = ?
      ORDER BY observed_at DESC, product_revision_id DESC
      LIMIT 1
    `)
    .get(productId)?.product_revision_id;
}

function existingOpportunitiesByLocalKey(db, productId) {
  const matches = new Map();
  const rows = db
    .prepare(`
      SELECT
        opportunities.opportunity_id,
        opportunity_revisions.opportunity_revision_id,
        json_extract(opportunity_revisions.document_json, '$.local_key') AS local_key
      FROM opportunities
      JOIN opportunity_revisions USING (opportunity_id)
      WHERE opportunities.product_id = ?
      ORDER BY opportunity_revisions.observed_at DESC,
        opportunity_revisions.opportunity_revision_id DESC
    `)
    .all(productId);
  for (const row of rows) {
    if (row.local_key && !matches.has(row.local_key)) matches.set(row.local_key, row);
  }
  return matches;
}

export function planCandidateIdentity(db, candidate, observation, options = {}) {
  const productId = options.product_id ?? `prod_${sha(observation.source_identity, 24)}`;
  const existingByLocalKey = existingOpportunitiesByLocalKey(db, productId);
  const opportunities = {};
  for (const opportunity of candidate.opportunities) {
    const previous = existingByLocalKey.get(opportunity.local_key);
    const opportunityId =
      previous?.opportunity_id ?? `opp_${sha(`${productId}\n${opportunity.local_key}`, 24)}`;
    opportunities[opportunity.local_key] = {
      opportunity_id: opportunityId,
      opportunity_revision_id: `or_${sha(
        `${observation.source_snapshot_id}\n${opportunityId}`,
        24,
      )}`,
      supersedes_revision_id: previous?.opportunity_revision_id ?? null,
    };
  }
  return {
    source: observation.source,
    product_id: productId,
    product_revision_id: `pr_${sha(
      `${observation.source_snapshot_id}\n${productId}`,
      24,
    )}`,
    supersedes_product_revision_id: latestProductRevision(db, productId) ?? null,
    opportunities,
    librarian_run_id: options.librarian_run_id ?? null,
    created_at: options.created_at ?? observation.observed_at,
  };
}
