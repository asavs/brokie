import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { vocabulary } from "../catalog/validate-candidate.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas", "librarian-proposal.v0.2.schema.json"), "utf8"));
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const capabilityIds = new Set(vocabulary.facet_namespaces.capability);
const normalizedUnits = new Set(vocabulary.normalized_units);
const quantityKinds = new Set(["included_usage", "included_resource", "included_capacity"]);
const moneyKinds = new Set(["monetary_credit", "fixed_discount"]);
const costScopeKinds = new Set(["no_cost_access", "included_usage", "monetary_credit", "percentage_discount", "fixed_discount", "waived_fee", "trial_access"]);
const MAX_LISTING_CHARACTERS = 8_000;
const comparatorAliases = new Map([
  ["eq", "exact"], ["=", "exact"], ["lte", "at_most"], ["<=", "at_most"],
  ["gte", "at_least"], [">=", "at_least"], ["lt", "less_than"], ["<", "less_than"],
  ["gt", "more_than"], [">", "more_than"], ["approx", "approximately"],
]);
const magnitudeUnits = new Map([["k", 1_000], ["thousand", 1_000], ["m", 1_000_000], ["million", 1_000_000], ["b", 1_000_000_000], ["billion", 1_000_000_000]]);
const capabilityEvidence = new Map([
  ["agent_infrastructure", [/\bagents?\b/i, /\b(backends?|infrastructure)\b/i]],
  ["agent_tool_integration", [/\bagents?\b/i, /\b(connect|integration|tools?)\b/i]],
  ["ai_observability", [/\b(ai|llm)\b/i, /\b(observability|monitoring|tracing|traces?)\b/i]],
  ["code_generation", [/\b(code generation|generate code|coding assistant)\b/i]],
  ["model_api", [/\bapi\b/i, /\b(model|inference)\b/i]],
  ["research_assistance", [/\bresearch\b/i]],
  ["virtual_machine", [/\b(virtual machine|vm)\b/i]],
]);

function support() {
  return { basis: "inferred", evidence_ids: ["ev_listing"] };
}

