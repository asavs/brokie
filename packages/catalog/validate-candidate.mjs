import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(import.meta.dirname, "..", "..");

export const contractSchema = JSON.parse(
  readFileSync(path.join(root, "schemas", "catalog-candidate.schema.json"), "utf8"),
);
export const vocabulary = JSON.parse(
  readFileSync(path.join(root, "schemas", "vocabularies.v0.1.json"), "utf8"),
);

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true });
const validateSchema = ajv.compile(contractSchema);
const reservedKeys = new Set(["product", "opportunity"]);
const vocabularyConcepts = new Map(
  Object.entries(vocabulary.facet_namespaces).map(([namespace, concepts]) => [
    namespace,
    new Set(concepts),
  ]),
);
const normalizedUnits = new Set(vocabulary.normalized_units);
const offerLanguage = /(?:\bfree\b|\bdiscount(?:ed|s)?\b|\bcredits?\b|\btrial\b|[$\u20ac\u00a3]\s*\d|\bper\s+(?:minute|hour|day|week|month|year)\b)/i;
const statedDuration = /(?:\bfor\b|\bduring\b|\bvalid\s+for\b|\bexpires?\s+after\b|\btrial\b).{0,40}\b(?:minute|hour|day|week|month|year)s?\b/i;

export function hasExplicitDurationEvidence(text) {
  return statedDuration.test(String(text ?? ""));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function walk(value, pathParts, visitor) {
  visitor(value, pathParts);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, [...pathParts, index], visitor));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      walk(item, [...pathParts, key], visitor),
    );
  }
}

