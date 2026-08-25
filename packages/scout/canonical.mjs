import crypto from "node:crypto";

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  if (value === undefined) throw new TypeError("canonical JSON does not permit undefined");
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError("canonical JSON permits finite integers other than negative zero");
    }
    return value;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== "object") throw new TypeError(`unsupported canonical JSON value: ${typeof value}`);
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, normalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function contentId(prefix, value) {
  return `${prefix}_sha256_${sha256(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value))}`;
}

export function packetId(packet) {
  const copy = structuredClone(packet);
  delete copy.packet_id;
  return contentId("scoutpkt", canonicalJson(copy));
}

export function acquisitionId(acquisition) {
  const copy = structuredClone(acquisition);
  delete copy.acquisition_id;
  return contentId("acq", canonicalJson(copy));
}

export function excerptId(excerpt) {
  return contentId("exc", canonicalJson({
    artifact_id: excerpt.artifact_id,
    start_byte: excerpt.start_byte,
    end_byte: excerpt.end_byte,
    role: excerpt.role,
  }));
}

export function traceFingerprint(events) {
  return contentId("trace", canonicalJson(events));
}
