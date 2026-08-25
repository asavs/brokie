import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { acquisitionId, excerptId, packetId } from "./canonical.mjs";

const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../schemas/scout-packet.v0.1.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
const validateSchema = ajv.compile(schema);

function fail(message) { throw new Error(`invalid ScoutPacket: ${message}`); }

export function createPacketValidator(artifactStore) {
  return function validatePacket(packet) {
    if (!validateSchema(packet)) fail(ajv.errorsText(validateSchema.errors, { separator: "; " }));
    if (packet.packet_id !== packetId(packet)) fail("packet_id mismatch");
    if (packet.listing.depth !== 0 || packet.listing.status !== "acquired" || packet.listing.depth_state !== "investigated" || !packet.listing.artifact_id) {
      fail("listing must be a depth-0 acquired investigated artifact");
    }
    const acquisitions = [packet.listing, ...packet.followed_pages, ...packet.skipped_links.map(({ acquisition }) => acquisition)];
    const acquisitionIds = new Set();
    for (const acquisition of acquisitions) {
      if (acquisition.acquisition_id !== acquisitionId(acquisition)) fail(`acquisition identity mismatch: ${acquisition.acquisition_id}`);
      if (acquisitionIds.has(acquisition.acquisition_id)) fail(`duplicate acquisition: ${acquisition.acquisition_id}`);
      acquisitionIds.add(acquisition.acquisition_id);
      const acquired = acquisition.status === "acquired";
      if (acquired !== Boolean(acquisition.artifact_id)) fail("artifact_id exists if and only if acquired");
      if (acquired === Boolean(acquisition.failure)) fail("failure exists if and only if not acquired");
      if (acquisition.depth === 1 && (!acquisition.parent_acquisition_id || !acquisition.originating_link_id)) fail("depth-1 acquisition requires parent and link");
    }
    for (const followed of packet.followed_pages) {
      if (followed.depth !== 1 || followed.parent_acquisition_id !== packet.listing.acquisition_id) fail("followed page must be a separate depth-1 child of listing");
    }
    const excerpts = new Map();
    for (const excerpt of packet.excerpts) {
      if (excerpt.excerpt_id !== excerptId(excerpt)) fail(`excerpt identity mismatch: ${excerpt.excerpt_id}`);
      if (excerpts.has(excerpt.excerpt_id)) fail(`duplicate excerpt: ${excerpt.excerpt_id}`);
      let bytes;
      try { bytes = artifactStore.read(excerpt.artifact_id).bytes; } catch { fail(`missing or corrupt artifact: ${excerpt.artifact_id}`); }
      if (excerpt.start_byte > excerpt.end_byte || excerpt.end_byte > bytes.length) fail(`invalid excerpt offsets: ${excerpt.excerpt_id}`);
      const slice = bytes.subarray(excerpt.start_byte, excerpt.end_byte);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(slice);
      if (text !== excerpt.text || Buffer.byteLength(text, "utf8") !== slice.length) fail(`excerpt text mismatch: ${excerpt.excerpt_id}`);
      excerpts.set(excerpt.excerpt_id, excerpt);
    }
    const referenced = new Set();
    for (const acquisition of acquisitions) {
      for (const id of acquisition.excerpt_ids) {
        const excerpt = excerpts.get(id);
        if (!excerpt) fail(`unknown excerpt reference: ${id}`);
        if (excerpt.artifact_id !== acquisition.artifact_id) fail(`excerpt does not belong to acquisition: ${id}`);
        referenced.add(id);
      }
      for (const id of acquisition.authority.excerpt_ids) {
        const excerpt = excerpts.get(id);
        if (!excerpt || excerpt.role !== "authority_signal" || excerpt.artifact_id !== acquisition.artifact_id) fail(`invalid authority excerpt: ${id}`);
        referenced.add(id);
      }
    }
    for (const uncertainty of packet.uncertainties) for (const id of uncertainty.excerpt_ids) {
      if (!excerpts.has(id)) fail(`uncertainty references unknown excerpt: ${id}`);
      referenced.add(id);
    }
    for (const id of excerpts.keys()) if (!referenced.has(id)) fail(`orphan excerpt: ${id}`);
    const acquiredFollowed = packet.followed_pages.filter(({ status }) => status === "acquired").length;
    const hasFailure = packet.followed_pages.some(({ status }) => status !== "acquired") || packet.skipped_links.length > 0;
    const expected = acquiredFollowed === 0 ? "blocked" : hasFailure ? "partial" : "complete";
    if (packet.investigation.status !== expected) fail(`investigation status must be ${expected}`);
    return packet;
  };
}

export { schema as scoutPacketSchema };
