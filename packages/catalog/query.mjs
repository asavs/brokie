function tableExists(db, name) {
  return Boolean(
    db
      .prepare("SELECT 1 AS present FROM sqlite_schema WHERE type IN ('table','view') AND name = ?")
      .get(name),
  );
}

export function catalogKind(db) {
  if (tableExists(db, "catalog_metadata") && tableExists(db, "current_published_revisions")) {
    return "typed-v0.1";
  }
  if (tableExists(db, "metadata") && tableExists(db, "opportunities")) {
    return "legacy-v0.0.1";
  }
  return "unknown";
}

function parseDocument(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`invalid stored ${label} JSON: ${error.message}`);
  }
}

function collectEvidenceIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceIds(item, ids);
  } else if (value && typeof value === "object") {
    if (value.support && Array.isArray(value.support.evidence_ids)) {
      for (const evidenceId of value.support.evidence_ids) ids.add(evidenceId);
    }
    for (const item of Object.values(value)) collectEvidenceIds(item, ids);
  }
  return ids;
}

function sourceSnapshot(db, sourceSnapshotId) {
  return db
    .prepare(`
      SELECT source_snapshot_id, source_identity, source_locator, source_kind,
        source_platform, observed_at, effective_from, effective_to, content_sha256
      FROM source_snapshots
      WHERE source_snapshot_id = ?
    `)
    .get(sourceSnapshotId);
}

function evidenceFor(db, sourceSnapshotId, document) {
  const evidenceIds = [...collectEvidenceIds(document)].sort();
  if (evidenceIds.length === 0) return [];
  const placeholders = evidenceIds.map(() => "?").join(",");
  return db
    .prepare(`
      SELECT source_snapshot_id, evidence_key AS evidence_id, quote,
        start_offset, end_offset
      FROM evidence_spans
      WHERE source_snapshot_id = ? AND evidence_key IN (${placeholders})
      ORDER BY evidence_key
    `)
    .all(sourceSnapshotId, ...evidenceIds);
}

function facetsFor(db, productRevisionId) {
  return db
    .prepare(`
      SELECT namespace, concept_id, basis
      FROM facet_index
      WHERE product_revision_id = ?
      ORDER BY namespace, concept_id
    `)
    .all(productRevisionId);
}

function hydratePublishedRow(db, row) {
  const productDocument = parseDocument(row.product_json, "product revision");
  const opportunityDocument = parseDocument(row.opportunity_json, "opportunity revision");
  const productSource = sourceSnapshot(db, row.product_source_snapshot_id);
  const opportunitySource = sourceSnapshot(db, row.opportunity_source_snapshot_id);
  const evidence = [
    ...evidenceFor(db, row.product_source_snapshot_id, productDocument),
    ...evidenceFor(db, row.opportunity_source_snapshot_id, opportunityDocument),
  ].filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.source_snapshot_id === item.source_snapshot_id &&
          candidate.evidence_id === item.evidence_id,
      ) === index,
  );
  const facets = facetsFor(db, row.product_revision_id);
  return {
    id: row.opportunity_id,
    type: "opportunity",
    coverage: { state: "published" },
    publication: {
      published_at: row.published_at,
      product_review_event_id: row.product_review_event_id,
      opportunity_review_event_id: row.opportunity_review_event_id,
    },
    product: {
      id: row.product_id,
      revision_id: row.product_revision_id,
      observed_at: row.product_observed_at,
      ...productDocument,
    },
    opportunity: {
      id: row.opportunity_id,
      revision_id: row.opportunity_revision_id,
      observed_at: row.opportunity_observed_at,
      ...opportunityDocument,
    },
    facets,
    capabilities: facets
      .filter(({ namespace }) => namespace === "capability")
      .map(({ concept_id: id, basis }) => ({ id, basis })),
    sources: [productSource, opportunitySource].filter(
      (item, index, items) =>
        item &&
        items.findIndex(
          (candidate) => candidate?.source_snapshot_id === item.source_snapshot_id,
        ) === index,
    ),
    evidence,
  };
}

const publishedSelect = `
  SELECT
    published.opportunity_id,
    published.opportunity_revision_id,
    published.product_revision_id,
    published.opportunity_review_event_id,
    published.product_review_event_id,
    published.published_at,
    product_revisions.product_id,
    product_revisions.source_snapshot_id AS product_source_snapshot_id,
    product_revisions.observed_at AS product_observed_at,
    product_revisions.document_json AS product_json,
    opportunity_revisions.source_snapshot_id AS opportunity_source_snapshot_id,
    opportunity_revisions.observed_at AS opportunity_observed_at,
    opportunity_revisions.document_json AS opportunity_json
  FROM current_published_revisions AS published
  JOIN product_revisions USING (product_revision_id)
  JOIN opportunity_revisions USING (opportunity_revision_id)
`;

