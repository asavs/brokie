import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { acquisitionId, canonicalJson, contentId, excerptId, packetId } from "./canonical.mjs";
import { inspectLinks, inspectListingBoundaries } from "./inspect.mjs";

const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../schemas/scout-packet.v0.1.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
const validateSchema = ajv.compile(schema);

function fail(message) { throw new Error(`invalid ScoutPacket: ${message}`); }
const REPORT_SECRET_PATTERN = /(?:api[_-]?key|authorization|bearer|password|token)\s*=/i;
const TOOL_VERSION = "0.1.0";
const TOOL_ORDERS = {
  git: ["git.inspect", "file.read", "markdown.inspect", "link.inspect", "http.fetch"],
  web: ["http.fetch", "markdown.inspect", "link.inspect"],
};

function expectedAuthority(primaryUrl, link) {
  if (!primaryUrl || !link.resolved_destination) return { level: "unknown", basis: "unknown" };
  try {
    return new URL(primaryUrl).origin === new URL(link.resolved_destination).origin
      ? { level: "linked_first_party", basis: "same_origin" }
      : { level: "linked_third_party", basis: "cross_origin" };
  } catch { return { level: "unknown", basis: "unknown" }; }
}

export function createPacketValidator(artifactStore) {
  return function validatePacket(packet) {
    if (!validateSchema(packet)) fail(ajv.errorsText(validateSchema.errors, { separator: "; " }));
    if (packet.packet_id !== packetId(packet)) fail("packet_id mismatch");
    if (packet.listing.depth !== 0 || packet.listing.status !== "acquired" || packet.listing.depth_state !== "investigated" || !packet.listing.artifact_id || packet.listing.link !== null) {
      fail("listing must be a depth-0 acquired investigated artifact");
    }
    if (packet.listing.parent_acquisition_id !== null || packet.listing.originating_link_id !== null) fail("depth-0 listing cannot have parent or originating link");
    if (packet.listing.authority.level !== "collection" || packet.listing.authority.basis !== "seed") fail("depth-0 listing authority must be collection/seed");
    if (/[\x0d\x0a]/.test(packet.subject.source_label) || /[\x0d\x0a]|```/.test(packet.subject.selection_reason) || REPORT_SECRET_PATTERN.test(packet.subject.selection_reason)) fail("subject report fields must be bounded safe single-line text");
    if (packet.seed.kind === "git" && (!packet.seed.revision || packet.listing.kind !== "git_file")) fail("Git packets require a revision and git_file listing");
    if (packet.seed.kind === "web" && (packet.seed.revision !== null || packet.listing.kind !== "http_seed")) fail("web packets require null revision and http_seed listing");
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
      if (acquired && !["resolved", "investigated"].includes(acquisition.depth_state)) fail("acquired acquisition must be resolved or investigated");
      if (acquired && acquisition.depth_state === "resolved" && acquisition.excerpt_ids.length) fail("resolved acquisition cannot contain evidence excerpts");
      if (acquired && acquisition.depth_state === "investigated" && !acquisition.excerpt_ids.length) fail("investigated acquisition requires an evidence excerpt");
      if (["blocked", "failed"].includes(acquisition.status) && acquisition.depth_state !== "blocked") fail("blocked or failed acquisition must have blocked depth state");
      if (acquisition.status === "skipped" && acquisition.depth_state !== "discovered") fail("skipped acquisition must remain discovered");
      if (acquisition.kind === "git_file" && acquisition.http_status !== null) fail("git_file acquisition cannot have HTTP status");
      if (["http_seed", "http_link"].includes(acquisition.kind) && acquired && (!Number.isInteger(acquisition.http_status) || acquisition.http_status < 200 || acquisition.http_status >= 300)) fail("acquired HTTP content requires a successful HTTP status");
      if (["http_seed", "http_link"].includes(acquisition.kind) && !acquired && acquisition.http_status !== null) fail("non-acquired HTTP content cannot have HTTP status");
    }
    for (const followed of packet.followed_pages) {
      if (followed.kind !== "http_link" || followed.depth !== 1 || followed.parent_acquisition_id !== packet.listing.acquisition_id) fail("followed page must be a separate depth-1 HTTP child of listing");
      if (!followed.link || followed.originating_link_id !== followed.link.link_id) fail("followed page must preserve its originating Link");
      const locator = followed.link.resolved_destination ?? followed.link.raw_destination;
      if (followed.requested_locator !== locator) fail("followed acquisition locator must equal its Link destination");
      const expected = expectedAuthority(packet.subject.primary_url, followed.link);
      if (followed.authority.level !== expected.level || followed.authority.basis !== expected.basis) fail("followed acquisition authority is incoherent with its listing link");
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
    const listingArtifact = artifactStore.read(packet.listing.artifact_id), listingBytes = listingArtifact.bytes;
    const boundaries = inspectListingBoundaries(listingBytes, listingArtifact.manifest.media_type);
    if (!packet.listing.excerpt_ids.some((id) => { const excerpt = excerpts.get(id); return boundaries.some((boundary) => boundary.start_byte === excerpt.start_byte && boundary.end_byte === excerpt.end_byte && boundary.source_label === packet.subject.source_label); })) fail("subject.source_label must equal the exact label of its listing boundary");
    const baseLocator = packet.seed.kind === "web" ? packet.listing.final_locator : `file:///${packet.listing.final_locator.replaceAll("\\", "/")}`;
    const extractedLinks = new Map(inspectLinks(listingBytes, { artifactId: packet.listing.artifact_id, baseLocator, sourceDepth: 0 }).map((link) => [link.link_id, link]));
    const validateLink = (link) => {
      const copy = structuredClone(link); delete copy.link_id;
      if (link.link_id !== contentId("link", copy)) fail(`link identity mismatch: ${link.link_id}`);
      const extracted = extractedLinks.get(link.link_id);
      if (!extracted || canonicalJson(extracted) !== canonicalJson(link)) fail(`link does not resolve exactly from listing artifact: ${link.link_id}`);
      if (link.source_artifact_id !== packet.listing.artifact_id || link.source_depth !== 0) fail(`link source must be the depth-0 listing: ${link.link_id}`);
    };
    const chosenLinks = new Set();
    for (const followed of packet.followed_pages) { validateLink(followed.link); if (chosenLinks.has(followed.link.link_id)) fail(`chosen link is duplicated: ${followed.link.link_id}`); chosenLinks.add(followed.link.link_id); }
    for (const skipped of packet.skipped_links) {
      validateLink(skipped.link);
      if (chosenLinks.has(skipped.link.link_id)) fail(`chosen link is duplicated: ${skipped.link.link_id}`); chosenLinks.add(skipped.link.link_id);
      if (skipped.acquisition.kind !== "http_link" || skipped.acquisition.depth !== 1 || skipped.acquisition.parent_acquisition_id !== packet.listing.acquisition_id || skipped.acquisition.originating_link_id !== skipped.link.link_id || skipped.acquisition.link !== null) fail("skipped link acquisition lineage is invalid");
      if (skipped.acquisition.requested_locator !== (skipped.link.resolved_destination ?? skipped.link.raw_destination)) fail("skipped acquisition locator must equal its Link destination");
      if (skipped.acquisition.failure.code !== skipped.reason_code) fail("skipped acquisition failure must equal its reason_code");
      const expected = expectedAuthority(packet.subject.primary_url, skipped.link);
      if (skipped.acquisition.authority.level !== expected.level || skipped.acquisition.authority.basis !== expected.basis) fail("skipped acquisition authority is incoherent with its listing link");
    }
    if (packet.subject.primary_url !== null && ![...extractedLinks.values()].some((link) => link.resolved_destination === packet.subject.primary_url)) fail("subject.primary_url must be an extracted listing link");
    const configured = packet.provenance.budget.configured, consumed = packet.provenance.budget.consumed;
    for (const [counter, maximum] of [["requests", "max_requests"], ["pages", "max_pages"], ["bytes", "max_bytes"], ["inference_calls", "max_inference_calls"], ["max_depth", "max_depth"]]) if (consumed[counter] > configured[maximum]) fail(`budget ${counter} exceeds configured ${maximum}`);
    const toolOrder = TOOL_ORDERS[packet.seed.kind], toolNames = packet.provenance.tools_used.map(({ name, version }) => {
      if (!toolOrder.includes(name) || version !== TOOL_VERSION) fail(`unknown Scout tool capability: ${name}@${version}`);
      return name;
    });
    const requiredPrefix = packet.seed.kind === "git" ? toolOrder.slice(0, 4) : toolOrder;
    if (requiredPrefix.some((name, index) => toolNames[index] !== name)) fail("Scout tools_used does not contain the required acquisition tools in first-use order");
    if (toolNames.some((name, index) => index > 0 && toolOrder.indexOf(name) <= toolOrder.indexOf(toolNames[index - 1]))) fail("Scout tools_used must be unique and in first-use order");
    if (packet.followed_pages.some(({ link }) => link.resolved_destination !== null) && !toolNames.includes("http.fetch")) fail("dispatched HTTP pages require http.fetch provenance");
    const tools = new Set(); for (const tool of packet.provenance.tools_used) { if (tools.has(tool.name)) fail(`duplicate tool provenance: ${tool.name}`); tools.add(tool.name); }
    const timestampIds = new Set();
    for (const timestamp of packet.provenance.source_timestamps) {
      if (!acquisitionIds.has(timestamp.acquisition_id)) fail(`source timestamp references unknown acquisition: ${timestamp.acquisition_id}`);
      if (timestampIds.has(`${timestamp.acquisition_id}:${timestamp.kind}`)) fail("duplicate source timestamp"); timestampIds.add(`${timestamp.acquisition_id}:${timestamp.kind}`);
      const acquisition = acquisitions.find((item) => item.acquisition_id === timestamp.acquisition_id);
      if (timestamp.kind === "git_commit_time" && (packet.seed.kind !== "git" || acquisition !== packet.listing)) fail("Git commit timestamp must reference a Git listing acquisition");
      if (timestamp.kind === "http_last_modified" && (acquisition.status !== "acquired" || !["http_seed", "http_link"].includes(acquisition.kind))) fail("HTTP Last-Modified must reference acquired HTTP content");
    }
    const acquiredFollowed = packet.followed_pages.filter(({ status }) => status === "acquired").length;
    const hasFailure = packet.followed_pages.some(({ status }) => status !== "acquired") || packet.skipped_links.length > 0;
    const expected = acquiredFollowed === 0 ? "blocked" : hasFailure ? "partial" : "complete";
    if (packet.investigation.status !== expected) fail(`investigation status must be ${expected}`);
    return packet;
  };
}

export { schema as scoutPacketSchema };
