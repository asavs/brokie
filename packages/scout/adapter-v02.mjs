import { createPacketValidatorV02 } from "./validate-packet-v02.mjs";

const MAX_READABLE_CHARACTERS = 32_000;

function hostFromGit(locator) {
  const match = /(?:https?:\/\/|git@)([^/:]+)[/:]/.exec(locator);
  return match?.[1]?.toLowerCase() ?? "scout";
}

function readableMaterial(page, artifactStore) {
  if (!page.readable_artifact_id) return { readable_text: "", truncated: false };
  const stored = artifactStore.read(page.readable_artifact_id);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(stored.bytes);
  return {
    readable_text: text.slice(0, MAX_READABLE_CHARACTERS),
    truncated: text.length > MAX_READABLE_CHARACTERS,
  };
}

function pageBundle(page, artifactStore) {
  return {
    role: page.role,
    requested_url: page.requested_url,
    final_url: page.final_url,
    depth: page.depth,
    status: page.status,
    content_reasons: page.content_reasons,
    raw_artifact_id: page.raw_artifact_id,
    readable_artifact_id: page.readable_artifact_id,
    http_status: page.http_status,
    failure: page.failure,
    ...readableMaterial(page, artifactStore),
  };
}

function recordText(bundle) {
  const parts = [`--- collection listing | artifact=${bundle.collection.artifact_id} ---\n${bundle.collection.text}`];
  for (const page of bundle.pages) {
    const header = `--- acquired page | role=${page.role} | artifact=${page.readable_artifact_id ?? "none"} ---`;
    const status = `requested_url: ${page.requested_url}\nfinal_url: ${page.final_url}\nstatus: ${page.status}`;
    parts.push(`${header}\n${status}${page.readable_text ? `\n${page.readable_text}` : ""}`);
  }
  return parts.join("\n\n");
}

export function packetToLibrarianBundle(packet, artifactStore) {
  createPacketValidatorV02(artifactStore)(packet);
  const bundle = {
    bundle_version: "0.2.0",
    scout_packet_id: packet.packet_id,
    subject: packet.subject,
    collection: packet.collection,
    pages: packet.pages.map((page) => pageBundle(page, artifactStore)),
  };
  let platform = "scout";
  if (packet.seed.kind === "web") {
    try { platform = new URL(packet.seed.locator).hostname.toLowerCase(); } catch {}
  } else platform = hostFromGit(packet.seed.locator);
  const record = {
    source_kind: packet.seed.kind === "git" ? "repository" : "website",
    source_locator: `scout-packet:${packet.packet_id}#materials`,
    source_name: packet.subject.source_label,
    source_url: packet.subject.primary_url,
    source_platform: platform,
    raw_text: recordText(bundle),
    scout_material_bundle: bundle,
  };
  return { record, bundle };
}