function literalFtsQuery(value) {
  const terms = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .split(/\s+/)
    .map((term) => term.slice(0, 64))
    .filter(Boolean)
    .slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" AND ");
}

export function searchPublishedOpportunities(
  db,
  { query = "", capabilities = [], limit = 25 } = {},
) {
  const clauses = [];
  const bindings = [];
  const ftsQuery = literalFtsQuery(query);
  let join = "";
  let order = "published.published_at DESC, published.opportunity_id";
  if (ftsQuery) {
    join = "JOIN search_index ON search_index.revision_id = published.opportunity_revision_id";
    clauses.push("search_index MATCH ?");
    bindings.push(ftsQuery);
    order = "bm25(search_index), published.published_at DESC";
  }
  for (const capability of [...new Set(capabilities)].slice(0, 8)) {
    clauses.push(`EXISTS (
      SELECT 1 FROM facet_index
      WHERE facet_index.product_revision_id = published.product_revision_id
        AND facet_index.namespace = 'capability'
        AND facet_index.concept_id = ?
    )`);
    bindings.push(capability);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`${publishedSelect} ${join} ${where} ORDER BY ${order} LIMIT ?`)
    .all(...bindings, limit);
  return rows.map((row) => hydratePublishedRow(db, row));
}

export function getPublishedOpportunity(db, opportunityId) {
  const row = db
    .prepare(`${publishedSelect} WHERE published.opportunity_id = ?`)
    .get(opportunityId);
  return row ? hydratePublishedRow(db, row) : null;
}

export function listPublishedCapabilities(db) {
  return db
    .prepare(`
      SELECT facet_index.concept_id AS id, COUNT(DISTINCT published.opportunity_id) AS count
      FROM current_published_revisions AS published
      JOIN facet_index
        ON facet_index.product_revision_id = published.product_revision_id
        AND facet_index.namespace = 'capability'
      GROUP BY facet_index.concept_id
      ORDER BY facet_index.concept_id
    `)
    .all()
    .map((item) => ({
      ...item,
      label: item.id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    }));
}

export function getPublishedEvidence(db, sourceSnapshotId, evidenceId) {
  const publishedDocuments = db
    .prepare(`
      SELECT
        product_revisions.source_snapshot_id AS product_source_snapshot_id,
        product_revisions.document_json AS product_json,
        opportunity_revisions.source_snapshot_id AS opportunity_source_snapshot_id,
        opportunity_revisions.document_json AS opportunity_json
      FROM current_published_revisions AS current
      JOIN product_revisions USING (product_revision_id)
      JOIN opportunity_revisions USING (opportunity_revision_id)
      WHERE product_revisions.source_snapshot_id = ?
         OR opportunity_revisions.source_snapshot_id = ?
    `)
    .all(sourceSnapshotId, sourceSnapshotId);
  const isReferenced = publishedDocuments.some((row) => {
    const productUsesEvidence =
      row.product_source_snapshot_id === sourceSnapshotId &&
      collectEvidenceIds(parseDocument(row.product_json, "product revision")).has(evidenceId);
    const opportunityUsesEvidence =
      row.opportunity_source_snapshot_id === sourceSnapshotId &&
      collectEvidenceIds(parseDocument(row.opportunity_json, "opportunity revision")).has(
        evidenceId,
      );
    return productUsesEvidence || opportunityUsesEvidence;
  });
  if (!isReferenced) return null;
  const evidence = db
    .prepare(`
      SELECT source_snapshot_id, evidence_key AS evidence_id, quote,
        start_offset, end_offset
      FROM evidence_spans
      WHERE source_snapshot_id = ? AND evidence_key = ?
    `)
    .get(sourceSnapshotId, evidenceId);
  if (!evidence) return null;
  return { ...evidence, source: sourceSnapshot(db, sourceSnapshotId) };
}

export function typedCatalogHealth(db) {
  const metadata = Object.fromEntries(
    db.prepare("SELECT key, value FROM catalog_metadata ORDER BY key").all().map(
      ({ key, value }) => [key, value],
    ),
  );
  const counts = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM products) AS known_products,
        (SELECT COUNT(*) FROM opportunities) AS known_opportunities,
        (SELECT COUNT(*) FROM product_revisions) AS product_revisions,
        (SELECT COUNT(*) FROM opportunity_revisions) AS opportunity_revisions,
        (SELECT COUNT(*) FROM current_published_revisions) AS published_opportunities
    `)
    .get();
  return {
    kind: "typed-v0.1",
    ...metadata,
    coverage: counts,
  };
}
