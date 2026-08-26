import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { packetId } from "./canonical.mjs";

const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../schemas/scout-packet.v0.2.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

function fail(message) {
  throw new Error(`invalid ScoutPacket v0.2: ${message}`);
}

function assertPacket(condition, message) {
  if (!condition) fail(message);
}

function readArtifact(store, artifactId, message) {
  try {
    return store.read(artifactId);
  } catch {
    fail(message);
  }
}

function validateCollection(packet, store) {
  const collection = packet.collection;
  const stored = readArtifact(store, collection.artifact_id, "collection artifact is missing or corrupt");
  assertPacket(collection.start_byte < collection.end_byte && collection.end_byte <= stored.bytes.length, "collection range is invalid");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(stored.bytes.subarray(collection.start_byte, collection.end_byte));
  assertPacket(text === collection.text, "collection text does not match stored bytes");
}

function artifactsAreCoherent(page) {
  const acquired = page.status === "acquired";
  return acquired === Boolean(page.raw_artifact_id) && acquired === Boolean(page.readable_artifact_id);
}

function failureIsCoherent(page) {
  return page.status === "acquired" ? page.failure === null : page.failure !== null;
}

function validateReadableLineage(page, store) {
  const raw = readArtifact(store, page.raw_artifact_id, "raw page artifact is missing or corrupt");
  const readable = readArtifact(store, page.readable_artifact_id, "readable page artifact is missing or corrupt");
  if (page.raw_artifact_id === page.readable_artifact_id) {
    assertPacket(page.transformation === null, "unchanged readable material cannot claim a transformation");
    return;
  }
  assertPacket(readable.manifest.media_type === "text/plain", "readable material must be plain text");
  assertPacket(typeof page.transformation === "string" && page.transformation.length > 0, "derived readable material requires a transformation");
  void raw;
}

function validatePage(page, packet, store) {
  assertPacket(artifactsAreCoherent(page), "page artifacts are incoherent");
  assertPacket(failureIsCoherent(page), "page failure is incoherent");
  assertPacket((page.role === "listed_page") === (page.depth === 1), "page role and depth are inconsistent");
  assertPacket(page.originating_link.resolved_destination === page.requested_url, "page URL does not match its source link");
  assertPacket(page.depth === page.originating_link.source_depth + 1, "page depth does not follow its source link");
  readArtifact(store, page.originating_link.source_artifact_id, "source link artifact is missing or corrupt");
  if (page.status === "acquired") validateReadableLineage(page, store);
  if (page.depth === 1) assertPacket(page.parent_url.length > 0, "listed page requires a collection parent");
  if (page.depth === 2) {
    const parent = packet.pages.find(({ depth }) => depth === 1);
    assertPacket(parent?.final_url === page.parent_url, "followed page parent is invalid");
  }
}

function validatePages(packet, store) {
  assertPacket(packet.pages.filter(({ depth }) => depth === 1).length <= 1, "packet has multiple listed pages");
  assertPacket(packet.pages.filter(({ depth }) => depth === 2).length <= 1, "packet has multiple followed pages");
  packet.pages.forEach((page) => validatePage(page, packet, store));
}

export function createPacketValidatorV02(artifactStore) {
  return (packet) => {
    assertPacket(validateSchema(packet), ajv.errorsText(validateSchema.errors));
    assertPacket(packet.packet_id === packetId(packet), "packet identity mismatch");
    assertPacket(packet.seed.kind !== "git" || Boolean(packet.seed.revision), "Git packet requires a revision");
    validateCollection(packet, artifactStore);
    validatePages(packet, artifactStore);
    return packet;
  };
}
