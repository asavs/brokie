import { createHash } from "node:crypto";
import { assertCandidateDocument } from "./validate-candidate.mjs";

const idPatterns = {
  product_id: /^prod_[a-z0-9_]{4,96}$/,
  product_revision_id: /^pr_[a-z0-9_]{4,96}$/,
  opportunity_id: /^opp_[a-z0-9_]{4,96}$/,
  opportunity_revision_id: /^or_[a-z0-9_]{4,96}$/,
};

function requireId(kind, value) {
  if (!idPatterns[kind].test(value ?? "")) throw new Error(`invalid ${kind}: ${value}`);
  return value;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function moneyMicros(money) {
  if (!money) return null;
  const micros = Math.round(money.amount * 1_000_000);
  if (!Number.isSafeInteger(micros)) throw new Error(`money amount is outside safe range: ${money.amount}`);
  return micros;
}

function conditionProjection(condition) {
  switch (condition.family) {
    case "boolean_requirement":
      return {
        normalizedKind: condition.kind,
        requiredState: Number(condition.required),
        verificationRequired: null,
        otherState: null,
      };
    case "external_credential":
      return {
        normalizedKind: condition.credential_type,
        requiredState: Number(condition.required),
        verificationRequired: null,
        otherState: null,
      };
    case "audience":
      return {
        normalizedKind: "audience",
        requiredState: null,
        verificationRequired:
          condition.verification_required === null
            ? null
            : Number(condition.verification_required),
        otherState: null,
      };
    case "geography":
      return {
        normalizedKind: "geography",
        requiredState: null,
        verificationRequired: null,
        otherState: null,
      };
    case "other":
      return {
        normalizedKind: condition.normalized_key,
        requiredState: null,
        verificationRequired: null,
        otherState: condition.state,
      };
    default:
      throw new Error(`unsupported condition family: ${condition.family}`);
  }
}

export function ingestCandidate(db, wrapper, identityPlan) {
  const candidate = assertCandidateDocument(wrapper);
  const sourceText = wrapper.source_text;
  const createdAt = identityPlan.created_at ?? candidate.observed_at;
  const productId = requireId("product_id", identityPlan.product_id);
  const productRevisionId = requireId(
    "product_revision_id",
    identityPlan.product_revision_id,
  );
  const opportunityPlans = new Map(Object.entries(identityPlan.opportunities ?? {}));
  const candidateOpportunityKeys = new Set(
    candidate.opportunities.map(({ local_key: localKey }) => localKey),
  );
  for (const localKey of candidateOpportunityKeys) {
    if (!opportunityPlans.has(localKey)) throw new Error(`missing identity plan for ${localKey}`);
  }
  for (const localKey of opportunityPlans.keys()) {
    if (!candidateOpportunityKeys.has(localKey)) {
      throw new Error(`identity plan contains unknown opportunity ${localKey}`);
    }
  }

  const source = identityPlan.source ?? {};
  if (!source.identity || !source.locator || !source.kind) {
    throw new Error("identity plan source requires identity, locator, and kind");
  }

  const result = {
    source_snapshot_id: candidate.source_snapshot_id,
    product_id: productId,
    product_revision_id: productRevisionId,
    opportunities: {},
  };

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO source_snapshots (
        source_snapshot_id, source_identity, source_locator, source_kind, source_platform,
        full_text, observed_at, effective_from, effective_to, content_sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      candidate.source_snapshot_id,
      source.identity,
      source.locator,
      source.kind,
      source.platform ?? null,
      sourceText,
      candidate.observed_at,
      source.effective_from ?? null,
      source.effective_to ?? null,
      hash(sourceText),
      createdAt,
    );

    const insertEvidence = db.prepare(`
      INSERT INTO evidence_spans (
        source_snapshot_id, evidence_key, quote, start_offset, end_offset, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const evidence of candidate.evidence_spans) {
      const start = sourceText.indexOf(evidence.quote);
      insertEvidence.run(
        candidate.source_snapshot_id,
        evidence.id,
        evidence.quote,
        start,
        start + evidence.quote.length,
        createdAt,
      );
    }

    db.prepare("INSERT OR IGNORE INTO products (product_id, created_at) VALUES (?, ?)").run(
      productId,
      createdAt,
    );
    if (identityPlan.supersedes_product_revision_id) {
      const prior = db
        .prepare("SELECT product_id FROM product_revisions WHERE product_revision_id = ?")
        .get(identityPlan.supersedes_product_revision_id);
      if (!prior) {
        throw new Error(
          `unknown superseded product revision: ${identityPlan.supersedes_product_revision_id}`,
        );
      }
      if (prior.product_id !== productId) {
        throw new Error(
          `product revision ${productRevisionId} cannot supersede a revision of ${prior.product_id}`,
        );
      }
    }
    const productDocument = canonicalJson(candidate.product);
    db.prepare(`
      INSERT INTO product_revisions (
        product_revision_id, product_id, source_snapshot_id, observed_at,
        supersedes_revision_id, contract_version, vocabulary_version,
        document_json, document_sha256, librarian_run_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      productRevisionId,
      productId,
      candidate.source_snapshot_id,
      candidate.observed_at,
      identityPlan.supersedes_product_revision_id ?? null,
      candidate.contract_version,
      candidate.vocabulary_version,
      productDocument,
      hash(productDocument),
      identityPlan.librarian_run_id ?? null,
      createdAt,
    );

    const insertFacet = db.prepare(`
      INSERT INTO facet_index (product_revision_id, namespace, concept_id, basis)
      VALUES (?, ?, ?, ?)
    `);
    for (const facet of candidate.product.facets) {
      insertFacet.run(productRevisionId, facet.namespace, facet.concept_id, facet.support.basis);
    }

    const insertEntitlement = db.prepare(`
      INSERT INTO entitlement_index (
        opportunity_revision_id, entitlement_key, kind, cost_scope,
        quantity_value, quantity_comparator, quantity_unit,
        cadence_interval, cadence_unit, cadence_alignment,
        duration_value, duration_unit,
        monetary_amount_micros, monetary_currency, monetary_comparator,
        maximum_value_micros, maximum_value_currency, maximum_value_comparator,
        percentage_value, percentage_comparator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertApplicability = db.prepare(`
      INSERT INTO entitlement_applicability_index (
        opportunity_revision_id, entitlement_key, ordinal, target_type, source_label
      ) VALUES (?, ?, ?, ?, ?)
    `);
    const insertConstraint = db.prepare(`
      INSERT INTO constraint_index (
        opportunity_revision_id, constraint_key, kind, other_kind, target_key,
        quantity_value, quantity_comparator, quantity_unit,
        cadence_interval, cadence_unit, cadence_alignment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCondition = db.prepare(`
      INSERT INTO condition_index (
        opportunity_revision_id, condition_key, family, normalized_kind,
        required_state, verification_required, other_state, target_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAudience = db.prepare(`
      INSERT INTO condition_audience_index (opportunity_revision_id, condition_key, audience)
      VALUES (?, ?, ?)
    `);
    const insertRegion = db.prepare(`
      INSERT INTO condition_geography_index (
        opportunity_revision_id, condition_key, mode, region
      ) VALUES (?, ?, ?, ?)
    `);
    const insertSearch = db.prepare(`
      INSERT INTO search_index (
        revision_id, product_name, function_text, outcomes_text, source_text
      ) VALUES (?, ?, ?, ?, ?)
    `);

    for (const opportunity of candidate.opportunities) {
      const plan = opportunityPlans.get(opportunity.local_key);
      const opportunityId = requireId("opportunity_id", plan.opportunity_id);
      const opportunityRevisionId = requireId(
        "opportunity_revision_id",
        plan.opportunity_revision_id,
      );
      db.prepare(`
        INSERT OR IGNORE INTO opportunities (opportunity_id, product_id, created_at)
        VALUES (?, ?, ?)
      `).run(opportunityId, productId, createdAt);
      const storedProduct = db
        .prepare("SELECT product_id FROM opportunities WHERE opportunity_id = ?")
        .get(opportunityId).product_id;
      if (storedProduct !== productId) {
        throw new Error(`opportunity ${opportunityId} belongs to ${storedProduct}, not ${productId}`);
      }
      if (plan.supersedes_revision_id) {
        const prior = db
          .prepare(
            "SELECT opportunity_id FROM opportunity_revisions WHERE opportunity_revision_id = ?",
          )
          .get(plan.supersedes_revision_id);
        if (!prior) {
          throw new Error(`unknown superseded opportunity revision: ${plan.supersedes_revision_id}`);
        }
        if (prior.opportunity_id !== opportunityId) {
          throw new Error(
            `opportunity revision ${opportunityRevisionId} cannot supersede a revision of ${prior.opportunity_id}`,
          );
        }
      }

      const opportunityDocument = canonicalJson(opportunity);
      db.prepare(`
        INSERT INTO opportunity_revisions (
          opportunity_revision_id, opportunity_id, source_snapshot_id, observed_at,
          effective_from, effective_to, supersedes_revision_id, availability,
          contract_version, vocabulary_version, document_json, document_sha256,
          librarian_run_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        opportunityRevisionId,
        opportunityId,
        candidate.source_snapshot_id,
        candidate.observed_at,
        opportunity.effective_period?.from ?? null,
        opportunity.effective_period?.to ?? null,
        plan.supersedes_revision_id ?? null,
        opportunity.availability.value,
        candidate.contract_version,
        candidate.vocabulary_version,
        opportunityDocument,
        hash(opportunityDocument),
        identityPlan.librarian_run_id ?? null,
        createdAt,
      );

      for (const entitlement of opportunity.entitlements) {
        insertEntitlement.run(
          opportunityRevisionId,
          entitlement.key,
          entitlement.kind,
          entitlement.cost_scope ?? null,
          entitlement.quantity?.value ?? null,
          entitlement.quantity?.comparator ?? null,
          entitlement.quantity?.normalized_unit ?? null,
          entitlement.cadence?.interval ?? null,
          entitlement.cadence?.unit ?? null,
          entitlement.cadence?.alignment ?? null,
          entitlement.duration?.value ?? null,
          entitlement.duration?.unit ?? null,
          moneyMicros(entitlement.monetary_value),
          entitlement.monetary_value?.currency ?? null,
          entitlement.monetary_value?.comparator ?? null,
          moneyMicros(entitlement.maximum_value),
          entitlement.maximum_value?.currency ?? null,
          entitlement.maximum_value?.comparator ?? null,
          entitlement.percentage_value?.value ?? null,
          entitlement.percentage_value?.comparator ?? null,
        );
        entitlement.applies_to.forEach((target, ordinal) => {
          insertApplicability.run(
            opportunityRevisionId,
            entitlement.key,
            ordinal,
            target.target_type,
            target.source_label,
          );
        });
      }

      for (const constraint of opportunity.constraints) {
        insertConstraint.run(
          opportunityRevisionId,
          constraint.key,
          constraint.kind,
          constraint.other_kind ?? null,
          constraint.target_key,
          constraint.quantity?.value ?? null,
          constraint.quantity?.comparator ?? null,
          constraint.quantity?.normalized_unit ?? null,
          constraint.cadence?.interval ?? null,
          constraint.cadence?.unit ?? null,
          constraint.cadence?.alignment ?? null,
        );
      }

      for (const condition of opportunity.conditions) {
        const projection = conditionProjection(condition);
        insertCondition.run(
          opportunityRevisionId,
          condition.key,
          condition.family,
          projection.normalizedKind,
          projection.requiredState,
          projection.verificationRequired,
          projection.otherState,
          condition.target_key,
        );
        for (const audience of condition.audiences ?? []) {
          insertAudience.run(opportunityRevisionId, condition.key, audience);
        }
        for (const region of condition.regions ?? []) {
          insertRegion.run(opportunityRevisionId, condition.key, condition.mode, region);
        }
      }

      insertSearch.run(
        opportunityRevisionId,
        candidate.product.proposed_canonical_name?.text ?? candidate.product.source_name,
        candidate.product.description?.text ?? "",
        candidate.product.claimed_outcomes.map(({ text }) => text).join(" "),
        sourceText,
      );
      result.opportunities[opportunity.local_key] = {
        opportunity_id: opportunityId,
        opportunity_revision_id: opportunityRevisionId,
      };
    }

    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
