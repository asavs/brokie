import path from "node:path";
import { contentId } from "./canonical.mjs";

function byteOffset(text, codeUnitOffset) { return Buffer.byteLength(text.slice(0, codeUnitOffset), "utf8"); }

export function inspectMarkdown(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const headings = [], list_items = [];
  const lines = text.matchAll(/^.*(?:\r?\n|$)/gm);
  for (const match of lines) {
    const line = match[0].replace(/\r?\n$/, "");
    if (!line) continue;
    const heading = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    if (heading) headings.push({ level: heading[1].length, text: heading[2], start_byte: byteOffset(text, match.index), end_byte: byteOffset(text, match.index + line.length) });
    const item = /^(\s*)([-+*]|\d+[.)])[ \t]+(.+)$/.exec(line);
    if (item) list_items.push({ nesting: Math.floor(item[1].replaceAll("\t", "    ").length / 2), marker: item[2], text: item[3], start_byte: byteOffset(text, match.index), end_byte: byteOffset(text, match.index + line.length) });
  }
  return { headings, list_items };
}

export function inspectLinks(bytes, { artifactId, baseLocator, sourceDepth }) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const found = [];
  const patterns = [
    { regex: /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, label: 1, destination: 2 },
    { regex: /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, label: 2, destination: 1 },
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern.regex)) {
    const raw = match[pattern.destination];
    let resolved = null;
    try { const target = new URL(raw, baseLocator); if (["http:", "https:"].includes(target.protocol)) resolved = target.href; } catch {}
    const rawIndex = match.index + match[0].indexOf(raw);
    const link = {
      source_artifact_id: artifactId,
      start_byte: byteOffset(text, rawIndex), end_byte: byteOffset(text, rawIndex + raw.length),
      label: String(match[pattern.label]).replace(/<[^>]+>/g, "").trim(), raw_destination: raw,
      resolved_destination: resolved, source_depth: sourceDepth,
    };
    link.link_id = contentId("link", link);
    found.push(link);
  }
  return found.sort((a, b) => a.start_byte - b.start_byte || a.link_id.localeCompare(b.link_id));
}

export function paginate(items, cursor = 0, maximum = 200) {
  if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(maximum) || maximum < 1 || maximum > 200) throw new Error("invalid bounded page");
  return { items: items.slice(cursor, cursor + maximum), next_cursor: cursor + maximum < items.length ? cursor + maximum : null };
}
