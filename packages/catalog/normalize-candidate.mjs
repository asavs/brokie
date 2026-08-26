import { hasExplicitDurationEvidence, vocabulary } from "./validate-candidate.mjs";

const vocabularyConcepts = new Map(Object.entries(vocabulary.facet_namespaces).map(([namespace, concepts]) => [namespace, new Set(concepts)]));

function evidenceForText(evidenceSpans, text) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return null;
  return evidenceSpans.find(
    ({ quote }) => quote.includes(normalized) || normalized.includes(quote),
  )?.id;
}

export function recoverExactEvidenceQuote(sourceText, quote) {
  if (typeof sourceText !== "string" || typeof quote !== "string" || !quote.trim()) return null;
  if (sourceText.includes(quote)) return quote;
  let normalized = "", starts = [], ends = [], inWhitespace = false;
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (/\s/.test(character)) {
      if (!inWhitespace && normalized.length) { normalized += " "; starts.push(index); ends.push(index + 1); }
      else if (inWhitespace && ends.length) ends[ends.length - 1] = index + 1;
      inWhitespace = true;
    } else { normalized += character; starts.push(index); ends.push(index + 1); inWhitespace = false; }
  }
  const wanted = quote.replace(/\s+/g, " ").trim(), match = normalized.indexOf(wanted);
  if (match >= 0 && normalized.indexOf(wanted, match + 1) < 0) return sourceText.slice(starts[match], ends[match + wanted.length - 1]);
  const exactParts = quote.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length >= 20 && sourceText.includes(part)).sort((a, b) => b.length - a.length || a.localeCompare(b));
  return exactParts[0] ?? null;
}

function supportedText(value, evidenceSpans, path, actions) {
  if (typeof value !== "string") return value;
  const evidenceId = evidenceForText(evidenceSpans, value);
  if (!evidenceId) {
    actions.push(`${path}: unsupported string replaced with null`);
    return null;
  }
  actions.push(`${path}: wrapped exact source text in a support envelope`);
  return {
    text: value,
    support: { basis: "explicit", evidence_ids: [evidenceId] },
  };
}

const offerLanguage = /(?:\bfree\b|\bdiscount(?:ed|s)?\b|\bcredits?\b|\btrial\b|[$\u20ac\u00a3]\s*\d|\bper\s+(?:minute|hour|day|week|month|year)\b)/i;
const explicitPublicAccess = /(?:\bpublic(?:ly)?\b|\banyone\b|\bopen\s+to\s+all\b|\bno\s+(?:application|approval|eligibility)\b)/i;
const explicitCalendarAlignment = /(?:\bcalendar\b|\bcalendar\s+(?:month|year)\b|\bresets?\s+(?:on|at)\b)/i;
const explicitRollingAlignment = /(?:\brolling\b|\bevery\s+\d+(?:\.\d+)?\s+(?:minute|hour|day|week|month|year)s?\b)/i;

function functionOnlyDescription(description, actions) {
  if (!description?.text || !offerLanguage.test(description.text)) return description;
  let text = description.text.replace(/^free\s+/i, "").trim();
  const allowanceClause = /\s+(?:with|including|includes)\s+(?=[^.!]*(?:\d[\d,.]*\s+\w+\s+per\s+(?:minute|hour|day|week|month|year)|credits?|discount|trial|free\b))/i;
  const clauseStart = text.search(allowanceClause);
  if (clauseStart >= 0) text = text.slice(0, clauseStart).trim();
  if (text && !/[.!?]$/.test(text)) text += ".";
  if (!text || offerLanguage.test(text)) return description;
  text = text[0].toLocaleUpperCase("en-US") + text.slice(1);
  actions.push("product.description: removed a deterministic offer clause from function text");
  return {
    text,
    support: { ...description.support, basis: "inferred" },
  };
}

