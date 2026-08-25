import { createPacketValidatorV02 } from "./validate-packet-v02.mjs";

function hostFromGit(locator) {
  const match = /(?:https?:\/\/|git@)([^/:]+)[/:]/.exec(locator); return match?.[1]?.toLowerCase() ?? "scout";
}

export function packetToLibrarianBundle(packet, artifactStore) {
  createPacketValidatorV02(artifactStore)(packet);
  const excerpts = new Map(packet.excerpts.map((excerpt) => [excerpt.excerpt_id, excerpt]));
  const selectedEvidence = packet.excerpts.map((excerpt) => ({
    scout_excerpt_id: excerpt.excerpt_id, artifact_id: excerpt.artifact_id,
    start_byte: excerpt.start_byte, end_byte: excerpt.end_byte, role: excerpt.role, text: excerpt.text,
  }));
  const bundle = {
    bundle_version: "0.2.0", scout_packet_id: packet.packet_id, research_request: packet.research_request,
    subject: packet.subject,
    acquisitions: packet.acquisitions.map((item) => ({
      acquisition_id: item.acquisition_id, role: item.role, requested_locator: item.requested_locator,
      final_locator: item.final_locator, depth: item.depth, status: item.status, content_state: item.content_state,
      content_reasons: item.content_reasons,
      raw_artifact_id: item.raw_artifact_id, readable_artifact_id: item.readable_artifact_id,
      parent_acquisition_id: item.parent_acquisition_id, authority: item.authority, failure: item.failure,
      selected_excerpt_ids: item.selected_excerpt_ids,
    })),
    excerpts: selectedEvidence,
    findings: packet.findings,
    conflicts: packet.conflicts,
    research_outcomes: packet.research_outcomes,
    unresolved_questions: packet.unresolved_questions,
  };
  const listing = excerpts.get(packet.subject.collection_excerpt_id);
  const parts = [`--- collection listing | scout_excerpt_id=${listing.excerpt_id} | artifact=${listing.artifact_id} ---\n${listing.text}`];
  for (const acquisition of packet.acquisitions.filter(({ depth }) => depth > 0)) {
    parts.push(`--- scout acquisition | acquisition_id=${acquisition.acquisition_id} | role=${acquisition.role} ---\nrequested_url: ${acquisition.requested_locator}\nfinal_url: ${acquisition.final_locator}`);
  }
  for (const excerpt of packet.excerpts.filter(({ role }) => role === "research_evidence")) {
    parts.push(`--- exact selected evidence | scout_excerpt_id=${excerpt.excerpt_id} | artifact=${excerpt.artifact_id} ---\n${excerpt.text}`);
  }
  let platform = "scout";
  if (packet.seed.kind === "web") { try { platform = new URL(packet.seed.locator).hostname.toLowerCase(); } catch {} }
  else platform = hostFromGit(packet.seed.locator);
  const record = {
    source_kind: packet.seed.kind === "git" ? "repository" : "website",
    source_locator: `scout-packet:${packet.packet_id}#research`, source_name: packet.subject.source_label,
    source_url: packet.subject.primary_url ?? "", source_platform: platform,
    raw_text: parts.join("\n\n"), scout_evidence_bundle: bundle,
  };
  return { record, bundle };
}