export function validateCandidateDocument(wrapper) {
  const errors = [];
  if (!wrapper || typeof wrapper !== "object" || Array.isArray(wrapper)) {
    return ["candidate wrapper must be an object"];
  }
  const { candidate, source_text: sourceText } = wrapper;
  if (typeof sourceText !== "string") errors.push("source_text must be a string");
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    errors.push("candidate must be an object");
    return errors;
  }

  if (!validateSchema(candidate)) {
    for (const error of validateSchema.errors ?? []) {
      errors.push(`schema${error.instancePath || "/"}: ${error.message}`);
    }
    return errors;
  }

  if (candidate.contract_version !== contractSchema.properties.contract_version.const) {
    errors.push("contract version does not match the loaded schema");
  }
  if (candidate.vocabulary_version !== vocabulary.version) {
    errors.push("candidate vocabulary version does not match the loaded vocabulary");
  }
  if (Number.isNaN(Date.parse(candidate.observed_at))) {
    errors.push(`invalid observed_at timestamp: ${candidate.observed_at}`);
  }

  const evidenceById = new Map();
  const evidenceQuotes = new Set();
  for (const evidence of candidate.evidence_spans) {
    if (evidenceById.has(evidence.id)) errors.push(`duplicate evidence id: ${evidence.id}`);
    if (evidenceQuotes.has(evidence.quote)) {
      errors.push(`duplicate evidence quote: ${evidence.id}`);
    }
    evidenceById.set(evidence.id, evidence);
    evidenceQuotes.add(evidence.quote);
    if (typeof sourceText === "string" && !sourceText.includes(evidence.quote)) {
      errors.push(`evidence quote is not an exact source substring: ${evidence.id}`);
    }
  }
  const supportQuotes = (support) =>
    (support?.evidence_ids ?? [])
      .map((evidenceId) => evidenceById.get(evidenceId)?.quote ?? "")
      .join(" ");

  for (const supportedText of [
    candidate.product.description,
    ...candidate.product.claimed_outcomes,
  ]) {
    if (supportedText?.text && offerLanguage.test(supportedText.text)) {
      errors.push(`product function/outcome contains offer language: ${supportedText.text}`);
    }
  }
  for (const organizationRole of candidate.product.organization_roles) {
    if (
      organizationRole.support.basis === "explicit" &&
      !supportQuotes(organizationRole.support)
        .toLocaleLowerCase("en-US")
        .includes(organizationRole.organization_name.toLocaleLowerCase("en-US"))
    ) {
      errors.push(
        `explicit organization role lacks named evidence: ${organizationRole.organization_name}`,
      );
    }
  }
  for (const match of candidate.possible_canonical_matches) {
    if (
      match.candidate_name.trim().toLocaleLowerCase("en-US") ===
      candidate.product.source_name.trim().toLocaleLowerCase("en-US")
    ) {
      errors.push(`possible canonical match repeats the source product itself: ${match.candidate_name}`);
    }
  }
  if (
    candidate.opportunities.length > 0 &&
    !candidate.product.facets.some(({ namespace }) => namespace === "capability")
  ) {
    errors.push("candidate with an opportunity must contain at least one capability facet");
  }

  walk(candidate, [], (value, pathParts) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const location = `/${pathParts.join("/")}`;

    if (value.support) {
      for (const evidenceId of value.support.evidence_ids) {
        if (!evidenceById.has(evidenceId)) {
          errors.push(`dangling evidence reference at ${location}: ${evidenceId}`);
        }
      }
    }

    if (typeof value.namespace === "string" && typeof value.concept_id === "string") {
      if (!vocabularyConcepts.get(value.namespace)?.has(value.concept_id)) {
        errors.push(
          `unknown facet concept at ${location}: ${value.namespace}/${value.concept_id}`,
        );
      }
    }

    if (
      typeof value.normalized_unit === "string" &&
      !normalizedUnits.has(value.normalized_unit)
    ) {
      errors.push(`unknown normalized unit at ${location}: ${value.normalized_unit}`);
    }
  });

  const opportunityKeys = new Set();
  for (const opportunity of candidate.opportunities) {
    if (reservedKeys.has(opportunity.local_key)) {
      errors.push(`reserved opportunity key: ${opportunity.local_key}`);
    }
    if (opportunityKeys.has(opportunity.local_key)) {
      errors.push(`duplicate opportunity key: ${opportunity.local_key}`);
    }
    opportunityKeys.add(opportunity.local_key);

    for (const [field, value] of Object.entries(opportunity.effective_period ?? {})) {
      if ((field === "from" || field === "to") && value && Number.isNaN(Date.parse(value))) {
        errors.push(`invalid effective_period.${field} in ${opportunity.local_key}: ${value}`);
      }
    }
    if (
      opportunity.effective_period?.from &&
      opportunity.effective_period?.to &&
      opportunity.effective_period.to <= opportunity.effective_period.from
    ) {
      errors.push(`effective period ends before it starts in ${opportunity.local_key}`);
    }
    if (
      opportunity.effective_period &&
      !opportunity.effective_period.from &&
      !opportunity.effective_period.to
    ) {
      errors.push(`empty effective_period must be omitted in ${opportunity.local_key}`);
    }
    const hasAudienceGate = opportunity.conditions.some(
      ({ family }) => family === "audience",
    );
    const hasApplicationGate = opportunity.conditions.some(
      (condition) =>
        condition.family === "boolean_requirement" &&
        condition.kind === "application" &&
        condition.required,
    );
    if (opportunity.availability.value === "public" && (hasAudienceGate || hasApplicationGate)) {
      errors.push(`public availability conflicts with gated conditions in ${opportunity.local_key}`);
    }
    if (opportunity.availability.value === "eligibility_gated" && !hasAudienceGate) {
      errors.push(`eligibility_gated availability lacks an audience condition in ${opportunity.local_key}`);
    }
    if (opportunity.availability.value === "application_required" && !hasApplicationGate) {
      errors.push(`application_required availability lacks an application condition in ${opportunity.local_key}`);
    }

    const keyedRecords = [
      ...opportunity.entitlements,
      ...opportunity.constraints,
      ...opportunity.conditions,
      ...opportunity.ambiguities,
    ];
    const localKeys = new Set();
    for (const record of keyedRecords) {
      if (reservedKeys.has(record.key)) {
        errors.push(`reserved local record key in ${opportunity.local_key}: ${record.key}`);
      }
      if (localKeys.has(record.key)) {
        errors.push(`duplicate local record key in ${opportunity.local_key}: ${record.key}`);
      }
      localKeys.add(record.key);
    }

    const entitlementKeys = new Set(opportunity.entitlements.map(({ key }) => key));
    for (const entitlement of opportunity.entitlements) {
      if (
        entitlement.kind === "no_cost_access" &&
        (entitlement.quantity || entitlement.cadence)
      ) {
        errors.push(
          `no_cost_access carries metered usage in ${opportunity.local_key}/${entitlement.key}; use included_usage`,
        );
      }
      if (entitlement.duration) {
        const durationEvidence = supportQuotes(entitlement.support);
        if (!hasExplicitDurationEvidence(durationEvidence)) {
          errors.push(
            `duration is not explicitly evidenced in ${opportunity.local_key}/${entitlement.key}`,
          );
        }
      }
    }
    for (const constraint of opportunity.constraints) {
      if (
        constraint.target_key !== "opportunity" &&
        !entitlementKeys.has(constraint.target_key)
      ) {
        errors.push(
          `invalid constraint target in ${opportunity.local_key}: ${constraint.target_key}`,
        );
      }
    }
    for (const condition of opportunity.conditions) {
      if (
        condition.target_key !== "opportunity" &&
        !entitlementKeys.has(condition.target_key)
      ) {
        errors.push(
          `invalid condition target in ${opportunity.local_key}: ${condition.target_key}`,
        );
      }
    }
    for (const ambiguity of opportunity.ambiguities) {
      if (
        ambiguity.target_key !== "product" &&
        ambiguity.target_key !== "opportunity" &&
        !localKeys.has(ambiguity.target_key)
      ) {
        errors.push(
          `invalid ambiguity target in ${opportunity.local_key}: ${ambiguity.target_key}`,
        );
      }
    }

    const economicFingerprints = new Map();
    for (const entitlement of opportunity.entitlements) {
      const monetaryClaim = entitlement.monetary_value ?? entitlement.maximum_value;
      const normalizedApplicability = entitlement.applies_to
        .map(({ source_label: sourceLabel, target_type: targetType }) => ({
          source_label: sourceLabel.trim().toLocaleLowerCase("en-US"),
          target_type: targetType,
        }))
        .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
      const fingerprint = stableJson(
        monetaryClaim
          ? {
              economic_family: "money",
              amount: monetaryClaim.amount,
              currency: monetaryClaim.currency,
              cost_scope: entitlement.cost_scope ?? null,
              applies_to: normalizedApplicability,
            }
          : {
              kind: entitlement.kind,
              label: entitlement.label.trim().toLocaleLowerCase("en-US"),
              quantity: entitlement.quantity ?? null,
              cadence: entitlement.cadence ?? null,
              duration: entitlement.duration ?? null,
              percentage_value: entitlement.percentage_value ?? null,
              cost_scope: entitlement.cost_scope ?? null,
              applies_to: normalizedApplicability,
            },
      );
      const previousKey = economicFingerprints.get(fingerprint);
      const prior = previousKey
        ? opportunity.entitlements.find(({ key }) => key === previousKey)
        : null;
      const sharesEvidence = prior?.support.evidence_ids.some((evidenceId) =>
        entitlement.support.evidence_ids.includes(evidenceId),
      );
      if (previousKey && sharesEvidence) {
        errors.push(
          `duplicate economics in ${opportunity.local_key}: ${previousKey} and ${entitlement.key}`,
        );
      }
      economicFingerprints.set(fingerprint, entitlement.key);
    }
  }

  walk(candidate, [], (value, pathParts) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof value.url === "string" &&
      value.support?.basis === "explicit" &&
      !supportQuotes(value.support).includes(value.url)
    ) {
      errors.push(`explicit link lacks URL evidence at /${pathParts.join("/")}: ${value.url}`);
    }
  });

  return errors;
}

export function assertCandidateDocument(wrapper) {
  const errors = validateCandidateDocument(wrapper);
  if (errors.length > 0) {
    throw new AggregateError(
      errors.map((message) => new Error(message)),
      `catalog candidate failed ${errors.length} contract check(s)`,
    );
  }
  return wrapper.candidate;
}
