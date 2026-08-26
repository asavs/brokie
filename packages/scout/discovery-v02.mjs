import { inspectLinks, inspectListingBoundaries } from "./inspect.mjs";

const MAX_CANDIDATES = 80;
const MAX_LISTING_LINKS = 4;

function sample(items, maximum) {
  if (items.length <= maximum) return [...items];
  return Array.from({ length: maximum }, (_, index) => items[Math.round(index * (items.length - 1) / (maximum - 1))]);
}

function textAt(bytes, start, end) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start, end));
}

function listingLinks(boundary, links) {
  return links
    .filter((link) => link.start_byte >= boundary.start_byte && link.end_byte <= boundary.end_byte)
    .slice(0, MAX_LISTING_LINKS)
    .map((link, index) => ({ index, label: link.label, resolved_destination: link.resolved_destination }));
}

function selectCandidates(boundaries, targetLabels) {
  const required = targetLabels.length ? boundaries.filter(({ source_label }) => targetLabels.includes(source_label)) : [];
  const remainder = boundaries.filter((boundary) => !required.includes(boundary));
  return [...required, ...sample(remainder, Math.max(0, MAX_CANDIDATES - required.length))]
    .sort((a, b) => a.start_byte - b.start_byte);
}

export function discoverCollectionV02({ bytes, mediaType, artifactId, baseLocator, targetLabels = [] }) {
  const boundaries = inspectListingBoundaries(bytes, mediaType);
  const links = inspectLinks(bytes, { artifactId, baseLocator, sourceDepth: 0 });
  const candidates = selectCandidates(boundaries, targetLabels).map((boundary) => ({
    ...boundary,
    description_text: textAt(bytes, boundary.start_byte, boundary.end_byte).slice(0, 1200),
    links: listingLinks(boundary, links),
  }));
  return { boundaries, links, candidates };
}
