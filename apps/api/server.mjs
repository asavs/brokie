import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  catalogKind,
  getPublishedEvidence,
  getPublishedOpportunity,
  listPublishedCapabilities,
  searchPublishedOpportunities,
  typedCatalogHealth,
} from "../../packages/catalog/query.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const typedCatalog = path.resolve(here, "..", "..", "var", "v0.1", "catalog-v0.1.sqlite");
const legacyCatalog = path.resolve(here, "..", "..", "packages", "librarian", "generated", "brokie-v0.0.1.sqlite");
const defaultCatalog = fs.existsSync(typedCatalog) ? typedCatalog : legacyCatalog;
const defaultState = path.resolve(
  here,
  "..",
  "..",
  "var",
  fs.existsSync(typedCatalog) ? "v0.1" : "",
  "brokie-state.sqlite",
);
const webPath = path.resolve(here, "..", "web", "index.html");
const openApiPath = path.resolve(here, "openapi.v1.json");

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function parseLimit(value) {
  const parsed = Number(value ?? 25);
  return Number.isInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 25;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function boundedLimit(value) {
  if (value === null) return 25;
  if (!/^\d+$/.test(value)) throw badRequest("limit must be an integer from 1 to 100");
  const parsed = Number(value);
  if (parsed < 1 || parsed > 100) throw badRequest("limit must be an integer from 1 to 100");
  return parsed;
}

function boundedQuery(params) {
  const allowed = new Set(["q", "capability", "need", "limit"]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw badRequest(`unknown query parameter: ${key}`);
  }
  if (params.getAll("q").length > 1 || params.getAll("limit").length > 1) {
    throw badRequest("q and limit may only be supplied once");
  }
  const query = (params.get("q") || "").trim();
  if (query.length > 512) throw badRequest("q must not exceed 512 characters");
  const capabilities = [...params.getAll("capability"), ...params.getAll("need")]
    .map((value) => value.trim())
    .filter(Boolean);
  if (capabilities.length > 8) throw badRequest("at most 8 capabilities may be supplied");
  if (capabilities.some((value) => value.length > 128)) {
    throw badRequest("capability values must not exceed 128 characters");
  }
  return { query, capabilities, limit: boundedLimit(params.get("limit")) };
}

function decodedSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw badRequest("path contains invalid percent encoding");
  }
}

function opportunityDetails(db, row) {
  const capabilities = db.prepare(`SELECT c.capability_id AS id, c.label, pc.confidence, pc.evidence
    FROM product_capabilities pc JOIN capabilities c USING(capability_id)
    WHERE pc.product_id = ? AND pc.source_id = ? ORDER BY c.label`).all(row.product_id, row.source_id);
  const needs = db.prepare(`SELECT n.user_need_id AS id, n.label, pn.confidence, pn.evidence
    FROM product_user_needs pn JOIN user_needs n USING(user_need_id)
    WHERE pn.product_id = ? AND pn.source_id = ? ORDER BY n.label`).all(row.product_id, row.source_id);
  const requirements = db.prepare(`SELECT field, value_json, derivation, confidence, evidence
    FROM requirements WHERE opportunity_id = ? ORDER BY field`).all(row.opportunity_id).map((item) => ({ ...item, value: JSON.parse(item.value_json), value_json: undefined }));
  return { ...row, capabilities, user_needs: needs, requirements };
}

