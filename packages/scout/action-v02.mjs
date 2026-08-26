const ACTION_KEYS = new Map([
  ["more_files", ["type"]],
  ["read_file", ["type", "file_index"]],
  ["select_listings", ["type", "candidate_indexes"]],
  ["follow_link", ["type", "link_index"]],
  ["finish_subject", ["type"]],
]);

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

function validateIndexes(indexes) {
  assertProtocol(Array.isArray(indexes) && indexes.length > 0, "select_listings requires candidate indexes");
  assertProtocol(indexes.every(isIndex), "candidate indexes must be nonnegative integers");
  assertProtocol(new Set(indexes).size === indexes.length, "candidate indexes must be unique");
}

export function validateActionV02(action) {
  assertProtocol(isRecord(action) && typeof action.type === "string", "action must be an object with a type");
  const keys = ACTION_KEYS.get(action.type);
  assertProtocol(keys && hasExactKeys(action, keys), "action type or shape is invalid");
  if (action.type === "read_file") assertProtocol(isIndex(action.file_index), "read_file requires a nonnegative file index");
  if (action.type === "select_listings") validateIndexes(action.candidate_indexes);
  if (action.type === "follow_link") assertProtocol(isIndex(action.link_index), "follow_link requires a nonnegative link index");
  return action;
}

export function extractActionV02(content) {
  try {
    return JSON.parse(String(content ?? ""));
  } catch {
    throw protocolError("provider response was not exactly one JSON object");
  }
}
