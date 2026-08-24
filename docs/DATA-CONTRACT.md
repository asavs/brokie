# Brokie data contract

Status: **v0.1 draft**
Contract version: `0.1.0`
Last updated: 2026-08-24

This document is normative. `MUST`, `MUST NOT`, `SHOULD`, and `MAY` have their usual requirements-language meanings.

## Purpose

Brokie answers: **“I want to do something; how can I spend less?”**

The contract therefore keeps four concerns separate:

1. what a product does;
2. what an opportunity grants or discounts;
3. what constrains or conditions that opportunity;
4. what evidence supports each claim.

Descriptions, tags, and card badges are projections of these records. They are not substitutes for structured facts.

## Design principles

- **Thin prompt, thick harness.** A librarian proposes one coherent typed document. The harness owns identifiers, validation, vocabulary checks, completeness checks, revision history, research routing, indexing, and publication.
- **Observed facts are temporal.** A reviewed claim can still become obsolete. Catalog revisions are immutable observations.
- **Evidence precedes trust.** Every semantic claim MUST cite one or more evidence spans.
- **Missing is not false.** The harness derives ordinary missing fields. The librarian emits only meaningful ambiguity, contradiction, or suspected staleness.
- **Free has a scope.** No-cost software, no platform fee, included provider usage, and free infrastructure are different claims.
- **Products and savings are distinct.** A product can be cataloged without having a publishable money-saving opportunity.
- **Collections are projections.** A product can remain globally cataloged while being absent from an inference/GPU view.
- **Source prose is preserved.** Normalization never deletes the original source snapshot or evidence.

## Durable records

### SourceSnapshot

An immutable observation of supplied source content.

Required properties:

- stable source identity and locator;
- full supplied text;
- source kind and platform;
- `observed_at` timestamp;
- content hash;
- optional source-stated effective dates.

Every refresh observation creates a new snapshot, even when its content hash is unchanged. This lets a successful recheck refresh provenance without overwriting history.

### EvidenceSpan

A short exact excerpt from one source snapshot. Evidence keys are local to that snapshot; durable identity is the pair `(source_snapshot_id, evidence_key)`. The harness MUST verify that every excerpt occurs in its referenced snapshot. Models are not required to calculate character offsets.

### Organization

An optional canonical organization identity. Organization mentions attach through typed roles rather than a mandatory provider hierarchy.

Initial roles:

- `owner`
- `operator`
- `issuer`
- `sponsor`
- `distributor`
- `verifier`

For example, Google may operate a product while bags.fm distributes an offer. One organization MUST NOT be inferred to fill every role. In v0.1, supported role/name objects remain in immutable revision JSON; a canonical organization table is deferred until entity resolution supplies a real invariant.

### Product and ProductRevision

`Product` is stable identity. `ProductRevision` is an immutable observed description of that identity.

A product revision may contain:

- canonical and source-stated names;
- function-only description;
- role-typed organizations;
- role-typed links;
- controlled facets;
- source-attributed claimed outcomes.

Product descriptions MUST explain function. They MUST NOT contain offer quantities, discount qualifications, or requirements.

### Opportunity and OpportunityRevision

`Opportunity` is stable identity for one way to save money. `OpportunityRevision` is an immutable observed version of its terms.

An opportunity revision contains:

- optional source plan and variant labels;
- supported availability;
- optional source-stated effective period;
- entitlements;
- constraints;
- conditions;
- explicit ambiguities;
- role-typed links;
- observation and supersession metadata.

`variant_label` is an optional supported label local to an opportunity. Execution location and interface are expressed through controlled product facets rather than a second overlapping delivery-mode vocabulary. v0.1 does not introduce a mandatory Offering table. If several opportunities later share mode-specific capabilities and identity, that repeated evidence may justify a first-class Offering entity.

### ReviewEvent

An immutable decision about a specific revision. Initial decisions:

- `trust`
- `reject`
- `request_revision`
- `canonicalize`

A canonicalization event MUST be reversible and MUST preserve every source snapshot and evidence span.

The current trusted catalog is a deterministic projection of revisions and review events. Trust MUST NOT be represented by overwriting a revision.

### ResearchJob

Operational state derived by the harness from important gaps or ambiguities. Research jobs are not catalog ontology and are stored separately from immutable catalog revisions.

Initial states:

- `queued`
- `researching`
- `resolved`
- `unable_to_verify`

## Librarian candidate document

The librarian receives one source snapshot plus controlled vocabularies and emits one candidate document matching [`catalog-candidate.schema.json`](../schemas/catalog-candidate.schema.json).

The candidate contains:

