import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalJson, contentId } from "./canonical.mjs";
import { inspectLinks } from "./inspect.mjs";
import { acquisitionIdV02, conflictIdV02, findingIdV02, packetIdV02 } from "./identity-v02.mjs";
import { explicitlyDescribesAgreementV02 } from "./derive-packet-v02.mjs";

const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../schemas/scout-packet.v0.2.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

function normalize(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function fail(message) {
  throw new Error(`invalid ScoutPacket v0.2: ${message}`);
}

function assertPacket(condition, message) {
  if (!condition) fail(message);
}

function sourceRelationshipKey(acquisition) {
  if (acquisition.role === "collection_listing") return `collection:${acquisition.acquisition_id}`;
  try {
    return `${acquisition.authority.level}:${new URL(acquisition.final_locator).origin}`;
  } catch {
    return `${acquisition.authority.level}:${acquisition.final_locator}`;
  }
}

function acquisitionArtifactsCoherent(acquisition) {
  const acquired = acquisition.status === "acquired";
  return acquired === Boolean(acquisition.raw_artifact_id) && acquired === Boolean(acquisition.readable_artifact_id);
}

function failedAcquisitionCoherent(acquisition) {
  if (acquisition.status === "acquired") return acquisition.failure === null;
  return acquisition.failure !== null && acquisition.content_state === "blocked";
}

function acquisitionRoleCoherent(acquisition) {
  if (acquisition.role === "collection_listing") return acquisition.depth === 0 && acquisition.parent_acquisition_id === null && acquisition.originating_link === null;
  if (acquisition.role === "listed_page") return acquisition.depth === 1;
  return acquisition.role !== "evidence_page" || acquisition.depth === 2;
}

function selectedStateCoherent(acquisition) {
  const count = acquisition.selected_excerpt_ids.length;
  if (acquisition.content_state === "inspected") return count > 0;
  return !["resolved", "content_incomplete", "blocked"].includes(acquisition.content_state) || count === 0;
}

class PacketValidatorV02 {
  constructor(packet, artifactStore) {
    this.packet = packet;
    this.artifactStore = artifactStore;
    this.acquisitions = new Map();
    this.artifactOwners = new Map();
    this.excerpts = new Map();
    this.findings = new Map();
    this.conflicts = new Map();
    this.topicOrder = [];
  }

  validate() {
    this.validateEnvelope();
    this.validateAcquisitions();
    this.validateExcerpts();
    this.validateCollectionExcerpt();
    this.validateAcquisitionReferences();
    this.validateFindings();
    this.validateConflicts();
    this.validateOutcomes();
    this.validateExcerptReachability();
    return this.packet;
  }

  validateEnvelope() {
    assertPacket(validateSchema(this.packet), ajv.errorsText(validateSchema.errors));
    assertPacket(this.packet.packet_id === packetIdV02(this.packet), "packet identity mismatch");
    const request = this.packet.research_request;
    const stable = { request_version: request.request_version, objective: request.objective, topics: request.topics };
    assertPacket(request.request_id === contentId("research", stable), "research request identity mismatch");
    this.topicOrder = request.topics.map(({ topic }) => topic);
    assertPacket(new Set(this.topicOrder).size === this.topicOrder.length, "duplicate research topic");
  }

  rememberArtifactOwner(artifactId, acquisitionId) {
    const owners = this.artifactOwners.get(artifactId) ?? new Set();
    owners.add(acquisitionId);
    this.artifactOwners.set(artifactId, owners);
  }

  validateArtifactLineage(acquisition) {
    let raw;
    let readable;
    try {
      raw = this.artifactStore.read(acquisition.raw_artifact_id);
      readable = this.artifactStore.read(acquisition.readable_artifact_id);
    } catch {
      fail("missing or corrupt acquisition artifact");
    }
    if (acquisition.raw_artifact_id !== acquisition.readable_artifact_id) {
      const legacy = readable.manifest.kind === "derived_text" && readable.manifest.transformation === acquisition.transformation;
      const current = readable.manifest.kind === "readable_text" && ["html-readable-text@0.2.0", "utf8-readable-text@0.2.0"].includes(acquisition.transformation);
      assertPacket(legacy || current, "readable artifact lineage is invalid");
    } else {
      assertPacket(acquisition.transformation === null, "identity readable artifact cannot claim a transformation");
    }
    this.rememberArtifactOwner(acquisition.raw_artifact_id, acquisition.acquisition_id);
    this.rememberArtifactOwner(acquisition.readable_artifact_id, acquisition.acquisition_id);
    void raw;
  }

  validateAcquisition(acquisition) {
    assertPacket(!this.acquisitions.has(acquisition.acquisition_id), "duplicate acquisition");
    assertPacket(acquisition.acquisition_id === acquisitionIdV02(acquisition), `acquisition identity mismatch: ${acquisition.acquisition_id}`);
    assertPacket(acquisitionArtifactsCoherent(acquisition), "acquired artifacts are incoherent");
    assertPacket(failedAcquisitionCoherent(acquisition), "failed acquisition is incoherent");
    assertPacket(acquisition.content_state !== "content_incomplete" || acquisition.content_reasons.length > 0, "content-incomplete acquisition requires reasons");
    assertPacket(acquisition.content_state !== "resolved" || acquisition.content_reasons.length === 0, "resolved acquisition cannot retain incompleteness reasons");
    assertPacket(acquisitionRoleCoherent(acquisition), "acquisition role lineage is invalid");
    const linked = acquisition.depth > 0;
    assertPacket(!linked || Boolean(acquisition.parent_acquisition_id && acquisition.originating_link), "linked acquisition requires parent and extracted link");
    if (acquisition.status === "acquired") this.validateArtifactLineage(acquisition);
    this.acquisitions.set(acquisition.acquisition_id, acquisition);
  }

  validateAcquisitions() {
    this.packet.acquisitions.forEach((item) => this.validateAcquisition(item));
    assertPacket(this.packet.acquisitions.some(({ role }) => role === "collection_listing"), "missing collection listing");
    for (const acquisition of this.packet.acquisitions) {
      assertPacket(!acquisition.parent_acquisition_id || this.acquisitions.has(acquisition.parent_acquisition_id), "unknown acquisition parent");
    }
  }

  validateExcerpt(excerpt) {
    assertPacket(!this.excerpts.has(excerpt.excerpt_id), "duplicate excerpt");
    let stored;
    try {
      stored = this.artifactStore.read(excerpt.artifact_id);
    } catch {
      fail("missing or corrupt excerpt artifact");
    }
    assertPacket(excerpt.end_byte <= stored.bytes.length, "excerpt offsets are invalid");
    assertPacket(excerpt.start_byte < excerpt.end_byte, "excerpt offsets are invalid");
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(stored.bytes.subarray(excerpt.start_byte, excerpt.end_byte));
    assertPacket(decoded === excerpt.text, "excerpt text mismatch");
    assertPacket(Buffer.byteLength(decoded, "utf8") === excerpt.end_byte - excerpt.start_byte, "excerpt text mismatch");
    const rawHtmlEvidence = excerpt.role === "research_evidence" && stored.manifest.kind === "http_body" && stored.manifest.media_type === "text/html";
    assertPacket(!rawHtmlEvidence, "raw HTML cannot be selected research evidence");
    this.excerpts.set(excerpt.excerpt_id, excerpt);
  }

  validateExcerpts() {
    this.packet.excerpts.forEach((item) => this.validateExcerpt(item));
  }

  validateCollectionExcerpt() {
    const excerpt = this.excerpts.get(this.packet.subject.collection_excerpt_id);
    assertPacket(excerpt?.role === "collection_listing", "subject collection excerpt is invalid");
    const acquisition = this.packet.acquisitions.find(({ role }) => role === "collection_listing");
    assertPacket(Boolean(acquisition), "subject collection acquisition is missing");
    assertPacket([acquisition.raw_artifact_id, acquisition.readable_artifact_id].includes(excerpt.artifact_id), "collection excerpt does not belong to listing acquisition");
  }

  validateOriginatingLink(acquisition) {
    if (!acquisition.originating_link) return;
    const parent = this.acquisitions.get(acquisition.parent_acquisition_id);
    assertPacket(Boolean(parent?.raw_artifact_id), "link parent has no raw artifact");
    assertPacket(acquisition.originating_link.source_artifact_id === parent.raw_artifact_id, "originating link source is invalid");
    assertPacket(acquisition.originating_link.source_depth === parent.depth, "originating link source is invalid");
    const raw = this.artifactStore.read(parent.raw_artifact_id);
    const links = inspectLinks(raw.bytes, { artifactId: parent.raw_artifact_id, baseLocator: parent.final_locator, sourceDepth: parent.depth });
    assertPacket(links.some((link) => canonicalJson(link) === canonicalJson(acquisition.originating_link)), "originating link was not harness-extracted");
    assertPacket(acquisition.requested_locator === acquisition.originating_link.resolved_destination, "acquisition locator differs from extracted link");
  }

  validateAcquisitionReferences() {
    for (const acquisition of this.packet.acquisitions) {
      assertPacket(selectedStateCoherent(acquisition), "acquisition selected evidence state is invalid");
      for (const excerptId of acquisition.selected_excerpt_ids) {
        const excerpt = this.excerpts.get(excerptId);
        assertPacket(Boolean(excerpt), "acquisition references unknown excerpt");
        assertPacket([acquisition.raw_artifact_id, acquisition.readable_artifact_id].includes(excerpt.artifact_id), "selected excerpt does not belong to acquisition");
      }
      this.validateOriginatingLink(acquisition);
    }
  }

  findingEvidence(finding) {
    return finding.evidence_excerpt_ids.map((id) => this.excerpts.get(id));
  }

  validateFinding(finding) {
    assertPacket(finding.finding_id === findingIdV02(finding), "finding identity is invalid");
    assertPacket(!this.findings.has(finding.finding_id), "finding identity is invalid");
    assertPacket(this.topicOrder.includes(finding.topic), "finding topic was not requested");
    const evidence = this.findingEvidence(finding);
    assertPacket(evidence.every((item) => item?.role === "research_evidence"), "finding evidence is invalid");
    const statement = this.excerpts.get(finding.statement_excerpt_id);
    assertPacket(Boolean(statement), "finding statement is missing");
    assertPacket(finding.evidence_excerpt_ids.includes(finding.statement_excerpt_id), "finding statement is not cited");
    assertPacket(normalize(statement.text) === normalize(finding.statement), "finding statement must equal its selected source excerpt");
    const owners = new Set(evidence.flatMap(({ artifact_id }) => [...(this.artifactOwners.get(artifact_id) ?? [])]));
    assertPacket(finding.acquisition_ids.length > 0, "finding acquisition lineage is invalid");
    assertPacket(finding.acquisition_ids.every((id) => owners.has(id)), "finding acquisition lineage is invalid");
    const relationships = finding.acquisition_ids.map((id) => sourceRelationshipKey(this.acquisitions.get(id)));
    assertPacket(new Set(relationships).size === 1, "finding must preserve one source relationship");
    assertPacket(evidence.every((item) => this.evidenceOwnedByFinding(item, finding)), "finding evidence crosses its source relationship");
    const joined = normalize(evidence.map(({ text }) => text).join(" "));
    assertPacket(finding.parsed_values.every(({ source_text }) => joined.includes(normalize(source_text))), "parsed primitive is not traceable to cited evidence");
    this.findings.set(finding.finding_id, finding);
  }

  evidenceOwnedByFinding(excerpt, finding) {
    return finding.acquisition_ids.some((id) => {
      const acquisition = this.acquisitions.get(id);
      return [acquisition.raw_artifact_id, acquisition.readable_artifact_id].includes(excerpt.artifact_id);
    });
  }

  validateFindings() {
    this.packet.findings.forEach((item) => this.validateFinding(item));
  }

  validateConflict(conflict) {
    assertPacket(conflict.conflict_id === conflictIdV02(conflict), "conflict identity is invalid");
    assertPacket(!this.conflicts.has(conflict.conflict_id), "conflict identity is invalid");
    assertPacket(!explicitlyDescribesAgreementV02(conflict.observation), "conflict observation explicitly describes agreement");
    const linked = conflict.finding_ids.map((id) => this.findings.get(id));
    assertPacket(linked.every((item) => item?.topic === conflict.topic), "conflict findings are invalid");
    this.conflicts.set(conflict.conflict_id, conflict);
  }

  validateConflicts() {
    this.packet.conflicts.forEach((item) => this.validateConflict(item));
  }

  answeredByFirstParty(outcome) {
    return outcome.finding_ids.some((id) => {
      const finding = this.findings.get(id);
      const statement = this.excerpts.get(finding?.statement_excerpt_id);
      return finding?.acquisition_ids.some((acquisitionId) => {
        const acquisition = this.acquisitions.get(acquisitionId);
        const ownsStatement = [acquisition?.raw_artifact_id, acquisition?.readable_artifact_id].includes(statement?.artifact_id);
        return acquisition?.authority.level === "linked_first_party" && ownsStatement;
      });
    });
  }

  validateOutcome(outcome) {
    assertPacket(outcome.finding_ids.every((id) => this.findings.get(id)?.topic === outcome.topic), "outcome finding topic mismatch");
    assertPacket(outcome.conflict_ids.every((id) => this.conflicts.get(id)?.topic === outcome.topic), "outcome conflict topic mismatch");
    const answeredShape = outcome.finding_ids.length > 0 && outcome.conflict_ids.length === 0 && outcome.unresolved_questions.length === 0;
    assertPacket(outcome.status !== "answered" || answeredShape, "answered outcome is unsupported");
    assertPacket(outcome.status !== "answered" || this.answeredByFirstParty(outcome), "answered outcome lacks a linked first-party statement");
    const partialShape = outcome.finding_ids.length > 0 && outcome.unresolved_questions.length > 0;
    assertPacket(outcome.status !== "partially_answered" || partialShape, "partial outcome requires support and unresolved work");
    assertPacket(outcome.status !== "conflicting" || outcome.conflict_ids.length > 0, "conflicting outcome requires a conflict");
    const emptyShape = outcome.finding_ids.length === 0 && outcome.conflict_ids.length === 0 && outcome.unresolved_questions.length > 0;
    assertPacket(!["not_found", "blocked"].includes(outcome.status) || emptyShape, `${outcome.status} outcome is incoherent`);
  }

  validateOutcomes() {
    const outcomeTopics = this.packet.research_outcomes.map(({ topic }) => topic).join("|");
    assertPacket(outcomeTopics === this.topicOrder.join("|"), "research outcomes must match request topic order");
    this.packet.research_outcomes.forEach((item) => this.validateOutcome(item));
  }

  validateExcerptReachability() {
    const findingExcerpts = this.packet.findings.flatMap(({ evidence_excerpt_ids }) => evidence_excerpt_ids);
    const referenced = new Set([this.packet.subject.collection_excerpt_id, ...findingExcerpts]);
    for (const acquisition of this.packet.acquisitions) {
      acquisition.selected_excerpt_ids.forEach((id) => referenced.add(id));
    }
    for (const id of this.excerpts.keys()) assertPacket(referenced.has(id), "orphan excerpt");
  }
}

export function createPacketValidatorV02(artifactStore) {
  return function validatePacketV02(packet) {
    return new PacketValidatorV02(packet, artifactStore).validate();
  };
}

export { schema as scoutPacketSchemaV02 };