export function normalizeCandidateShape(input, sourceText = "", options = {}) {
  const candidate = structuredClone(input);
  const actions = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { candidate, actions };
  }
  const evidenceSpans = Array.isArray(candidate.evidence_spans)
    ? candidate.evidence_spans
    : [];
  for (const evidence of evidenceSpans) {
    if (!sourceText || sourceText.includes(evidence.quote)) continue;
    const recovered = recoverExactEvidenceQuote(sourceText, evidence.quote);
    if (recovered) { evidence.quote = recovered; actions.push(`${evidence.id}: restored an exact source quote`); }
  }
  const evidenceById = new Map(evidenceSpans.map((evidence) => [evidence.id, evidence]));
  const supportText = (support) =>
    (support?.evidence_ids ?? [])
      .map((evidenceId) => evidenceById.get(evidenceId)?.quote ?? "")
      .join(" ");

  if (candidate.product && typeof candidate.product === "object") {
    if (options.removeUnknownFacets && Array.isArray(candidate.product.facets)) candidate.product.facets = candidate.product.facets.filter((facet, index) => {
      if (vocabularyConcepts.get(facet.namespace)?.has(facet.concept_id)) return true;
      actions.push(`product.facets.${index}: removed unknown controlled-vocabulary concept`); return false;
    });
    candidate.product.proposed_canonical_name = supportedText(
      candidate.product.proposed_canonical_name,
      evidenceSpans,
      "product.proposed_canonical_name",
      actions,
    );
    candidate.product.description = supportedText(
      candidate.product.description,
      evidenceSpans,
      "product.description",
      actions,
    );
    candidate.product.description = functionOnlyDescription(
      candidate.product.description,
      actions,
    );
    if (Array.isArray(candidate.product.claimed_outcomes)) {
      candidate.product.claimed_outcomes = candidate.product.claimed_outcomes
        .map((value, index) =>
          supportedText(value, evidenceSpans, `product.claimed_outcomes.${index}`, actions),
        )
        .filter((value) => {
          if (!value) return false;
          if (offerLanguage.test(value.text)) {
            actions.push("product.claimed_outcomes: removed offer language from outcomes");
            return false;
          }
          return true;
        });
    }
    if (Array.isArray(candidate.product.links)) candidate.product.links = candidate.product.links.filter((link, index) => {
      if (supportText(link.support).includes(link.url)) return true;
      actions.push(`product.links.${index}: removed link without URL evidence`); return false;
    });
  }

  for (const [opportunityIndex, opportunity] of (candidate.opportunities ?? []).entries()) {
    if (Array.isArray(opportunity.links)) opportunity.links = opportunity.links.filter((link, linkIndex) => {
      if (supportText(link.support).includes(link.url)) return true;
      actions.push(`opportunities.${opportunityIndex}.links.${linkIndex}: removed link without URL evidence`); return false;
    });
    opportunity.variant_label = supportedText(
      opportunity.variant_label,
      evidenceSpans,
      `opportunities.${opportunityIndex}.variant_label`,
      actions,
    );
    opportunity.plan_label = supportedText(
      opportunity.plan_label,
      evidenceSpans,
      `opportunities.${opportunityIndex}.plan_label`,
      actions,
    );
    if (
      opportunity.availability?.value === "public" &&
      opportunity.availability.support?.basis === "explicit" &&
      !explicitPublicAccess.test(supportText(opportunity.availability.support))
    ) {
      opportunity.availability.support.basis = "inferred";
      actions.push(
        `opportunities.${opportunityIndex}.availability: downgraded public access to inferred`,
      );
    }
    if (
      opportunity.effective_period === null ||
      (opportunity.effective_period &&
        !opportunity.effective_period.from &&
        !opportunity.effective_period.to)
    ) {
      delete opportunity.effective_period;
      actions.push(`opportunities.${opportunityIndex}.effective_period: removed empty period`);
    }
    for (const [entitlementIndex, entitlement] of (opportunity.entitlements ?? []).entries()) {
      for (const field of [
        "quantity",
        "cadence",
        "duration",
        "monetary_value",
        "maximum_value",
        "percentage_value",
        "cost_scope",
      ]) {
        if (entitlement[field] === null) {
          delete entitlement[field];
          actions.push(
            `opportunities.${opportunityIndex}.entitlements.${entitlementIndex}.${field}: removed null optional field`,
          );
        }
        if (
          entitlement[field] &&
          typeof entitlement[field] === "object" &&
          !Array.isArray(entitlement[field]) &&
          Object.values(entitlement[field]).every(
            (value) => value === null || value === "",
          )
        ) {
          delete entitlement[field];
          actions.push(
            `opportunities.${opportunityIndex}.entitlements.${entitlementIndex}.${field}: removed empty optional object`,
          );
        }
      }
      if (
        entitlement.duration &&
        !hasExplicitDurationEvidence(supportText(entitlement.support))
      ) {
        delete entitlement.duration;
        actions.push(
          `opportunities.${opportunityIndex}.entitlements.${entitlementIndex}.duration: removed without explicit duration evidence`,
        );
      }
      if (
        entitlement.cadence?.alignment === "calendar" &&
        !explicitCalendarAlignment.test(supportText(entitlement.support))
      ) {
        entitlement.cadence.alignment = "unknown";
        actions.push(
          `opportunities.${opportunityIndex}.entitlements.${entitlementIndex}.cadence.alignment: replaced unsupported calendar alignment with unknown`,
        );
      }
      if (
        entitlement.cadence?.alignment === "rolling" &&
        !explicitRollingAlignment.test(supportText(entitlement.support))
      ) {
        entitlement.cadence.alignment = "unknown";
        actions.push(
          `opportunities.${opportunityIndex}.entitlements.${entitlementIndex}.cadence.alignment: replaced unsupported rolling alignment with unknown`,
        );
      }
      if (entitlement.kind !== "percentage_discount" && entitlement.percentage_value) {
        delete entitlement.percentage_value;
        actions.push(
          `opportunities.${opportunityIndex}.entitlements.${entitlementIndex}.percentage_value: removed from non-percentage entitlement`,
        );
      }
      for (const field of ["monetary_value", "maximum_value"]) {
        if (
          entitlement[field]?.amount === 0 &&
          !["monetary_credit", "fixed_discount", "grant"].includes(entitlement.kind)
        ) {
          delete entitlement[field];
          actions.push(
            `opportunities.${opportunityIndex}.entitlements.${entitlementIndex}.${field}: removed zero placeholder`,
          );
        }
      }
    }
  }
  if (options.dropOpportunitiesWithoutCapability && (candidate.opportunities ?? []).length && !(candidate.product?.facets ?? []).some(({ namespace }) => namespace === "capability")) {
    candidate.opportunities = [];
    actions.push("opportunities: removed because no controlled capability facet survived");
  }
  return { candidate, actions };
}