- local evidence spans;
- one product revision proposal;
- zero or more opportunity revision proposals;
- possible canonical matches.

Local keys only provide references within the document. The harness creates durable IDs.

Free text is allowed only for:

- source labels and exact evidence;
- function-only descriptions;
- source-attributed claimed outcomes;
- human-readable ambiguity notes;
- explicitly typed `other` escape hatches.

Semantic values use enums, numbers, booleans, timestamps, controlled vocabulary IDs, and typed references.

## Support envelope

Every facet, entitlement, constraint, condition, link, identity proposal, and ambiguity MUST carry:

```json
{
  "basis": "explicit",
  "evidence_ids": ["ev_1"]
}
```

`basis` is one of:

- `explicit`: directly stated by supplied evidence;
- `inferred`: a bounded interpretation of supplied evidence.

Production method, model name, prompt version, and optional raw model confidence belong to librarian-run metadata. They MUST NOT be treated as semantic truth or copied onto every fact.

## Facets

Facets provide product function and search structure. Each facet has a namespace and a controlled concept ID from [`vocabularies.v0.1.json`](../schemas/vocabularies.v0.1.json).

Initial namespaces:

- `capability`
- `operation`
- `interface`
- `input_modality`
- `output_modality`
- `execution_location`
- `accelerator`
- `operability`
- `monitoring_subject`

The harness MUST reject unknown concept IDs unless the librarian marks a proposed concept through the typed `other` path and sends it to review.

Claimed outcomes remain source-attributed search text. v0.1 does not create a universal outcome ontology.

## Entitlements

An entitlement describes what the opportunity grants, includes, waives, credits, or discounts.

Initial kinds:

- `no_cost_access`
- `included_usage`
- `included_resource`
- `included_capacity`
- `included_feature`
- `monetary_credit`
- `percentage_discount`
- `fixed_discount`
- `waived_fee`
- `trial_access`
- `grant`

An entitlement MAY contain:

- typed quantity and comparator;
- cadence;
- total duration;
- maximum monetary value;
- applicability targets;
- cost scope;
- evidence support.

Kinds impose structural requirements. Included usage, resources, and capacity require quantities; monetary credits and fixed discounts require typed money; percentage discounts require a percentage and comparator; and grants require money or quantity. Trial duration is typed when stated but may be absent—the harness, not the librarian, records that ordinary gap. Cost scope is required when the entitlement directly makes a price claim, but may be absent for descriptive included resources such as seats or projects.

Initial cost scopes:

- `platform_fee`
- `subscription_fee`
- `software_license`
- `provider_usage`
- `infrastructure`
- `usage`
- `unknown`
- `not_applicable`

Examples:

- ReportGPT: no-cost platform access; external provider usage unresolved.
- Latitude open source: no-cost software license; infrastructure cost unresolved.
- Gonka: included provider usage of at least 1,000,000 tokens per month.
- VEO offer: one USD 300 monetary credit, not a credit plus a duplicated USD 300 savings benefit.

`unlimited` is a comparator backed by source evidence. It is not independently verified truth.

## Constraints

A constraint limits, excludes, retains, or prices something. It targets either the opportunity or a stable local entitlement key.

Initial kinds:

- `maximum_quantity`
- `minimum_quantity`
- `rate_limit`
- `retention`
- `capacity`
- `maximum_item_size`
- `paid_addon`
- `excluded_feature`
- `other`

Examples:

- Revdoku's 25 MB database capacity targets the included database entitlement.
- A 100 MB file-size maximum targets individual files rather than the entire opportunity.
- ShipStatic custom domains are a paid add-on, not a requirement for base hosting.

A quantity already present on an entitlement MUST NOT be duplicated as an equivalent constraint.

## Conditions

A condition is a predicate for receiving or using an opportunity or entitlement.

Initial typed families:

- boolean requirements: account, login, credit card, application, approval, installation, repository, build step;
- external credentials: API key, model/provider key, provider account, GitHub App, MCP client;
- audience eligibility: startup, student, individual, indie developer, small team, open-source project, nonprofit, academic;
- geography;
- typed `other` escape hatch.

Conditions MUST declare their target. BYOK for one feature MUST NOT become a product-wide requirement.

Eligibility is an opportunity condition, not a product property. Startup verification and student access therefore remain scoped to their respective opportunities.

## Ambiguities and missing fields

The librarian emits explicit ambiguity only when supplied text supports multiple interpretations, conflicts with itself, or looks time-sensitive.

Initial reasons:

- `ambiguous`
- `contradictory`
- `suspected_stale`

Ambiguities target stable local object keys and semantic field names such as `scope`, `cadence`, `identity`, or `relationship`. Array-index JSON pointers are forbidden.

