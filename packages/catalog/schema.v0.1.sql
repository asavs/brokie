PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE catalog_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

INSERT INTO catalog_metadata (key, value) VALUES
  ('contract_version', '0.1.0'),
  ('vocabulary_version', '0.1.0');

-- Seeded from schemas/vocabularies.v0.1.json by the store initializer.
CREATE TABLE facet_concepts (
  namespace TEXT NOT NULL CHECK (namespace IN (
    'capability', 'operation', 'interface', 'input_modality', 'output_modality',
    'execution_location', 'accelerator', 'operability', 'monitoring_subject'
  )),
  concept_id TEXT NOT NULL,
  PRIMARY KEY (namespace, concept_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE normalized_units (
  unit_id TEXT PRIMARY KEY
) STRICT, WITHOUT ROWID;

CREATE TABLE source_snapshots (
  source_snapshot_id TEXT PRIMARY KEY CHECK (
    substr(source_snapshot_id, 1, 8) = 'srcsnap_'
    AND length(source_snapshot_id) BETWEEN 12 AND 104
    AND substr(source_snapshot_id, 9) NOT GLOB '*[^a-z0-9_]*'
  ),
  source_identity TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'free_for_dev_readme', 'startup_offer_csv', 'website', 'documentation',
    'api', 'repository', 'other'
  )),
  source_platform TEXT,
  full_text TEXT NOT NULL,
  observed_at TEXT NOT NULL CHECK (unixepoch(observed_at) IS NOT NULL),
  effective_from TEXT,
  effective_to TEXT,
  content_sha256 TEXT NOT NULL CHECK (
    length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  created_at TEXT NOT NULL CHECK (unixepoch(created_at) IS NOT NULL),
  CHECK (effective_from IS NULL OR unixepoch(effective_from) IS NOT NULL),
  CHECK (effective_to IS NULL OR unixepoch(effective_to) IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
) STRICT;

CREATE TABLE evidence_spans (
  source_snapshot_id TEXT NOT NULL REFERENCES source_snapshots(source_snapshot_id),
  evidence_key TEXT NOT NULL CHECK (
    substr(evidence_key, 1, 3) = 'ev_'
    AND length(evidence_key) BETWEEN 4 AND 66
    AND substr(evidence_key, 4) NOT GLOB '*[^a-z0-9_]*'
  ),
  quote TEXT NOT NULL CHECK (length(quote) > 0),
  start_offset INTEGER CHECK (start_offset IS NULL OR start_offset >= 0),
  end_offset INTEGER CHECK (end_offset IS NULL OR end_offset > start_offset),
  created_at TEXT NOT NULL CHECK (unixepoch(created_at) IS NOT NULL),
  CHECK ((start_offset IS NULL) = (end_offset IS NULL)),
  PRIMARY KEY (source_snapshot_id, evidence_key),
  UNIQUE (source_snapshot_id, quote, start_offset, end_offset)
) STRICT, WITHOUT ROWID;

CREATE TABLE products (
  product_id TEXT PRIMARY KEY CHECK (
    substr(product_id, 1, 5) = 'prod_'
    AND length(product_id) BETWEEN 9 AND 101
    AND substr(product_id, 6) NOT GLOB '*[^a-z0-9_]*'
  ),
  created_at TEXT NOT NULL CHECK (unixepoch(created_at) IS NOT NULL)
) STRICT;

CREATE TABLE product_revisions (
  product_revision_id TEXT PRIMARY KEY CHECK (
    substr(product_revision_id, 1, 3) = 'pr_'
    AND length(product_revision_id) BETWEEN 7 AND 99
    AND substr(product_revision_id, 4) NOT GLOB '*[^a-z0-9_]*'
  ),
  product_id TEXT NOT NULL REFERENCES products(product_id),
  source_snapshot_id TEXT NOT NULL REFERENCES source_snapshots(source_snapshot_id),
  observed_at TEXT NOT NULL CHECK (unixepoch(observed_at) IS NOT NULL),
  supersedes_revision_id TEXT REFERENCES product_revisions(product_revision_id),
  contract_version TEXT NOT NULL CHECK (contract_version = '0.1.0'),
  vocabulary_version TEXT NOT NULL CHECK (vocabulary_version = '0.1.0'),
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  document_sha256 TEXT NOT NULL CHECK (
    length(document_sha256) = 64 AND document_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  librarian_run_id TEXT,
  created_at TEXT NOT NULL CHECK (unixepoch(created_at) IS NOT NULL),
  CHECK (supersedes_revision_id IS NULL OR supersedes_revision_id <> product_revision_id)
) STRICT;

CREATE TABLE opportunities (
  opportunity_id TEXT PRIMARY KEY CHECK (
    substr(opportunity_id, 1, 4) = 'opp_'
    AND length(opportunity_id) BETWEEN 8 AND 100
    AND substr(opportunity_id, 5) NOT GLOB '*[^a-z0-9_]*'
  ),
  product_id TEXT NOT NULL REFERENCES products(product_id),
  created_at TEXT NOT NULL CHECK (unixepoch(created_at) IS NOT NULL)
) STRICT;

CREATE TABLE opportunity_revisions (
  opportunity_revision_id TEXT PRIMARY KEY CHECK (
    substr(opportunity_revision_id, 1, 3) = 'or_'
    AND length(opportunity_revision_id) BETWEEN 7 AND 99
    AND substr(opportunity_revision_id, 4) NOT GLOB '*[^a-z0-9_]*'
  ),
  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id),
  source_snapshot_id TEXT NOT NULL REFERENCES source_snapshots(source_snapshot_id),
  observed_at TEXT NOT NULL CHECK (unixepoch(observed_at) IS NOT NULL),
  effective_from TEXT,
  effective_to TEXT,
  supersedes_revision_id TEXT REFERENCES opportunity_revisions(opportunity_revision_id),
  availability TEXT NOT NULL CHECK (availability IN (
    'public', 'eligibility_gated', 'application_required', 'invite_only', 'unknown'
  )),
  contract_version TEXT NOT NULL CHECK (contract_version = '0.1.0'),
  vocabulary_version TEXT NOT NULL CHECK (vocabulary_version = '0.1.0'),
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  document_sha256 TEXT NOT NULL CHECK (
    length(document_sha256) = 64 AND document_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  librarian_run_id TEXT,
  created_at TEXT NOT NULL CHECK (unixepoch(created_at) IS NOT NULL),
  CHECK (supersedes_revision_id IS NULL OR supersedes_revision_id <> opportunity_revision_id),
  CHECK (effective_from IS NULL OR unixepoch(effective_from) IS NOT NULL),
  CHECK (effective_to IS NULL OR unixepoch(effective_to) IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
) STRICT;

CREATE TABLE review_events (
  review_event_id TEXT PRIMARY KEY CHECK (
    substr(review_event_id, 1, 4) = 'rev_'
    AND length(review_event_id) BETWEEN 8 AND 100
    AND substr(review_event_id, 5) NOT GLOB '*[^a-z0-9_]*'
  ),
  product_revision_id TEXT REFERENCES product_revisions(product_revision_id),
  opportunity_revision_id TEXT REFERENCES opportunity_revisions(opportunity_revision_id),
  decision TEXT NOT NULL CHECK (decision IN (
    'trust', 'reject', 'request_revision', 'canonicalize'
  )),
  canonical_product_id TEXT REFERENCES products(product_id),
  reviewer_kind TEXT NOT NULL CHECK (reviewer_kind IN ('human', 'policy', 'harness')),
  reviewer_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL CHECK (unixepoch(created_at) IS NOT NULL),
  CHECK ((product_revision_id IS NOT NULL) <> (opportunity_revision_id IS NOT NULL)),
  CHECK (
    (decision = 'canonicalize' AND product_revision_id IS NOT NULL AND canonical_product_id IS NOT NULL)
    OR (decision <> 'canonicalize' AND canonical_product_id IS NULL)
  )
) STRICT;

-- Deterministic projection: only mutually related revisions whose latest review is trust.
CREATE VIEW current_published_revisions AS
WITH ranked_reviews AS (
  SELECT
    review_events.*,
    row_number() OVER (
      PARTITION BY coalesce(product_revision_id, opportunity_revision_id)
      ORDER BY created_at DESC, review_event_id DESC
    ) AS review_rank
  FROM review_events
  WHERE decision <> 'canonicalize'
),
trusted_product_revisions AS (
  SELECT
    product_revisions.*,
    ranked_reviews.review_event_id,
    ranked_reviews.created_at AS trusted_at,
    row_number() OVER (
      PARTITION BY product_revisions.product_id
      ORDER BY product_revisions.observed_at DESC, product_revisions.product_revision_id DESC
    ) AS revision_rank
  FROM product_revisions
  JOIN ranked_reviews USING (product_revision_id)
  WHERE ranked_reviews.review_rank = 1
    AND ranked_reviews.decision = 'trust'
    AND length(trim(json_extract(product_revisions.document_json, '$.description.text'))) > 0
    AND json_array_length(
      product_revisions.document_json,
      '$.description.support.evidence_ids'
    ) > 0
),
trusted_opportunity_revisions AS (
  SELECT
    opportunity_revisions.*,
    ranked_reviews.review_event_id,
    ranked_reviews.created_at AS trusted_at,
    row_number() OVER (
      PARTITION BY opportunity_revisions.opportunity_id
      ORDER BY opportunity_revisions.observed_at DESC, opportunity_revisions.opportunity_revision_id DESC
    ) AS revision_rank
  FROM opportunity_revisions
  JOIN ranked_reviews USING (opportunity_revision_id)
  WHERE ranked_reviews.review_rank = 1
    AND ranked_reviews.decision = 'trust'
    AND json_array_length(opportunity_revisions.document_json, '$.entitlements') > 0
    AND NOT EXISTS (
      SELECT 1
      FROM json_each(opportunity_revisions.document_json, '$.entitlements') AS entitlement
      WHERE json_array_length(entitlement.value, '$.support.evidence_ids') < 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM json_each(opportunity_revisions.document_json, '$.ambiguities') AS ambiguity
      WHERE json_extract(ambiguity.value, '$.reason') = 'contradictory'
    )
)
SELECT
  opportunities.opportunity_id,
  trusted_opportunity_revisions.opportunity_revision_id,
  trusted_product_revisions.product_revision_id,
  trusted_opportunity_revisions.review_event_id AS opportunity_review_event_id,
  trusted_product_revisions.review_event_id AS product_review_event_id,
  CASE
    WHEN trusted_opportunity_revisions.trusted_at > trusted_product_revisions.trusted_at
      THEN trusted_opportunity_revisions.trusted_at
    ELSE trusted_product_revisions.trusted_at
  END AS published_at
FROM opportunities
JOIN trusted_opportunity_revisions
  ON trusted_opportunity_revisions.opportunity_id = opportunities.opportunity_id
  AND trusted_opportunity_revisions.revision_rank = 1
JOIN trusted_product_revisions
  ON trusted_product_revisions.product_id = opportunities.product_id
  AND trusted_product_revisions.revision_rank = 1;

CREATE TABLE facet_index (
  product_revision_id TEXT NOT NULL REFERENCES product_revisions(product_revision_id),
  namespace TEXT NOT NULL CHECK (namespace IN (
    'capability', 'operation', 'interface', 'input_modality', 'output_modality',
    'execution_location', 'accelerator', 'operability', 'monitoring_subject'
  )),
  concept_id TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('explicit', 'inferred')),
  PRIMARY KEY (product_revision_id, namespace, concept_id),
  FOREIGN KEY (namespace, concept_id) REFERENCES facet_concepts(namespace, concept_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE entitlement_index (
  opportunity_revision_id TEXT NOT NULL REFERENCES opportunity_revisions(opportunity_revision_id),
  entitlement_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'no_cost_access', 'included_usage', 'included_resource', 'included_capacity',
    'included_feature', 'monetary_credit', 'percentage_discount', 'fixed_discount',
    'waived_fee', 'trial_access', 'grant'
  )),
  cost_scope TEXT CHECK (cost_scope IS NULL OR cost_scope IN (
    'platform_fee', 'subscription_fee', 'software_license', 'provider_usage',
    'infrastructure', 'usage', 'unknown', 'not_applicable'
  )),
  quantity_value REAL,
  quantity_comparator TEXT CHECK (quantity_comparator IS NULL OR quantity_comparator IN (
    'exact', 'at_least', 'at_most', 'up_to', 'more_than', 'less_than',
    'approximately', 'unlimited', 'unknown'
  )),
  quantity_unit TEXT REFERENCES normalized_units(unit_id),
  cadence_interval INTEGER CHECK (cadence_interval IS NULL OR cadence_interval > 0),
  cadence_unit TEXT CHECK (cadence_unit IS NULL OR cadence_unit IN (
    'minute', 'hour', 'day', 'week', 'month', 'year'
  )),
  cadence_alignment TEXT CHECK (cadence_alignment IS NULL OR cadence_alignment IN (
    'calendar', 'rolling', 'unknown'
  )),
  duration_value REAL CHECK (duration_value IS NULL OR duration_value > 0),
  duration_unit TEXT CHECK (duration_unit IS NULL OR duration_unit IN (
    'minute', 'hour', 'day', 'week', 'month', 'year'
  )),
  monetary_amount_micros INTEGER CHECK (monetary_amount_micros IS NULL OR monetary_amount_micros >= 0),
  monetary_currency TEXT CHECK (
    monetary_currency IS NULL OR (
      length(monetary_currency) = 3 AND monetary_currency NOT GLOB '*[^A-Z]*'
    )
  ),
  monetary_comparator TEXT CHECK (monetary_comparator IS NULL OR monetary_comparator IN (
    'exact', 'up_to', 'at_least', 'approximately'
  )),
  maximum_value_micros INTEGER CHECK (maximum_value_micros IS NULL OR maximum_value_micros >= 0),
  maximum_value_currency TEXT CHECK (
    maximum_value_currency IS NULL OR (
      length(maximum_value_currency) = 3 AND maximum_value_currency NOT GLOB '*[^A-Z]*'
    )
  ),
  maximum_value_comparator TEXT CHECK (maximum_value_comparator IS NULL OR maximum_value_comparator IN (
    'exact', 'up_to', 'at_least', 'approximately'
  )),
  percentage_value REAL CHECK (percentage_value IS NULL OR (percentage_value > 0 AND percentage_value <= 100)),
  percentage_comparator TEXT CHECK (percentage_comparator IS NULL OR percentage_comparator IN (
    'exact', 'up_to', 'at_least', 'approximately'
  )),
  PRIMARY KEY (opportunity_revision_id, entitlement_key)
) STRICT, WITHOUT ROWID;

CREATE TABLE entitlement_applicability_index (
  opportunity_revision_id TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  target_type TEXT NOT NULL CHECK (target_type IN (
    'product', 'capability', 'feature', 'service', 'model', 'plan', 'entitlement', 'other'
  )),
  source_label TEXT NOT NULL,
  PRIMARY KEY (opportunity_revision_id, entitlement_key, ordinal),
  FOREIGN KEY (opportunity_revision_id, entitlement_key)
    REFERENCES entitlement_index(opportunity_revision_id, entitlement_key)
) STRICT, WITHOUT ROWID;

CREATE TABLE constraint_index (
  opportunity_revision_id TEXT NOT NULL REFERENCES opportunity_revisions(opportunity_revision_id),
  constraint_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'maximum_quantity', 'minimum_quantity', 'rate_limit', 'retention', 'capacity',
    'maximum_item_size', 'paid_addon', 'excluded_feature', 'other'
  )),
  other_kind TEXT,
  target_key TEXT NOT NULL,
  quantity_value REAL,
  quantity_comparator TEXT CHECK (quantity_comparator IS NULL OR quantity_comparator IN (
    'exact', 'at_least', 'at_most', 'up_to', 'more_than', 'less_than',
    'approximately', 'unlimited', 'unknown'
  )),
  quantity_unit TEXT REFERENCES normalized_units(unit_id),
  cadence_interval INTEGER CHECK (cadence_interval IS NULL OR cadence_interval > 0),
  cadence_unit TEXT CHECK (cadence_unit IS NULL OR cadence_unit IN (
    'minute', 'hour', 'day', 'week', 'month', 'year'
  )),
  cadence_alignment TEXT CHECK (cadence_alignment IS NULL OR cadence_alignment IN (
    'calendar', 'rolling', 'unknown'
  )),
  PRIMARY KEY (opportunity_revision_id, constraint_key),
  CHECK ((kind = 'other') = (other_kind IS NOT NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE condition_index (
  opportunity_revision_id TEXT NOT NULL REFERENCES opportunity_revisions(opportunity_revision_id),
  condition_key TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN (
    'boolean_requirement', 'external_credential', 'audience', 'geography', 'other'
  )),
  normalized_kind TEXT NOT NULL,
  required_state INTEGER CHECK (required_state IS NULL OR required_state IN (0, 1)),
  verification_required INTEGER CHECK (verification_required IS NULL OR verification_required IN (0, 1)),
  other_state TEXT CHECK (other_state IS NULL OR other_state IN (
    'required', 'not_required', 'conditional', 'unknown'
  )),
  target_key TEXT NOT NULL,
  PRIMARY KEY (opportunity_revision_id, condition_key),
  CHECK (
    (family = 'boolean_requirement' AND normalized_kind IN (
      'account', 'login', 'credit_card', 'application', 'approval',
      'installation', 'repository', 'build_step'
    ))
    OR (family = 'external_credential' AND normalized_kind IN (
      'api_key', 'model_provider_key', 'provider_account', 'github_app', 'mcp_client', 'other'
    ))
    OR (family = 'audience' AND normalized_kind = 'audience')
    OR (family = 'geography' AND normalized_kind = 'geography')
    OR family = 'other'
  )
) STRICT, WITHOUT ROWID;

CREATE TABLE condition_geography_index (
  opportunity_revision_id TEXT NOT NULL,
  condition_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('included', 'excluded', 'unknown')),
  region TEXT NOT NULL,
  PRIMARY KEY (opportunity_revision_id, condition_key, region),
  FOREIGN KEY (opportunity_revision_id, condition_key)
    REFERENCES condition_index(opportunity_revision_id, condition_key)
) STRICT, WITHOUT ROWID;

CREATE TABLE condition_audience_index (
  opportunity_revision_id TEXT NOT NULL,
  condition_key TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN (
    'startup', 'student', 'individual', 'indie_developer', 'small_team',
    'open_source_project', 'nonprofit', 'academic', 'other'
  )),
  PRIMARY KEY (opportunity_revision_id, condition_key, audience),
  FOREIGN KEY (opportunity_revision_id, condition_key)
    REFERENCES condition_index(opportunity_revision_id, condition_key)
) STRICT, WITHOUT ROWID;

CREATE VIRTUAL TABLE search_index USING fts5(
  revision_id UNINDEXED,
  product_name,
  function_text,
  outcomes_text,
  source_text,
  tokenize = 'unicode61'
);

CREATE INDEX source_snapshots_identity_idx
  ON source_snapshots(source_identity, observed_at DESC);
CREATE INDEX product_revisions_product_idx
  ON product_revisions(product_id, observed_at DESC);
CREATE INDEX opportunity_revisions_opportunity_idx
  ON opportunity_revisions(opportunity_id, observed_at DESC);
CREATE INDEX review_events_product_revision_idx
  ON review_events(product_revision_id, created_at DESC);
CREATE INDEX review_events_opportunity_revision_idx
  ON review_events(opportunity_revision_id, created_at DESC);
CREATE INDEX facet_lookup_idx ON facet_index(namespace, concept_id);
CREATE INDEX entitlement_lookup_idx
  ON entitlement_index(kind, cost_scope, quantity_unit, monetary_currency);
CREATE INDEX condition_lookup_idx ON condition_index(family, normalized_kind, required_state);
CREATE INDEX audience_lookup_idx ON condition_audience_index(audience);

CREATE TRIGGER source_snapshots_no_update
BEFORE UPDATE ON source_snapshots BEGIN
  SELECT RAISE(ABORT, 'source snapshots are immutable');
END;
CREATE TRIGGER source_snapshots_no_delete
BEFORE DELETE ON source_snapshots BEGIN
  SELECT RAISE(ABORT, 'source snapshots are immutable');
END;
CREATE TRIGGER evidence_spans_no_update
BEFORE UPDATE ON evidence_spans BEGIN
  SELECT RAISE(ABORT, 'evidence spans are immutable');
END;
CREATE TRIGGER evidence_spans_no_delete
BEFORE DELETE ON evidence_spans BEGIN
  SELECT RAISE(ABORT, 'evidence spans are immutable');
END;
CREATE TRIGGER product_revisions_no_update
BEFORE UPDATE ON product_revisions BEGIN
  SELECT RAISE(ABORT, 'product revisions are immutable');
END;
CREATE TRIGGER product_revisions_no_delete
BEFORE DELETE ON product_revisions BEGIN
  SELECT RAISE(ABORT, 'product revisions are immutable');
END;
CREATE TRIGGER opportunity_revisions_no_update
BEFORE UPDATE ON opportunity_revisions BEGIN
  SELECT RAISE(ABORT, 'opportunity revisions are immutable');
END;
CREATE TRIGGER opportunity_revisions_no_delete
BEFORE DELETE ON opportunity_revisions BEGIN
  SELECT RAISE(ABORT, 'opportunity revisions are immutable');
END;
CREATE TRIGGER review_events_no_update
BEFORE UPDATE ON review_events BEGIN
  SELECT RAISE(ABORT, 'review events are immutable');
END;
CREATE TRIGGER review_events_no_delete
BEFORE DELETE ON review_events BEGIN
  SELECT RAISE(ABORT, 'review events are immutable');
END;
