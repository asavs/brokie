import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalJson, contentId } from "./canonical.mjs";
import { inspectLinks } from "./inspect.mjs";
import { acquisitionIdV02, conflictIdV02, findingIdV02, packetIdV02 } from "./identity-v02.mjs";

const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../schemas/scout-packet.v0.2.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true }); const validateSchema = ajv.compile(schema);
const normalize = (text) => String(text).replace(/\s+/g, " ").trim();
function fail(message) { throw new Error(`invalid ScoutPacket v0.2: ${message}`); }

export function createPacketValidatorV02(artifactStore) {
  return function validatePacketV02(packet) {
    if (!validateSchema(packet)) fail(ajv.errorsText(validateSchema.errors));
    if (packet.packet_id !== packetIdV02(packet)) fail("packet identity mismatch");
    const requestStable = { request_version: packet.research_request.request_version, objective: packet.research_request.objective, topics: packet.research_request.topics };
    if (packet.research_request.request_id !== contentId("research", requestStable)) fail("research request identity mismatch");
    const topicOrder = packet.research_request.topics.map(({ topic }) => topic);
    if (new Set(topicOrder).size !== topicOrder.length) fail("duplicate research topic");

    const acquisitions = new Map(), artifactOwners = new Map();
    for (const acquisition of packet.acquisitions) {
      if (acquisitions.has(acquisition.acquisition_id)) fail("duplicate acquisition");
      if (acquisition.acquisition_id !== acquisitionIdV02(acquisition)) fail(`acquisition identity mismatch: ${acquisition.acquisition_id}`);
      const acquired = acquisition.status === "acquired";
      if (acquired !== Boolean(acquisition.raw_artifact_id) || acquired !== Boolean(acquisition.readable_artifact_id)) fail("acquired artifacts are incoherent");
      if (acquired && acquisition.failure !== null) fail("acquired page cannot have failure");
      if (!acquired && (acquisition.failure === null || acquisition.content_state !== "blocked")) fail("failed acquisition must be blocked and normalized");
      if (acquisition.content_state === "content_incomplete" && acquisition.content_reasons.length === 0) fail("content-incomplete acquisition requires reasons");
      if (acquisition.content_state === "resolved" && acquisition.content_reasons.length > 0) fail("resolved acquisition cannot retain incompleteness reasons");
      if (acquisition.role === "collection_listing" && (acquisition.depth !== 0 || acquisition.parent_acquisition_id !== null || acquisition.originating_link !== null)) fail("collection listing lineage is invalid");
      if (acquisition.role === "listed_page" && acquisition.depth !== 1) fail("listed page must be depth 1");
      if (acquisition.role === "evidence_page" && acquisition.depth !== 2) fail("evidence page must be depth 2");
      if (acquisition.depth > 0 && (!acquisition.parent_acquisition_id || !acquisition.originating_link)) fail("linked acquisition requires parent and extracted link");
      if (acquired) {
        let raw, readable;
        try { raw = artifactStore.read(acquisition.raw_artifact_id); readable = artifactStore.read(acquisition.readable_artifact_id); } catch { fail("missing or corrupt acquisition artifact"); }
        if (acquisition.raw_artifact_id !== acquisition.readable_artifact_id) {
          if (readable.manifest.kind !== "derived_text" || readable.manifest.derived_from_artifact_id !== acquisition.raw_artifact_id || readable.manifest.transformation !== acquisition.transformation) fail("readable artifact lineage is invalid");
        } else if (acquisition.transformation !== null) fail("identity readable artifact cannot claim a transformation");
        for (const artifactId of new Set([acquisition.raw_artifact_id, acquisition.readable_artifact_id])) {
          const owners = artifactOwners.get(artifactId) ?? new Set(); owners.add(acquisition.acquisition_id); artifactOwners.set(artifactId, owners);
        }
        void raw;
      }
      acquisitions.set(acquisition.acquisition_id, acquisition);
    }
    if (!packet.acquisitions.some(({ role }) => role === "collection_listing")) fail("missing collection listing");
    for (const acquisition of packet.acquisitions) if (acquisition.parent_acquisition_id && !acquisitions.has(acquisition.parent_acquisition_id)) fail("unknown acquisition parent");

    const excerpts = new Map();
    for (const excerpt of packet.excerpts) {
      if (excerpts.has(excerpt.excerpt_id)) fail("duplicate excerpt");
      let stored; try { stored = artifactStore.read(excerpt.artifact_id); } catch { fail("missing or corrupt excerpt artifact"); }
      if (excerpt.end_byte > stored.bytes.length || excerpt.start_byte >= excerpt.end_byte) fail("excerpt offsets are invalid");
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(stored.bytes.subarray(excerpt.start_byte, excerpt.end_byte));
      if (decoded !== excerpt.text || Buffer.byteLength(decoded, "utf8") !== excerpt.end_byte - excerpt.start_byte) fail("excerpt text mismatch");
      if (excerpt.role === "research_evidence" && stored.manifest.kind === "http_body" && stored.manifest.media_type === "text/html") fail("raw HTML cannot be selected research evidence");
      excerpts.set(excerpt.excerpt_id, excerpt);
    }
    const listingExcerpt = excerpts.get(packet.subject.collection_excerpt_id);
    if (!listingExcerpt || listingExcerpt.role !== "collection_listing") fail("subject collection excerpt is invalid");
    const listingAcquisition = packet.acquisitions.find(({ role }) => role === "collection_listing");
    if (!listingAcquisition || !new Set([listingAcquisition.raw_artifact_id, listingAcquisition.readable_artifact_id]).has(listingExcerpt.artifact_id)) fail("collection excerpt does not belong to listing acquisition");

    for (const acquisition of packet.acquisitions) {
      const selected = new Set(acquisition.selected_excerpt_ids);
      if (acquisition.content_state === "inspected" && selected.size === 0) fail("inspected acquisition requires selected evidence");
      if (["resolved", "content_incomplete", "blocked"].includes(acquisition.content_state) && selected.size > 0) fail("uninspected acquisition cannot claim selected evidence");
      for (const excerptId of selected) {
        const excerpt = excerpts.get(excerptId); if (!excerpt) fail("acquisition references unknown excerpt");
        if (!new Set([acquisition.raw_artifact_id, acquisition.readable_artifact_id]).has(excerpt.artifact_id)) fail("selected excerpt does not belong to acquisition");
      }
      if (acquisition.originating_link) {
        const parent = acquisitions.get(acquisition.parent_acquisition_id);
        if (!parent?.raw_artifact_id) fail("link parent has no raw artifact");
        if (acquisition.originating_link.source_artifact_id !== parent.raw_artifact_id || acquisition.originating_link.source_depth !== parent.depth) fail("originating link source is invalid");
        const raw = artifactStore.read(parent.raw_artifact_id);
        const links = inspectLinks(raw.bytes, { artifactId: parent.raw_artifact_id, baseLocator: parent.final_locator, sourceDepth: parent.depth });
        if (!links.some((link) => canonicalJson(link) === canonicalJson(acquisition.originating_link))) fail("originating link was not harness-extracted");
        if (acquisition.requested_locator !== acquisition.originating_link.resolved_destination) fail("acquisition locator differs from extracted link");
      }
    }

    const findings = new Map();
    for (const finding of packet.findings) {
      if (finding.finding_id !== findingIdV02(finding) || findings.has(finding.finding_id)) fail("finding identity is invalid");
      if (!topicOrder.includes(finding.topic)) fail("finding topic was not requested");
      const evidence = finding.evidence_excerpt_ids.map((id) => excerpts.get(id));
      if (evidence.some((item) => !item || item.role !== "research_evidence")) fail("finding evidence is invalid");
      const statementExcerpt = excerpts.get(finding.statement_excerpt_id);
      if (!statementExcerpt || !finding.evidence_excerpt_ids.includes(finding.statement_excerpt_id) || normalize(statementExcerpt.text) !== normalize(finding.statement)) fail("finding statement must equal its selected source excerpt");
      const expectedAcquisitions = new Set(evidence.flatMap(({ artifact_id }) => [...(artifactOwners.get(artifact_id) ?? [])]));
      if (!finding.acquisition_ids.every((id) => expectedAcquisitions.has(id)) || !finding.acquisition_ids.length) fail("finding acquisition lineage is invalid");
      for (const primitive of finding.parsed_values) if (!normalize(finding.statement).includes(normalize(primitive.source_text))) fail("parsed primitive is not traceable to the supporting statement");
      findings.set(finding.finding_id, finding);
    }

    const conflicts = new Map();
    for (const conflict of packet.conflicts) {
      if (conflict.conflict_id !== conflictIdV02(conflict) || conflicts.has(conflict.conflict_id)) fail("conflict identity is invalid");
      const linked = conflict.finding_ids.map((id) => findings.get(id));
      if (linked.some((item) => !item || item.topic !== conflict.topic)) fail("conflict findings are invalid");
      conflicts.set(conflict.conflict_id, conflict);
    }

    if (packet.research_outcomes.map(({ topic }) => topic).join("|") !== topicOrder.join("|")) fail("research outcomes must match request topic order");
    for (const outcome of packet.research_outcomes) {
      if (outcome.finding_ids.some((id) => findings.get(id)?.topic !== outcome.topic)) fail("outcome finding topic mismatch");
      if (outcome.conflict_ids.some((id) => conflicts.get(id)?.topic !== outcome.topic)) fail("outcome conflict topic mismatch");
      if (outcome.status === "answered" && (!outcome.finding_ids.length || outcome.conflict_ids.length || outcome.unresolved_questions.length)) fail("answered outcome is unsupported");
      if (outcome.status === "answered" && !outcome.finding_ids.some((id) => {
        const finding = findings.get(id), statementExcerpt = excerpts.get(finding?.statement_excerpt_id);
        return finding?.acquisition_ids.some((acquisitionId) => {
          const acquisition = acquisitions.get(acquisitionId);
          return acquisition?.authority.level === "linked_first_party" && [acquisition.raw_artifact_id, acquisition.readable_artifact_id].includes(statementExcerpt?.artifact_id);
        });
      })) fail("answered outcome lacks a linked first-party statement");
      if (outcome.status === "partially_answered" && (!outcome.finding_ids.length || !outcome.unresolved_questions.length)) fail("partial outcome requires support and unresolved work");
      if (outcome.status === "conflicting" && !outcome.conflict_ids.length) fail("conflicting outcome requires a conflict");
      if (["not_found", "blocked"].includes(outcome.status) && (outcome.finding_ids.length || outcome.conflict_ids.length || !outcome.unresolved_questions.length)) fail(`${outcome.status} outcome is incoherent`);
    }
    const referenced = new Set([packet.subject.collection_excerpt_id, ...packet.findings.flatMap(({ evidence_excerpt_ids }) => evidence_excerpt_ids)]);
    for (const acquisition of packet.acquisitions) for (const id of acquisition.selected_excerpt_ids) referenced.add(id);
    for (const id of excerpts.keys()) if (!referenced.has(id)) fail("orphan excerpt");
    return packet;
  };
}

export { schema as scoutPacketSchemaV02 };
