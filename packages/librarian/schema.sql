PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE source_records (
  source_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_line INTEGER,
  source_row INTEGER,
  source_category TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_description TEXT NOT NULL,
  source_offer_detail TEXT NOT NULL,
  source_eligibility TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  parent_provider TEXT NOT NULL,
  estimated_value_usd REAL,
  raw_text TEXT NOT NULL,
  selection_score REAL NOT NULL,
  selection_reasons_json TEXT NOT NULL,
  UNIQUE(source_kind, source_locator)
);

CREATE TABLE products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  derivation TEXT NOT NULL CHECK (derivation IN ('source_stated','deterministically_parsed','model_proposed','human_reviewed','unknown'))
);

CREATE TABLE opportunities (
  opportunity_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_records(source_id),
  product_id TEXT NOT NULL REFERENCES products(product_id),
  name TEXT NOT NULL,
  opportunity_type TEXT NOT NULL,
  benefit_text TEXT NOT NULL,
  eligibility_text TEXT NOT NULL,
  estimated_value_usd REAL,
  derivation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate'
);

CREATE TABLE capabilities (
  capability_id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE
);

CREATE TABLE user_needs (
  user_need_id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE
);

CREATE TABLE product_capabilities (
  product_id TEXT NOT NULL REFERENCES products(product_id),
  capability_id TEXT NOT NULL REFERENCES capabilities(capability_id),
  source_id TEXT NOT NULL REFERENCES source_records(source_id),
  derivation TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence TEXT NOT NULL,
  PRIMARY KEY(product_id, capability_id, source_id)
);

CREATE TABLE product_user_needs (
  product_id TEXT NOT NULL REFERENCES products(product_id),
  user_need_id TEXT NOT NULL REFERENCES user_needs(user_need_id),
  source_id TEXT NOT NULL REFERENCES source_records(source_id),
  derivation TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence TEXT NOT NULL,
  PRIMARY KEY(product_id, user_need_id, source_id)
);

CREATE TABLE requirements (
  requirement_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id),
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  derivation TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence TEXT NOT NULL
);

CREATE TABLE relationships (
  relationship_id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  derivation TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
);

CREATE TABLE librarian_runs (
  run_id TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  provider TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  resolved_model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  latency_ms INTEGER,
  request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  status TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  trace_path TEXT NOT NULL
);

CREATE TABLE review_items (
  review_id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES source_records(source_id),
  item_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX source_records_name_idx ON source_records(source_name);
CREATE INDEX opportunities_product_idx ON opportunities(product_id);
CREATE INDEX review_items_status_idx ON review_items(status);