function parseJson(content) {
  const trimmed = String(content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("response did not contain a JSON proposal");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function schemaErrors(proposal) {
  if (validateSchema(proposal)) return [];
  return (validateSchema.errors ?? []).map(({ instancePath, message }) => `proposal${instancePath || "/"}: ${message}`);
}

function normalizeComparator(value, location, actions) {
  const normalized = comparatorAliases.get(value) ?? value;
  if (normalized !== value) actions.push(`${location}: normalized ${value} to ${normalized}`);
  return normalized;
}

function normalizeQuantitySourceUnit(entitlement, index, actions) {
  const quantity = entitlement.quantity;
  if (!quantity?.source_unit || !entitlement.cadence) return;
  const sourceUnit = quantity.source_unit.trim().toLowerCase();
  if (sourceUnit !== entitlement.cadence.unit || sourceUnit === quantity.normalized_unit) return;
  quantity.source_unit = quantity.normalized_unit.replaceAll("_", " ");
  actions.push(`offer.entitlements.${index}.quantity.source_unit: replaced cadence unit ${sourceUnit}`);
}

function normalizeEntitlement(entitlement, index, actions) {
  for (const field of ["quantity", "monetary_value", "maximum_value", "percentage_value"]) {
    if (!entitlement[field]) continue;
    const defaultComparator = entitlement[field].value === undefined && field === "quantity" ? "unknown" : "exact";
    entitlement[field].comparator = normalizeComparator(entitlement[field].comparator ?? defaultComparator, `offer.entitlements.${index}.${field}.comparator`, actions);
  }
  if (entitlement.quantity && !normalizedUnits.has(entitlement.quantity.normalized_unit)) {
    actions.push(`offer.entitlements.${index}.quantity.normalized_unit: replaced unknown unit with other`);
    entitlement.quantity.normalized_unit = "other";
  }
  const magnitude = magnitudeUnits.get(entitlement.quantity?.source_unit?.trim().toLowerCase());
  if (magnitude && entitlement.quantity.value !== undefined) {
    entitlement.quantity.value *= magnitude;
    actions.push(`offer.entitlements.${index}.quantity.value: expanded ${entitlement.quantity.source_unit} magnitude`);
  }
  normalizeQuantitySourceUnit(entitlement, index, actions);
}

function normalizeCapabilities(proposal, actions) {
  const proposed = proposal.capability_ids ?? [];
  proposal.capability_ids = proposed.filter((id) => capabilityIds.has(id));
  for (const id of proposed.filter((id) => !capabilityIds.has(id))) actions.push(`capability_ids: removed unknown ${id}`);
}

function normalizeProposal(raw) {
  const proposal = structuredClone(raw), actions = [];
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return { proposal, actions };
  normalizeCapabilities(proposal, actions);
  if (!proposal?.offer || typeof proposal.offer !== "object") return { proposal, actions };
  proposal.offer.boolean_conditions ??= [];
  proposal.offer.audience_conditions ??= [];
  (proposal.offer.entitlements ?? []).forEach((entitlement, index) => normalizeEntitlement(entitlement, index, actions));
  return { proposal, actions };
}

function quantityErrors(quantity, location) {
  if (!quantity) return [];
  const errors = [];
  if (!normalizedUnits.has(quantity.normalized_unit)) errors.push(`${location}: unknown normalized_unit ${quantity.normalized_unit}`);
  const noValue = ["unlimited", "unknown"].includes(quantity.comparator);
  if (noValue && quantity.value !== undefined) errors.push(`${location}: ${quantity.comparator} quantity must omit value`);
  if (!noValue && quantity.value === undefined) errors.push(`${location}: numeric comparator requires value`);
  return errors;
}

function requiredEntitlementErrors(entitlement, location) {
  return [
    [quantityKinds.has(entitlement.kind) && !entitlement.quantity, `${location}: ${entitlement.kind} requires quantity`],
    [moneyKinds.has(entitlement.kind) && !entitlement.monetary_value, `${location}: ${entitlement.kind} requires monetary_value`],
    [entitlement.kind === "percentage_discount" && !entitlement.percentage_value, `${location}: percentage_discount requires percentage_value`],
    [entitlement.kind === "grant" && !entitlement.monetary_value && !entitlement.quantity, `${location}: grant requires monetary_value or quantity`],
  ].filter(([failed]) => failed).map(([, message]) => message);
}

function incompatibleEntitlementErrors(entitlement, location) {
  return [
    [entitlement.kind === "no_cost_access" && (entitlement.quantity || entitlement.cadence), `${location}: no_cost_access cannot carry metered usage`],
    [entitlement.kind !== "percentage_discount" && entitlement.percentage_value, `${location}: percentage_value only belongs to percentage_discount`],
  ].filter(([failed]) => failed).map(([, message]) => message);
}

function entitlementErrors(entitlement, index) {
  const location = `offer.entitlements.${index}`;
  return [
    ...quantityErrors(entitlement.quantity, `${location}.quantity`),
    ...requiredEntitlementErrors(entitlement, location),
    ...incompatibleEntitlementErrors(entitlement, location),
  ];
}

function semanticErrors(proposal) {
  const errors = [];
  if (!proposal.offer) return errors;
  proposal.offer.entitlements.forEach((entitlement, index) => errors.push(...entitlementErrors(entitlement, index)));
  const hasAudience = proposal.offer.audience_conditions.length > 0;
  const needsApplication = proposal.offer.boolean_conditions.some(({ kind, required }) => kind === "application" && required);
  if (proposal.offer.availability === "eligibility_gated" && !hasAudience) errors.push("eligibility_gated offer requires an audience condition");
  if (proposal.offer.availability === "application_required" && !needsApplication) errors.push("application_required offer requires application=true");
  return errors;
}

export function parseAndValidateProposalV02(content) {
  const normalized = normalizeProposal(parseJson(content));
  const { proposal } = normalized;
  const errors = schemaErrors(proposal);
  if (errors.length === 0) errors.push(...semanticErrors(proposal));
  if (errors.length > 0) throw new AggregateError(errors.map((message) => new Error(message)), errors.join(" | "));
  return normalized;
}

function defaultCostScope(entitlement) {
  if (!costScopeKinds.has(entitlement.kind)) return undefined;
  if (entitlement.kind === "included_usage") return "usage";
  return "unknown";
}

function compileEntitlement(entitlement, index) {
  const compiled = {
    key: `ent_${index + 1}`,
    kind: entitlement.kind,
    label: entitlement.label,
    applies_to: [],
    support: support(),
  };
  for (const field of ["duration", "monetary_value", "maximum_value", "percentage_value"]) {
    if (entitlement[field]) compiled[field] = entitlement[field];
  }
  if (entitlement.quantity) compiled.quantity = {
    ...entitlement.quantity,
    source_unit: entitlement.quantity.source_unit ?? entitlement.quantity.normalized_unit.replaceAll("_", " "),
  };
  if (entitlement.cadence) compiled.cadence = { ...entitlement.cadence, alignment: "unknown" };
  const costScope = entitlement.cost_scope ?? defaultCostScope(entitlement);
  if (costScope) compiled.cost_scope = costScope;
  return compiled;
}

function compileConditions(offer) {
  const booleanConditions = offer.boolean_conditions.map((condition, index) => ({
    key: `cond_boolean_${index + 1}`,
    family: "boolean_requirement",
    ...condition,
    target_key: "opportunity",
    support: support(),
  }));
  const audienceConditions = offer.audience_conditions.map((condition, index) => ({
    key: `cond_audience_${index + 1}`,
    family: "audience",
    ...condition,
    target_key: "opportunity",
    support: support(),
  }));
  return [...booleanConditions, ...audienceConditions];
}

function compileOpportunity(proposal) {
  if (!proposal.offer || proposal.capability_ids.length === 0) return null;
  return {
    local_key: "opp_collection_listing",
    variant_label: null,
    plan_label: null,
    availability: { value: proposal.offer.availability, support: support() },
    entitlements: proposal.offer.entitlements.map(compileEntitlement),
    constraints: [],
    conditions: compileConditions(proposal.offer),
    ambiguities: [],
    links: [],
  };
}

function capabilitiesSupportedByListing(capabilities, listing, actions) {
  return capabilities.filter((capability) => {
    const requirements = capabilityEvidence.get(capability) ?? [];
    const supported = requirements.every((pattern) => pattern.test(listing));
    if (!supported) actions.push(`capability_ids: omitted ${capability} because the listing lacks defining evidence`);
    return supported;
  });
}

export function compileProposalV02(proposal, record, observation) {
  const listing = record.scout_material_bundle?.collection?.text;
  if (!listing || !observation.source_text.includes(listing)) throw new Error("simplified Librarian requires an exact Scout collection listing");
  const actions = [];
  const compiledProposal = { ...proposal, capability_ids: capabilitiesSupportedByListing(proposal.capability_ids, listing, actions) };
  const link = record.source_url && listing.includes(record.source_url) ? [{ role: "source", url: record.source_url, support: { basis: "explicit", evidence_ids: ["ev_listing"] } }] : [];
  const opportunity = compileOpportunity(compiledProposal);
  if (proposal.offer && !opportunity) actions.push("offer omitted because no controlled capability was supported");
  return {
    candidate: {
      contract_version: "0.1.0",
      vocabulary_version: vocabulary.version,
      source_snapshot_id: observation.source_snapshot_id,
      observed_at: observation.observed_at,
      evidence_spans: [{ id: "ev_listing", quote: listing }],
      product: {
        source_name: observation.source_name,
        proposed_canonical_name: { text: observation.source_name, support: { basis: "explicit", evidence_ids: ["ev_listing"] } },
        description: proposal.description ? { text: proposal.description, support: support() } : null,
        organization_roles: [],
        links: link,
        facets: compiledProposal.capability_ids.map((concept_id) => ({ namespace: "capability", concept_id, support: support() })),
        claimed_outcomes: [],
      },
      opportunities: opportunity ? [opportunity] : [],
      possible_canonical_matches: [],
    },
    actions,
  };
}

export function requestPayloadV02(record) {
  const listing = record.scout_material_bundle?.collection?.text ?? "";
  return {
    source: { name: record.source_name, url: record.source_url || null },
    listing: listing.slice(0, MAX_LISTING_CHARACTERS),
    listing_truncated: listing.length > MAX_LISTING_CHARACTERS,
    allowed_capability_ids: vocabulary.facet_namespaces.capability,
    allowed_normalized_units: vocabulary.normalized_units,
  };
}
