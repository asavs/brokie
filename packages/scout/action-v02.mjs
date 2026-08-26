const ACTION_KEYS = new Map([
  ["list_files", ["type", "cursor"]],
  ["read_collection", ["type", "path"]],
  ["select_listings", ["type", "listings"]],
  ["follow_evidence_link", ["type", "listing_index", "page_acquisition_id", "link_index"]],
  ["record_research", ["type", "listing_index", "findings", "conflicts", "outcomes"]],
  ["finalize", ["type"]],
]);

const TOPICS = new Set(["benefit", "numerical_limits", "requirements", "eligibility", "material_caveats"]);
const DERIVATIONS = new Set(["explicit", "parsed", "inferred"]);
const PRIMITIVE_KINDS = new Set(["quantity", "money", "cadence", "date", "boolean_requirement", "audience"]);
const OUTCOMES = new Set(["answered", "partially_answered", "not_found", "conflicting", "blocked"]);

export function protocolError(detail = "") {
  const error = new Error("external_model_protocol_error");
  error.code = "external_model_protocol_error";
  error.detail = detail;
  return error;
}

function assertProtocol(condition, detail) {
  if (!condition) throw protocolError(detail);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function isIndex(value) {
  return Number.isInteger(value) && value >= 0;
}

function isCleanLine(value, maximum = 1000) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) return false;
  return !/[\r\n]|```|(?:api[_-]?key|authorization|bearer|password|token)\s*=/i.test(value);
}

function validateListFiles(action) {
  assertProtocol(isIndex(action.cursor), "list_files requires a nonnegative cursor");
}

function validateReadCollection(action) {
  assertProtocol(isCleanLine(action.path, 1000), "read_collection requires one path");
}

function validateListing(item) {
  const keys = ["artifact_id", "start_byte", "end_byte", "source_label", "primary_link_index"];
  assertProtocol(hasExactKeys(item, keys), "listing shape is invalid");
  assertProtocol(/^art_sha256_[0-9a-f]{64}$/.test(item.artifact_id), "listing artifact ID is invalid");
  assertProtocol(isIndex(item.start_byte), "listing start byte is invalid");
  assertProtocol(Number.isInteger(item.end_byte) && item.end_byte > item.start_byte, "listing end byte is invalid");
  assertProtocol(isCleanLine(item.source_label, 256), "listing label is invalid");
  assertProtocol(isIndex(item.primary_link_index), "listing link index is invalid");
}

function validateSelectListings(action) {
  assertProtocol(Array.isArray(action.listings) && action.listings.length > 0, "select_listings requires listings");
  action.listings.forEach(validateListing);
}

function validateFollowLink(action) {
  assertProtocol(isIndex(action.listing_index), "follow link listing index is invalid");
  assertProtocol(/^acq_sha256_[0-9a-f]{64}$/.test(action.page_acquisition_id), "follow link acquisition ID is invalid");
  assertProtocol(isIndex(action.link_index), "follow link index is invalid");
}

function validatePrimitive(primitive) {
  const keys = ["kind", "source_text", "value", "unit_text", "currency", "cadence", "date_text", "boolean_value", "audience_text"];
  assertProtocol(hasExactKeys(primitive, keys), "parsed primitive shape is invalid");
  assertProtocol(PRIMITIVE_KINDS.has(primitive.kind), "parsed primitive kind is invalid");
  assertProtocol(isCleanLine(primitive.source_text, 500), "parsed primitive source text is invalid");
  assertProtocol(primitive.value === null || Number.isFinite(primitive.value), "parsed primitive number is invalid");
  assertProtocol(primitive.boolean_value === null || typeof primitive.boolean_value === "boolean", "parsed primitive boolean is invalid");
  for (const key of ["unit_text", "currency", "cadence", "date_text", "audience_text"]) {
    assertProtocol(primitive[key] === null || isCleanLine(primitive[key], 300), `parsed primitive ${key} is invalid`);
  }
}

function validateFinding(finding) {
  const keys = ["topic", "derivation", "statement_segment_id", "evidence_segment_ids", "parsed_values"];
  assertProtocol(hasExactKeys(finding, keys), "finding shape is invalid");
  assertProtocol(TOPICS.has(finding.topic), "finding topic is invalid");
  assertProtocol(DERIVATIONS.has(finding.derivation), "finding derivation is invalid");
  assertProtocol(isCleanLine(finding.statement_segment_id), "finding statement segment is invalid");
  assertProtocol(Array.isArray(finding.evidence_segment_ids) && finding.evidence_segment_ids.length > 0, "finding evidence is empty");
  assertProtocol(finding.evidence_segment_ids.every((id) => isCleanLine(id)), "finding evidence segment is invalid");
  assertProtocol(Array.isArray(finding.parsed_values), "finding parsed values are invalid");
  finding.parsed_values.forEach(validatePrimitive);
}

function validateConflict(conflict) {
  const keys = ["topic", "finding_indexes", "observation"];
  assertProtocol(hasExactKeys(conflict, keys), "conflict shape is invalid");
  assertProtocol(TOPICS.has(conflict.topic), "conflict topic is invalid");
  assertProtocol(Array.isArray(conflict.finding_indexes) && conflict.finding_indexes.length >= 2, "conflict requires two findings");
  assertProtocol(conflict.finding_indexes.every(isIndex), "conflict finding index is invalid");
  assertProtocol(isCleanLine(conflict.observation), "conflict observation is invalid");
}

function validateOutcome(outcome) {
  const keys = ["topic", "status", "finding_indexes", "conflict_indexes", "unresolved_questions"];
  assertProtocol(hasExactKeys(outcome, keys), "outcome shape is invalid");
  assertProtocol(TOPICS.has(outcome.topic), "outcome topic is invalid");
  assertProtocol(OUTCOMES.has(outcome.status), "outcome status is invalid");
  assertProtocol(Array.isArray(outcome.finding_indexes) && outcome.finding_indexes.every(isIndex), "outcome finding indexes are invalid");
  assertProtocol(Array.isArray(outcome.conflict_indexes) && outcome.conflict_indexes.every(isIndex), "outcome conflict indexes are invalid");
  assertProtocol(Array.isArray(outcome.unresolved_questions), "outcome unresolved questions are invalid");
  assertProtocol(outcome.unresolved_questions.every((item) => isCleanLine(item, 500)), "outcome unresolved question is invalid");
}

function validateResearch(action) {
  assertProtocol(isIndex(action.listing_index), "research listing index is invalid");
  assertProtocol(Array.isArray(action.findings), "research findings are invalid");
  assertProtocol(Array.isArray(action.conflicts), "research conflicts are invalid");
  assertProtocol(Array.isArray(action.outcomes), "research outcomes are invalid");
  action.findings.forEach(validateFinding);
  action.conflicts.forEach(validateConflict);
  action.outcomes.forEach(validateOutcome);
}

const ACTION_VALIDATORS = new Map([
  ["list_files", validateListFiles],
  ["read_collection", validateReadCollection],
  ["select_listings", validateSelectListings],
  ["follow_evidence_link", validateFollowLink],
  ["record_research", validateResearch],
  ["finalize", () => {}],
]);

export function validateActionV02(action) {
  assertProtocol(isRecord(action) && typeof action.type === "string", "action must be an object with a type");
  const keys = ACTION_KEYS.get(action.type);
  assertProtocol(keys && hasExactKeys(action, keys), "action type or shape is invalid");
  ACTION_VALIDATORS.get(action.type)(action);
  return action;
}

export function extractActionV02(content) {
  try {
    return JSON.parse(String(content ?? ""));
  } catch {
    throw protocolError("provider response was not exactly one JSON object");
  }
}
