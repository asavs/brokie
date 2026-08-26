import { acquisitionIdV02 } from "./identity-v02.mjs";
import { inspectLinks } from "./inspect.mjs";
import { boundedReadableSegments, boundedRelevantLinks, createReadableArtifact } from "./readable-v02.mjs";

const ACQUISITION_FAILURE_CODES = new Set([
  "budget_request_exhausted", "budget_page_exhausted", "budget_byte_exhausted", "budget_time_exhausted",
  "depth_exceeded", "robots_denied", "ssrf_blocked", "unsupported_scheme", "unsupported_content_type",
  "redirect_limit_exceeded", "fetch_timeout", "http_error", "content_too_large", "browser_required", "other",
]);

function authority(primaryUrl, destination) {
  try {
    const level = new URL(primaryUrl).origin === new URL(destination).origin ? "linked_first_party" : "linked_third_party";
    return { level, basis: level === "linked_first_party" ? "same_origin" : "cross_origin" };
  } catch {
    return { level: "unknown", basis: "unknown" };
  }
}

function withIdentity(record) {
  record.acquisition_id = acquisitionIdV02(record);
  return record;
}

function linkedDepth(role) {
  return role === "listed_page" ? 1 : 2;
}

function failedAcquisition({ role, destination, parent, link, code, authorityValue }) {
  return withIdentity({
    acquisition_id: "",
    role,
    requested_locator: destination,
    final_locator: destination,
    depth: linkedDepth(role),
    status: "blocked",
    content_state: "blocked",
    content_reasons: [],
    raw_artifact_id: null,
    readable_artifact_id: null,
    transformation: null,
    parent_acquisition_id: parent.acquisition_id,
    parent_url: parent.final_locator,
    originating_link: link,
    http_status: null,
    failure: { code },
    authority: authorityValue,
    selected_excerpt_ids: [],
  });
}

function acquiredPage({ role, destination, parent, link, fetched, readable, authorityValue }) {
  return withIdentity({
    acquisition_id: "",
    role,
    requested_locator: destination,
    final_locator: fetched.final_locator,
    depth: linkedDepth(role),
    status: "acquired",
    content_state: readable.incomplete ? "content_incomplete" : "resolved",
    content_reasons: readable.incompleteReasons,
    raw_artifact_id: fetched.artifact_id,
    readable_artifact_id: readable.artifact.artifact_id,
    transformation: readable.transformation,
    parent_acquisition_id: parent.acquisition_id,
    parent_url: parent.final_locator,
    originating_link: link,
    http_status: fetched.http_status,
    failure: null,
    authority: authorityValue,
    selected_excerpt_ids: [],
  });
}

function pageSegments(page, readable) {
  return boundedReadableSegments(readable.bytes, { maxBytes: 24_000, segmentBytes: 1_200 })
    .map((segment, index) => ({ segment_id: `${page.acquisition_id}:s${index}`, artifact_id: readable.artifact.artifact_id, ...segment }));
}

function failureCode(error) {
  return ACQUISITION_FAILURE_CODES.has(error?.code) ? error.code : "other";
}

export async function fetchLinkedPageV02({ subject, link, role, parent, httpTool, artifactStore }) {
  const destination = link?.resolved_destination ?? link?.raw_destination ?? "unavailable";
  const authorityValue = authority(subject.primary_url, destination);
  if (!link?.resolved_destination) {
    const page = failedAcquisition({ role, destination, parent, link, code: "unsupported_scheme", authorityValue });
    return { page, segments: [], links: [], relevant: [], incomplete: false };
  }
  try {
    const fetched = await httpTool.fetch(destination, {
      depth: linkedDepth(role),
      kind: "http_link",
      parent_acquisition_id: parent.acquisition_id,
      originating_link_id: link.link_id,
      authority: { ...authorityValue, excerpt_ids: [] },
    });
    const manifest = artifactStore.read(fetched.artifact_id).manifest;
    const readable = createReadableArtifact(fetched.bytes, manifest.media_type, artifactStore);
    const page = acquiredPage({ role, destination, parent, link, fetched, readable, authorityValue });
    const links = inspectLinks(fetched.bytes, { artifactId: fetched.artifact_id, baseLocator: fetched.final_locator, sourceDepth: page.depth });
    const relevant = boundedRelevantLinks(links);
    return { page, segments: pageSegments(page, readable), links, relevant, incomplete: readable.incomplete };
  } catch (error) {
    const code = failureCode(error);
    const page = failedAcquisition({ role, destination, parent, link, code, authorityValue });
    return { page, segments: [], links: [], relevant: [], incomplete: code === "browser_required" };
  }
}

export function pageObservationV02(subject, fetched) {
  return {
    type: "page",
    role: fetched.page.role,
    final_url: fetched.page.final_locator,
    http_status: fetched.page.http_status,
    content_reasons: fetched.page.content_reasons,
    readable_text: fetched.segments.map(({ text }) => text).join("\n"),
    outgoing_links: (fetched.relevant ?? []).map((link) => ({
      index: link.index,
      label: link.label,
      resolved_destination: link.resolved_destination,
    })),
  };
}
