const TRANSFORMATION = "html-readable-text@0.2.0";
const RESEARCH_TERMS = /\b(free|pricing|price|plans?|limits?|quota|projects?|executions?|users?|seats?|month(?:ly)?|year(?:ly)?|requirements?|eligib(?:le|ility)|terms?|discount|credit|starter|account|device|commercial|nonprofit|education|student)\b|[$€£]/gi;

function decodeEntities(text) {
  const named = new Map([["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", "\""], ["apos", "'"], ["nbsp", " "]]);
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const value = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
    }
    return named.get(entity.toLowerCase()) ?? whole;
  });
}

function htmlToText(html) {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|canvas)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+(?:hidden|aria-hidden\s*=\s*["']?true|style\s*=\s*["'][^"']*display\s*:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/gi, " ")
    .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|header|footer|main|aside|nav|li|tr|h[1-6]|dt|dd)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createReadableArtifact(rawBytes, mediaType, artifactStore) {
  const rawText = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  const readableText = mediaType === "text/html" ? htmlToText(rawText) : rawText.replace(/\r\n/g, "\n").trim();
  let bytes = Buffer.from(readableText, "utf8");
  const rawArtifactId = `art_sha256_${sha256(rawBytes)}`;
  if (mediaType === "text/html" && bytes.equals(Buffer.from(rawBytes))) bytes = Buffer.concat([bytes, Buffer.from("\n")]);
  const incompleteReasons = [];
  if (mediaType === "text/html" && /enable javascript|javascript (?:is )?required|please turn on javascript/i.test(`${rawText}\n${readableText}`)) incompleteReasons.push("browser_required");
  if (mediaType === "text/html" && rawBytes.length > 20_000 && bytes.length < 500) incompleteReasons.push("readable_content_sparse");
  const incomplete = incompleteReasons.length > 0;
  if (bytes.equals(Buffer.from(rawBytes))) return { artifact: artifactStore.read(rawArtifactId).manifest, bytes, incomplete, incompleteReasons, transformation: null };
  const artifact = artifactStore.put(bytes, {
    kind: "derived_text",
    media_type: "text/plain",
    derived_from_artifact_id: rawArtifactId,
    transformation: mediaType === "text/html" ? TRANSFORMATION : "utf8-readable-text@0.2.0",
  });
  return { artifact, bytes, incomplete, incompleteReasons, transformation: artifact.transformation };
}

function utf8End(bytes, proposed) {
  let end = Math.min(proposed, bytes.length);
  while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return end;
}

export function boundedReadableSegments(bytes, { maxBytes = 24_000, segmentBytes = 2_000 } = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || !Number.isInteger(segmentBytes) || segmentBytes < 1) throw new Error("invalid readable bounds");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const segments = [];
  let codeUnits = 0;
  for (const part of text.split(/\n+/)) {
    const startCode = text.indexOf(part, codeUnits); codeUnits = startCode + part.length;
    if (!part.trim()) continue;
    const start = Buffer.byteLength(text.slice(0, startCode), "utf8");
    const end = start + Buffer.byteLength(part, "utf8");
    for (let cursor = start; cursor < end;) {
      const segmentEnd = utf8End(bytes, Math.min(end, cursor + segmentBytes));
      if (segmentEnd <= cursor) break;
      const segmentText = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(cursor, segmentEnd));
      const matches = segmentText.match(RESEARCH_TERMS)?.length ?? 0;
      segments.push({ start_byte: cursor, end_byte: segmentEnd, text: segmentText, score: matches + (cursor === 0 ? 2 : 0) });
      cursor = segmentEnd;
    }
  }
  const ranked = segments.sort((a, b) => b.score - a.score || a.start_byte - b.start_byte);
  const chosen = []; let consumed = 0;
  for (const segment of ranked) {
    if (consumed >= maxBytes) break;
    const available = Math.min(maxBytes - consumed, segment.end_byte - segment.start_byte);
    if (available < 1) continue;
    const end = utf8End(bytes, segment.start_byte + available);
    const slice = bytes.subarray(segment.start_byte, end);
    chosen.push({ start_byte: segment.start_byte, end_byte: end, text: new TextDecoder("utf-8", { fatal: true }).decode(slice) });
    consumed += slice.length;
  }
  return chosen.sort((a, b) => a.start_byte - b.start_byte);
}

export function boundedRelevantLinks(links, maximum = 40) {
  return links.map((link, index) => {
    let pathText = ""; try { const url = new URL(link.resolved_destination); pathText = `${url.pathname} ${url.search}`; } catch {}
    const score = (`${link.label} ${pathText}`.match(RESEARCH_TERMS)?.length ?? 0);
    return { link, original_index: index, score };
  }).sort((a, b) => b.score - a.score || a.original_index - b.original_index)
    .slice(0, maximum)
    .map(({ link, original_index }) => ({ index: original_index, label: link.label.slice(0, 300), resolved_destination: link.resolved_destination }));
}

export { TRANSFORMATION as HTML_READABLE_TRANSFORMATION };
import { sha256 } from "./canonical.mjs";
