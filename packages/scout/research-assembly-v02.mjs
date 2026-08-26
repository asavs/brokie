import { conflictIdV02, findingIdV02, makeExcerptV02 } from "./identity-v02.mjs";
import { protocolError } from "./action-v02.mjs";

const MAX_EVIDENCE_BYTES = 2_000;

function normalize(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function assertProtocol(condition, detail) {
  if (!condition) throw protocolError(detail);
}

function sourceRelationshipKey(acquisition) {
  if (acquisition.role === "collection_listing") return `collection:${acquisition.acquisition_id}`;
  try {
    return `${acquisition.authority.level}:${new URL(acquisition.final_locator).origin}`;
  } catch {
    return `${acquisition.authority.level}:${acquisition.final_locator}`;
  }
}

function acquisitionFor(subject, acquisitionId) {
  if (acquisitionId === subject.listing.acquisition_id) return subject.listing;
  return subject.pages.find(({ page }) => page.acquisition_id === acquisitionId)?.page;
}

function createExcerptResolver(subject, artifactStore, excerpts) {
  return function resolveExcerpt(segmentId) {
    const segment = subject.availableSegments.get(segmentId);
    assertProtocol(segment, `unknown evidence segment: ${segmentId}`);
    assertProtocol(segment.end_byte - segment.start_byte <= MAX_EVIDENCE_BYTES, "evidence segment exceeds the bound");
    const bytes = artifactStore.read(segment.artifact_id).bytes;
    const excerpt = makeExcerptV02(segment.artifact_id, segment.start_byte, segment.end_byte, bytes, "research_evidence");
    excerpts.set(excerpt.excerpt_id, excerpt);
    return { excerpt, segment };
  };
}

function buildFinding(subject, proposed, resolveExcerpt) {
  const segmentIds = [...new Set([proposed.statement_segment_id, ...proposed.evidence_segment_ids])];
  const evidence = segmentIds.map(resolveExcerpt);
  const acquisitions = evidence.map(({ segment }) => acquisitionFor(subject, segment.acquisition_id));
  assertProtocol(acquisitions.every(Boolean), "finding acquisition is missing");
  assertProtocol(new Set(acquisitions.map(sourceRelationshipKey)).size === 1, "one finding cannot cross source relationships");
  const evidenceText = normalize(evidence.map(({ excerpt }) => excerpt.text).join(" "));
  assertProtocol(proposed.parsed_values.every(({ source_text }) => evidenceText.includes(normalize(source_text))), "parsed value is not present in cited evidence");
  const statement = evidence.find(({ segment }) => segment.segment_id === proposed.statement_segment_id);
  const finding = {
    finding_id: "",
    topic: proposed.topic,
    statement: statement.excerpt.text,
    statement_excerpt_id: statement.excerpt.excerpt_id,
    derivation: proposed.derivation,
    evidence_excerpt_ids: [...new Set(evidence.map(({ excerpt }) => excerpt.excerpt_id))].sort(),
    acquisition_ids: [...new Set(evidence.map(({ segment }) => segment.acquisition_id))].sort(),
    parsed_values: proposed.parsed_values,
  };
  finding.finding_id = findingIdV02(finding);
  return finding;
}

function buildConflict(proposed, findingRecords) {
  const findings = proposed.finding_indexes.map((index) => findingRecords[index]);
  assertProtocol(findings.every(Boolean), "conflict references an unknown finding");
  assertProtocol(findings.every(({ topic }) => topic === proposed.topic), "conflict crosses research topics");
  const conflict = {
    conflict_id: "",
    topic: proposed.topic,
    finding_ids: [...new Set(findings.map(({ finding_id }) => finding_id))].sort(),
    observation: proposed.observation,
  };
  assertProtocol(conflict.finding_ids.length >= 2, "conflict requires two distinct findings");
  conflict.conflict_id = conflictIdV02(conflict);
  return conflict;
}

function buildOutcome(topic, proposed, findingRecords, conflicts) {
  assertProtocol(proposed, `missing outcome for ${topic}`);
  assertProtocol(proposed.topic === topic, `outcome order differs for ${topic}`);
  const findings = proposed.finding_indexes.map((index) => findingRecords[index]);
  const selectedConflicts = proposed.conflict_indexes.map((index) => conflicts[index]);
  assertProtocol(findings.every(Boolean), "outcome references an unknown finding");
  assertProtocol(selectedConflicts.every(Boolean), "outcome references an unknown conflict");
  assertProtocol(findings.every((finding) => finding.topic === topic), "outcome crosses finding topics");
  assertProtocol(selectedConflicts.every((conflict) => conflict.topic === topic), "outcome crosses conflict topics");
  return {
    topic,
    status: proposed.status,
    finding_ids: [...new Set(findings.map(({ finding_id }) => finding_id))].sort(),
    conflict_ids: [...new Set(selectedConflicts.map(({ conflict_id }) => conflict_id))].sort(),
    unresolved_questions: [...new Set(proposed.unresolved_questions)].sort(),
  };
}

function hasQuantifiedClaim(text) {
  return /(?:^|\D)\d+(?:[.,]\d+)?(?:\s|$|[%$€£])/u.test(text);
}

function assertCollectionClaimRepresented(subject, findings) {
  if (!hasQuantifiedClaim(subject.listingExcerpt.text)) return;
  const numerical = findings.filter(({ topic }) => topic === "numerical_limits");
  const hasLinked = numerical.some(({ acquisition_ids }) => acquisition_ids.some((id) => acquisitionFor(subject, id)?.authority.level === "linked_first_party"));
  if (!hasLinked) return;
  const hasCollection = numerical.some(({ acquisition_ids }) => acquisition_ids.includes(subject.listing.acquisition_id));
  assertProtocol(hasCollection, "quantified collection claim was omitted instead of reconciled");
}

function selectedExcerptOwners(subject, findings, excerpts) {
  const selected = new Map();
  for (const finding of findings) {
    for (const excerptId of finding.evidence_excerpt_ids) {
      const excerpt = excerpts.get(excerptId);
      const owner = finding.acquisition_ids.find((id) => {
        const acquisition = acquisitionFor(subject, id);
        return acquisition && [acquisition.raw_artifact_id, acquisition.readable_artifact_id].includes(excerpt.artifact_id);
      });
      assertProtocol(owner, "finding excerpt has no acquisition owner");
      const ids = selected.get(owner) ?? new Set();
      ids.add(excerptId);
      selected.set(owner, ids);
    }
  }
  return selected;
}

function markInspectedAcquisitions(subject, selected) {
  return [subject.listing, ...subject.pages.map(({ page }) => page)].map((page) => {
    const copy = structuredClone(page);
    const excerptIds = selected.get(page.acquisition_id);
    if (excerptIds && page.role !== "collection_listing") {
      copy.selected_excerpt_ids = [...excerptIds].sort();
      copy.content_state = "inspected";
    }
    return copy;
  });
}

export function assembleResearchV02({ subject, action, artifactStore, researchRequest }) {
  assertProtocol(action.outcomes.length === researchRequest.topics.length, "research must answer every requested topic");
  const excerpts = new Map([[subject.listingExcerpt.excerpt_id, subject.listingExcerpt]]);
  const resolveExcerpt = createExcerptResolver(subject, artifactStore, excerpts);
  const findings = action.findings.map((item) => buildFinding(subject, item, resolveExcerpt));
  assertCollectionClaimRepresented(subject, findings);
  const conflicts = action.conflicts.map((item) => buildConflict(item, findings));
  const outcomes = researchRequest.topics.map(({ topic }, index) => buildOutcome(topic, action.outcomes[index], findings, conflicts));
  const selected = selectedExcerptOwners(subject, findings, excerpts);
  return {
    acquisitions: markInspectedAcquisitions(subject, selected),
    excerpts: [...excerpts.values()],
    findings: findings.sort((a, b) => a.finding_id.localeCompare(b.finding_id)),
    conflicts: conflicts.sort((a, b) => a.conflict_id.localeCompare(b.conflict_id)),
    outcomes,
  };
}
