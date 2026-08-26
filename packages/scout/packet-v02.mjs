import { packetId } from "./canonical.mjs";

export function blockedResearchV02(researchRequest, reason) {
  return {
    excerpts: [],
    findings: [],
    conflicts: [],
    outcomes: researchRequest.topics.map(({ topic }) => ({
      topic,
      status: "blocked",
      finding_ids: [],
      conflict_ids: [],
      unresolved_questions: [reason],
    })),
  };
}

export function buildSubjectPacketV02({ subject, research, researchRequest, seed, repository }) {
  const acquisitions = research.acquisitions ?? [subject.listing, ...subject.pages.map(({ page }) => page)];
  const packet = {
    schema_version: "0.2.0",
    packet_id: "",
    research_request: researchRequest,
    seed: {
      kind: seed.kind,
      locator: repository?.root ?? new URL(seed.locator).href,
      revision: repository?.revision ?? null,
    },
    subject: {
      source_label: subject.chosen.source_label,
      primary_url: subject.primary_url,
      collection_excerpt_id: subject.listingExcerpt.excerpt_id,
    },
    acquisitions: [...acquisitions].sort((a, b) => a.depth - b.depth || a.acquisition_id.localeCompare(b.acquisition_id)),
    excerpts: [...research.excerpts].sort(compareExcerpts),
    findings: research.findings,
    conflicts: research.conflicts,
    research_outcomes: research.outcomes,
    unresolved_questions: [...new Set(research.outcomes.flatMap(({ unresolved_questions }) => unresolved_questions))].sort(),
  };
  packet.packet_id = packetId(packet);
  return packet;
}

function compareExcerpts(a, b) {
  if (a.role === b.role) return a.excerpt_id.localeCompare(b.excerpt_id);
  return a.role === "collection_listing" ? -1 : 1;
}

export function aggregateResearchStatusV02(packet) {
  const statuses = packet.research_outcomes.map(({ status }) => status);
  if (statuses.every((status) => status === "answered")) return "answered";
  if (statuses.some((status) => ["answered", "partially_answered", "conflicting"].includes(status))) return "partial";
  return "blocked";
}
