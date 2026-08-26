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

function readableText(rawText, mediaType) {
  return mediaType === "text/html" ? htmlToText(rawText) : rawText.replace(/\r\n/g, "\n").trim();
}

function ensureDistinctRepresentation(bytes, rawBytes, mediaType) {
  if (mediaType !== "text/html") return bytes;
  return bytes.equals(Buffer.from(rawBytes)) ? Buffer.concat([bytes, Buffer.from("\n")]) : bytes;
}

function contentReasons(rawBytes, bytes, rawText, text, mediaType) {
  if (mediaType !== "text/html") return [];
  const reasons = [];
  if (/enable javascript|javascript (?:is )?required|please turn on javascript/i.test(`${rawText}\n${text}`)) reasons.push("browser_required");
  if (rawBytes.length > 20_000 && bytes.length < 500) reasons.push("readable_content_sparse");
  return reasons;
}

function existingReadableArtifact(artifactStore, artifactId) {
  try {
    const existing = artifactStore.read(artifactId).manifest;
    if (!["derived_text", "readable_text"].includes(existing.kind)) throw new Error("readable artifact identity collides with a non-readable representation");
    if (existing.media_type !== "text/plain") throw new Error("readable artifact identity collides with a non-readable representation");
    return { ...existing, storage_status: "reused" };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

export function createReadableArtifact(rawBytes, mediaType, artifactStore) {
  const rawText = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  const text = readableText(rawText, mediaType);
  const bytes = ensureDistinctRepresentation(Buffer.from(text, "utf8"), rawBytes, mediaType);
  const incompleteReasons = contentReasons(rawBytes, bytes, rawText, text, mediaType);
  const common = { bytes, incomplete: incompleteReasons.length > 0, incompleteReasons };
  if (bytes.equals(Buffer.from(rawBytes))) {
    const artifact = artifactStore.read(`art_sha256_${sha256(rawBytes)}`).manifest;
    return { artifact, ...common, transformation: null };
  }
  const transformation = mediaType === "text/html" ? TRANSFORMATION : "utf8-readable-text@0.2.0";
  const artifactId = `art_sha256_${sha256(bytes)}`;
  const existing = existingReadableArtifact(artifactStore, artifactId);
  const artifact = existing ?? artifactStore.put(bytes, { kind: "readable_text", media_type: "text/plain" });
  return { artifact, ...common, transformation };
}

function utf8End(bytes, proposed) {
  let end = Math.min(proposed, bytes.length);
  while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return end;
}

function validateBounds(maxBytes, segmentBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("invalid readable bounds");
  if (!Number.isInteger(segmentBytes) || segmentBytes < 1) throw new Error("invalid readable bounds");
}

function candidateSegments(bytes, text, segmentBytes) {
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
  return segments;
}

function chooseSegments(bytes, candidates, maxBytes) {
  const ranked = candidates.sort((a, b) => b.score - a.score || a.start_byte - b.start_byte);
  const chosen = [];
  let consumed = 0;
  for (const segment of ranked) {
    if (consumed >= maxBytes) break;
    const available = Math.min(maxBytes - consumed, segment.end_byte - segment.start_byte);
    if (available < 1) continue;
    const end = utf8End(bytes, segment.start_byte + available);
    const slice = bytes.subarray(segment.start_byte, end);
    chosen.push({ start_byte: segment.start_byte, end_byte: end, text: new TextDecoder("utf-8", { fatal: true }).decode(slice) });
    consumed += slice.length;
  }
  return chosen;
}

export function boundedReadableSegments(bytes, options = {}) {
  const maxBytes = options.maxBytes ?? 24_000;
  const segmentBytes = options.segmentBytes ?? 2_000;
  validateBounds(maxBytes, segmentBytes);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const chosen = chooseSegments(bytes, candidateSegments(bytes, text, segmentBytes), maxBytes);
  return chosen.sort((a, b) => a.start_byte - b.start_byte);
}

export function boundedRelevantLinks(links, maximum = 40) {
  return links.map((link, index) => {
    let pathText = ""; try { const url = new URL(link.resolved_destination); pathText = `${url.pathname} ${url.search}`; } catch {}
    const score = (`${link.label} ${pathText}`.match(RESEARCH_TERMS)?.length ?? 0);
    return { link, original_index: index, score };
  }).sort((a, b) => b.score - a.score || a.original_index - b.original_index)
    .slice(0, maximum)
    .map(({ link, original_index }) => ({
      index: original_index,
      label: link.label.slice(0, 300),
      resolved_destination: link.resolved_destination,
      link,
    }));
}

export { TRANSFORMATION as HTML_READABLE_TRANSFORMATION };
import { sha256 } from "./canonical.mjs";
