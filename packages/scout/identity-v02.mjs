import { contentId, excerptId, packetId } from "./canonical.mjs";

export function acquisitionIdV02(acquisition) {
  const stable = structuredClone(acquisition);
  delete stable.acquisition_id;
  delete stable.selected_excerpt_ids;
  delete stable.content_state;
  return contentId("acq", { contract_version: "0.2.0", ...stable });
}

export function makeExcerptV02(artifactId, startByte, endByte, bytes, role) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(startByte, endByte));
  const excerpt = { excerpt_id: "", artifact_id: artifactId, start_byte: startByte, end_byte: endByte, text, role };
  excerpt.excerpt_id = excerptId(excerpt);
  return excerpt;
}

export const packetIdV02 = packetId;
