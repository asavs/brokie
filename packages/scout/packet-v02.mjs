import { packetId } from "./canonical.mjs";

function pageMaterial({ page }) {
  return {
    role: page.role,
    requested_url: page.requested_locator,
    final_url: page.final_locator,
    depth: page.depth,
    status: page.status,
    content_reasons: page.content_reasons,
    raw_artifact_id: page.raw_artifact_id,
    readable_artifact_id: page.readable_artifact_id,
    transformation: page.transformation,
    parent_url: page.parent_url,
    originating_link: page.originating_link,
    http_status: page.http_status,
    failure: page.failure,
  };
}

export function buildScoutPacketV02({ subject, seed, repository }) {
  const packet = {
    schema_version: "0.2.0",
    packet_id: "",
    seed: {
      kind: seed.kind,
      locator: repository?.locator ?? repository?.root ?? new URL(seed.locator).href,
      revision: repository?.revision ?? null,
    },
    subject: {
      source_label: subject.candidate.source_label,
      primary_url: subject.primaryUrl,
    },
    collection: {
      locator: subject.source.locator,
      artifact_id: subject.listing.artifact_id,
      start_byte: subject.listing.start_byte,
      end_byte: subject.listing.end_byte,
      text: subject.listing.text,
    },
    pages: subject.pages.map(pageMaterial)
      .sort((a, b) => a.depth - b.depth || a.final_url.localeCompare(b.final_url)),
  };
  packet.packet_id = packetId(packet);
  return packet;
}

export function materialStatusV02(packet) {
  if (!packet.pages.length || packet.pages.every(({ status }) => status !== "acquired")) return "collection_only";
  const incomplete = packet.pages.some(({ status, content_reasons }) => status !== "acquired" || content_reasons.length);
  return incomplete ? "partial" : "acquired";
}