Ordinary absence is harness-owned:

- a completeness profile determines fields expected for each opportunity shape;
- missing required savings evidence blocks publication;
- important gaps create research jobs;
- unimportant omissions do not consume librarian tokens.

For example, Keywords AI emits an ambiguity about what a request meters. CoCalc does not need an LLM-authored list of every missing term; the harness detects that it lacks an evidenced entitlement and blocks publication.

## Links

Links use typed roles:

- `canonical_product`
- `documentation`
- `pricing`
- `terms`
- `source`
- `application`
- `redemption`
- `repository`

An aggregator redemption URL MUST NOT become a product's canonical URL.

## Time and freshness

Every durable product and opportunity revision MUST contain:

- `observed_at`;
- optional harness-derived `supersedes_revision_id`.

Opportunity revisions MAY also contain supported `effective_from` and `effective_to` values when the source states them.

The librarian candidate carries `observed_at` once at its root because every proposal in that document comes from the same source observation. The harness copies that timestamp into each durable product and opportunity revision. The librarian never mints or proposes durable supersession IDs.

Freshness is computed from source type, observation age, refresh policy, and later evidence. It is not a mutable `verified` boolean.

A human-reviewed historical claim remains historical evidence after it is superseded.

## Entity resolution

Source records are never merged destructively.

Canonicalization:

- selects or creates a canonical product identity;
- records aliases and source identity members;
- preserves contradictory revisions;
- redirects projections to the canonical identity;
- remains reversible through review events.

Maxim/Maxim AI and Google Colab/Colaboratory are initial canonicalization fixtures.

Shared branding is insufficient evidence. Google AI Studio, Workspace Plus with Gemini, and the VEO/Gemini API credit remain distinct unless supported relationships say otherwise.

## Collections and search

Collections are versioned query definitions over facets, entitlements, conditions, and review state. The catalog SHOULD persist only:

- collection definitions;
- materialized indexes or projections;
- reviewed manual inclusion/exclusion overrides with reasons.

The broad catalog and a narrow inference/GPU collection are separate projections.

Search combines:

- controlled facets;
- normalized entitlement and condition indexes;
- source text and claimed outcomes;
- full-text and later semantic retrieval.

Provider and source category are secondary search metadata.

## Publication gate

A recommendation is publishable only when:

- product function has supported evidence;
- at least one concrete savings entitlement has supported evidence;
- both its product revision and opportunity revision have a latest trusting review event or satisfy an approved automatic-promotion policy;
- no unresolved blocking contradiction exists;
- source and evidence references validate.

Unknown card or login requirements do not automatically block publication, but they MUST display as unknown when relevant. Missing evidence for the savings itself does block publication.

Descriptions, offer badges, requirements, warnings, and evidence panels are deterministic card projections.

## Harness responsibilities

The harness MUST:

1. preserve and hash source snapshots;
2. verify exact evidence excerpts;
3. validate candidate JSON against the schema;
4. validate vocabulary references and local-key integrity;
5. create durable IDs and immutable revisions;
6. derive ordinary missing-field gaps;
7. detect duplicate economics and invalid scope multiplication;
8. compare revisions and enqueue material changes;
9. derive research jobs from blocking gaps and ambiguities;
10. apply review events without mutating history;
11. build typed SQLite indexes and search projections;
12. enforce the publication gate.

The librarian MUST NOT perform web research during classification. A separate researcher consumes research jobs and returns new source snapshots and candidate revisions.

## SQLite projection

The durable store SHOULD keep immutable revision JSON plus narrow relational indexes rather than decomposing every scalar into EAV rows.

Initial durable tables:

- `source_snapshots`
- `evidence_spans`
- `products`
- `product_revisions`
- `opportunities`
- `opportunity_revisions`
- `review_events`

`current_published_revisions` is a derived SQL view. It joins only related product and opportunity revisions whose latest review events are `trust`; it is not a writable source of truth.

Initial derived indexes:

- `facet_index`
- `entitlement_index`
- `entitlement_applicability_index`
- `constraint_index`
- `condition_index`
- `search_index`

Operational state such as `research_jobs`, refresh locks, and job logs remains in the maintainer database.

## Deliberate v0.1 exclusions

v0.1 does not require:

- a mandatory Offering/Variant entity;
- a universal assertion/EAV table;
- an arbitrary relationship graph;
- automatic entity merging;
- calibrated confidence thresholds;
- a universal user-outcome ontology;
- automated web research;
- currency conversion or savings optimization;
- a full eligibility/stackability policy language;
- normalization of every possible source fact.

These seams remain available when repeated reviewed data justifies them.
