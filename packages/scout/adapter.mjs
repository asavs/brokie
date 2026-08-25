import { createPacketValidator } from "./validate-packet.mjs";

function hostFromGit(locator) {
  const match = /(?:https?:\/\/|git@)([^/:]+)[/:]/.exec(locator); return match?.[1]?.toLowerCase() ?? "scout";
}

export function packetToLibrarianRecord(packet, artifactStore) {
  createPacketValidator(artifactStore)(packet);
  const excerpts = new Map(packet.excerpts.map((excerpt) => [excerpt.excerpt_id, excerpt]));
  const parts = [];
  const append = (acquisition, heading) => {
    for (const id of acquisition.excerpt_ids) {
      const excerpt = excerpts.get(id);
      parts.push(`--- ${heading} | artifact=${excerpt.artifact_id} | locator=${acquisition.final_locator} ---\n${excerpt.text}`);
    }
  };
  append(packet.listing, "collection listing");
  for (const page of packet.followed_pages) append(page, "followed page");
  let platform = "scout";
  if (packet.seed.kind === "web") { try { platform = new URL(packet.seed.locator).hostname.toLowerCase(); } catch {} }
  else platform = hostFromGit(packet.seed.locator);
  return {
    source_kind: packet.seed.kind === "git" ? "repository" : "website",
    source_locator: `scout-packet:${packet.packet_id}#listing`, source_name: packet.subject.source_label,
    source_url: packet.subject.primary_url ?? "", source_platform: platform, raw_text: parts.join("\n\n"),
  };
}