function search(db, params) {
  const clauses = [];
  const bindings = [];
  const terms = (params.get("q") || "").trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  for (const term of terms) {
    clauses.push(`(lower(sr.source_name || ' ' || sr.source_description || ' ' || sr.source_offer_detail || ' ' || sr.source_eligibility) LIKE ?
      OR EXISTS (SELECT 1 FROM product_user_needs pn JOIN user_needs n USING(user_need_id) WHERE pn.product_id=o.product_id AND pn.source_id=o.source_id AND lower(n.user_need_id || ' ' || n.label) LIKE ?)
      OR EXISTS (SELECT 1 FROM product_capabilities pc JOIN capabilities c USING(capability_id) WHERE pc.product_id=o.product_id AND pc.source_id=o.source_id AND lower(c.capability_id || ' ' || c.label) LIKE ?))`);
    bindings.push(`%${term}%`, `%${term}%`, `%${term}%`);
  }
  if (params.get("need")) {
    clauses.push(`EXISTS (SELECT 1 FROM product_user_needs pn WHERE pn.product_id=o.product_id AND pn.source_id=o.source_id AND pn.user_need_id=?)`);
    bindings.push(params.get("need"));
  }
  if (params.get("capability")) {
    clauses.push(`EXISTS (SELECT 1 FROM product_capabilities pc WHERE pc.product_id=o.product_id AND pc.source_id=o.source_id AND pc.capability_id=?)`);
    bindings.push(params.get("capability"));
  }
  if (params.get("source")) {
    clauses.push("sr.source_kind = ?");
    bindings.push(params.get("source"));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = parseLimit(params.get("limit"));
  const rows = db.prepare(`SELECT o.opportunity_id, o.product_id, o.source_id, o.name, o.opportunity_type,
      o.benefit_text, o.eligibility_text, o.estimated_value_usd, o.status,
      sr.source_kind, sr.source_locator, sr.source_category, sr.source_url, sr.source_description,
      sr.raw_text, sr.selection_score
    FROM opportunities o JOIN source_records sr USING(source_id)
    ${where} ORDER BY sr.selection_score DESC, lower(o.name) LIMIT ?`).all(...bindings, limit);
  return rows.map((row) => opportunityDetails(db, row));
}

export function createApi({ catalogPath = defaultCatalog, statePath = defaultState } = {}) {
  if (!fs.existsSync(catalogPath)) throw new Error(`Catalog database not found: ${catalogPath}`);
  const catalog = new DatabaseSync(catalogPath, { readOnly: true, timeout: 5_000 });
  const kind = catalogKind(catalog);
  if (kind === "unknown") {
    catalog.close();
    throw new Error(`Unsupported catalog schema: ${catalogPath}`);
  }
  const server = http.createServer((request, response) => {
    try {
      if ((request.url || "").length > 4_096) {
        return json(response, 414, { error: "uri_too_long" });
      }
      const url = new URL(request.url, "http://localhost");
      if (request.method !== "GET") return json(response, 405, { error: "read_only_api" });
      if (url.pathname === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return response.end(fs.readFileSync(webPath));
      }
      if (url.pathname === "/openapi.json") {
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=300",
          "x-content-type-options": "nosniff",
        });
        return response.end(fs.readFileSync(openApiPath));
      }
      if (url.pathname === "/health") {
        const metadata =
          kind === "typed-v0.1"
            ? typedCatalogHealth(catalog)
            : Object.fromEntries(
                catalog.prepare("SELECT key, value FROM metadata").all().map((row) => [row.key, row.value]),
              );
        return json(response, 200, { status: "ok", catalog: metadata });
      }
      if (url.pathname === "/v1/coverage" && kind === "typed-v0.1") {
        return json(response, 200, { data: typedCatalogHealth(catalog).coverage });
      }
      if (url.pathname === "/v1/needs") {
        const data =
          kind === "typed-v0.1"
            ? []
            : catalog.prepare("SELECT user_need_id AS id, label FROM user_needs ORDER BY label").all();
        return json(response, 200, { data });
      }
      if (url.pathname === "/v1/capabilities") {
        const data =
          kind === "typed-v0.1"
            ? listPublishedCapabilities(catalog)
            : catalog.prepare("SELECT capability_id AS id, label FROM capabilities ORDER BY label").all();
        return json(response, 200, { data });
      }
      if (url.pathname === "/v1/opportunities") {
        const data =
          kind === "typed-v0.1"
            ? searchPublishedOpportunities(catalog, boundedQuery(url.searchParams))
            : search(catalog, url.searchParams);
        return json(response, 200, { data, count: data.length });
      }
      const match = url.pathname.match(/^\/v1\/opportunities\/([^/]+)$/);
      if (match) {
        const opportunityId = decodedSegment(match[1]);
        const row =
          kind === "typed-v0.1"
            ? getPublishedOpportunity(catalog, opportunityId)
            : catalog.prepare(`SELECT o.*, sr.source_kind, sr.source_locator, sr.source_category, sr.source_url,
                sr.source_description, sr.raw_text, sr.selection_score FROM opportunities o JOIN source_records sr USING(source_id)
                WHERE o.opportunity_id = ?`).get(opportunityId);
        const data = row && kind === "typed-v0.1" ? row : row ? opportunityDetails(catalog, row) : null;
        return data ? json(response, 200, { data }) : json(response, 404, { error: "not_found" });
      }
      const evidenceMatch = url.pathname.match(/^\/v1\/evidence\/([^/]+)\/([^/]+)$/);
      if (evidenceMatch && kind === "typed-v0.1") {
        const data = getPublishedEvidence(
          catalog,
          decodedSegment(evidenceMatch[1]),
          decodedSegment(evidenceMatch[2]),
        );
        return data ? json(response, 200, { data }) : json(response, 404, { error: "not_found" });
      }
      if (url.pathname === "/v1/reviews") {
        if (!fs.existsSync(statePath)) return json(response, 200, { data: [], count: 0 });
        const state = new DatabaseSync(statePath, { readOnly: true });
        try {
          const stateTables = new Set(
            state.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(({ name }) => name),
          );
          const requestedStatus = url.searchParams.get("status") || "open";
          let rows = [];
          if (kind === "typed-v0.1" && stateTables.has("revision_review_queue")) {
            const allowed = new Set(["status", "limit"]);
            for (const key of url.searchParams.keys()) {
              if (!allowed.has(key)) throw badRequest(`unknown query parameter: ${key}`);
            }
            if (!["open", "processed"].includes(requestedStatus)) {
              throw badRequest("status must be open or processed");
            }
            rows = state
              .prepare("SELECT * FROM revision_review_queue WHERE status = ? ORDER BY created_at, review_id LIMIT ?")
              .all(requestedStatus, boundedLimit(url.searchParams.get("limit")))
              .map((row) => ({
                ...row,
                opportunity_revision_ids: JSON.parse(row.opportunity_revision_ids_json),
                opportunity_revision_ids_json: undefined,
              }));
          } else if (stateTables.has("review_queue")) {
            rows = state
              .prepare("SELECT * FROM review_queue WHERE status = ? ORDER BY created_at, review_id LIMIT ?")
              .all(requestedStatus, parseLimit(url.searchParams.get("limit")))
              .map((row) => ({
                ...row,
                payload: JSON.parse(row.payload_json),
                payload_json: undefined,
              }));
          }
          return json(response, 200, { data: rows, count: rows.length });
        } finally { state.close(); }
      }
      return json(response, 404, { error: "not_found" });
    } catch (error) {
      return json(response, error.statusCode || 500, {
        error: error.statusCode === 400 ? "invalid_request" : "internal_error",
        message: error.message,
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  server.maxRequestsPerSocket = 100;
  server.on("close", () => catalog.close());
  return server;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => { const [key, ...value] = arg.slice(2).split("="); return [key, value.join("=")]; }));
  const host = args.host || "127.0.0.1";
  const port = Number(args.port || 8787);
  const server = createApi({ catalogPath: args.catalog ? path.resolve(args.catalog) : defaultCatalog, statePath: args.state ? path.resolve(args.state) : defaultState });
  server.listen(port, host, () => console.log(JSON.stringify({ status: "listening", host, port })));
}
