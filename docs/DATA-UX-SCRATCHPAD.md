# Brokie data and UX scratchpad

> Living design notes, not a specification. These ideas should evolve as real catalog entries expose missing concepts and bad assumptions.

Last updated: 2026-08-24

## Guiding idea

Brokie should classify resources by the outcome a person wants, while preserving enough structured offer evidence to answer whether the resource is actually useful and free *for that person's situation*.

This is a faceted classification system rather than one rigid hierarchy. The same opportunity may support several outcomes, capabilities, input/output modalities, eligibility groups, and commercial terms.

## Emerging knowledge model

```text
Provider -> Product -> Opportunity
                        |- user outcomes
                        |- capabilities and operations
                        |- offer/access terms
                        |- limits and reset periods
                        |- requirements and eligibility
                        |- inputs, outputs, and supported formats
                        |- evidence and provenance
                        |- freshness and verification
                        |- relationships and duplicates
                        `- explicit unknowns and disputes
```

### Core entities

- **Source record:** Immutable supplied text, source file, line/row, URL, retrieval time, and content hash.
- **Provider:** Organization responsible for one or more products.
- **Product:** The underlying service or tool, independent of a particular discount/free offer.
- **Opportunity:** A public free tier, completely free service, trial, credit, discount, grant, open-source option, or other way to save money.
- **Capability:** What the product technically does: observability, inference, routing, audio processing, notebook compute, and so on.
- **User outcome:** The end result the searcher wants: monitor an AI system, clean up audio, run a model, obtain cloud credits.
- **Offer terms:** The structured meaning of “free,” separated from capabilities.
- **Limit:** A quantity, unit, reset period, duration, and exact evidence. An opportunity can have multiple limits.
- **Requirement:** Eligibility, credit-card requirement, login, geography, application/approval, startup stage, and other constraints.
- **Evidence:** Exact source-grounded text supporting a claim, plus derivation method and confidence.
- **Relationship:** Alias, duplicate, parent provider, alternative, dependency, stackability, or replacement.
- **Verification:** Last checked time, method, result, and suspected staleness.
- **Review decision:** Human conclusion, explanation, desired labels, and unresolved questions.

### Offer/access terms

Candidate access types:

- `completely_free`
- `free_tier`
- `free_trial`
- `usage_credit`
- `percentage_discount`
- `fixed_discount`
- `grant`
- `open_source`
- `bring_your_own_provider`
- `unknown`

Offer terms should support:

- included quantity and unit;
- reset period, if stated;
- total duration or expiry;
- estimated monetary value and currency;
- unlimited usage as an explicit source-stated claim;
- login and credit-card requirements;
- approval and eligibility requirements;
- geography and stackability;
- exact evidence for every field;
- `unknown` rather than silently treating missing restrictions as absent.

Example: Arize AI is `free_tier`, limited to `2 monitored_models`, with period, expiry, card requirement, and eligibility currently unknown.

### Operations and modalities

Generation must not be conflated with transformation or analysis.

Possible operation families:

- generate;
- transform/enhance;
- analyze/evaluate;
- observe/monitor;
- host/serve;
- route/broker;
- store/search/retrieve;
- automate/orchestrate.

Inputs, outputs, and formats should be separate facets. For example, an audio enhancer may have audio input and output, `noise-removal` and `echo-removal` operations, and MP3/WAV/FLAC formats without having an `audio-generation` capability.

### Catalog membership versus views

“Useful to Brokie eventually” and “belongs in the current AI inference/GPU proof-of-concept view” are separate decisions.

A resource can remain in the broad catalog while being absent from a particular collection or view. Candidate collections include:

- AI inference and model APIs;
- AI evaluation and agent development;
- virtual computers, notebooks, and accelerators;
- media generation and processing;
- hosting and deployment;
- startup-gated discounts and credits.

This may be better than globally deleting a valid resource merely because it is outside the first slice.

## Emerging UX model

### Search

The primary entry point is a natural-language outcome: “What are you trying to do?” Search should match user outcomes first, then capabilities and source descriptions.

Useful filters may include:

- type of free access;
- quantity and reset period;
- no credit card;
- no login;
- eligibility group;
- geography;
- input/output modality;
- hosted versus downloadable/open source;
- verification freshness;
- confidence/review status.

### Result card hierarchy

A card should answer, in this order:

1. What can this help me accomplish?
2. What exactly is free or discounted?
3. What are the important limits?
4. Who qualifies and what is required?
5. What is unknown or unverified?
6. What source evidence supports this?

Proposed visual groups:

- outcome/capability badges;
- prominent offer badges such as “Completely free,” “Up to 2 monitored models,” or “$300 API credit”;
- requirement warnings such as “Startup verification” or “Credit card required”;
- restrained uncertainty/freshness indicators;
- expandable original evidence and provenance.

Provider and category should be secondary metadata, not the primary navigation system.

### Keep card concerns structurally separate

Do not flatten product function, offer economics, and requirements into one generated description.

- **Description:** What the product/service does, stated without pricing or qualification boilerplate.
- **Outcome/capability facets:** What the user can accomplish.
- **Cost/offer block:** Access type, credit/discount/value, quantity, duration, and reset period.
- **Requirements block:** Credit card, login, approval, eligibility, geography, and other conditions.
- **Evidence block:** Exact source text supporting each field.

The UI may render concise phrases such as “$5 credit / month” or “Credit card required for verification,” but those phrases must be projections of structured fields rather than authored tag text or facts embedded into the product description.

## Librarian pipeline hypothesis

```text
preserve source
  -> identify entities
  -> propose collection membership
  -> classify outcomes/capabilities/operations
  -> extract offer terms and limits
  -> extract requirements and explicit unknowns
  -> attach evidence to every claim
  -> propose duplicates/relationships
  -> validate contradictions and unsupported claims
  -> human review disagreements
  -> publish trusted snapshot
  -> monitor for source and availability changes
```

Models should propose structured facts; deterministic validation and human-reviewed evidence decide what becomes trusted.

### Entity resolution

Multiple source records may describe the same underlying product or opportunity. Matching records should resolve to one canonical entity while every source statement remains independently attributable as evidence.

- Prefer the product's current public name as the canonical display name.
- Do not discard a duplicate merely because another record is more complete.
- Merge compatible claims into the canonical entity, preserving source-level provenance.
- Keep conflicting, stale-looking, or time-sensitive claims as unverified claims until checked.
- Queue uncertain merges and contradictions for review rather than silently choosing one record.

### Claims are not capabilities

Marketing outcome verbs such as “improve,” “optimize,” or “accelerate” do not by themselves prove a distinct product mechanism.

- Preserve the phrase as a source-attributed outcome claim when it helps explain the product's intended benefit.
- Classify only the concrete mechanisms supported by evidence, such as evaluation, tracing, simulation, optimization, fine-tuning, or automated iteration.
- Do not infer recursive self-improvement, autonomous optimization loops, model training, or model modification from the word “improve.”
- Let search recall use the claimed outcome, while capability filters remain evidence-grounded.

## Reviewed examples

### Atomic Mail

- Decision: Exclude from the current AI inference/GPU slice.
- Reason: Programmatic email is outside that collection even though it may be useful in a future agent-infrastructure or programmable-email view.

### Arize AI

- Decision: Accept revised classification.
- Capabilities: AI observability.
- User outcome: Evaluate or monitor an AI system.
- Removed: Hosted inference and free-inference outcome. “Free up to two models” refers to monitored models, not models provided for inference.
- Card content: Existing source-grounded description is good.
- Offer extraction: Free tier; up to 2 monitored models; period/expiry/card/eligibility unknown.

### Arize AX

- Decision: Needs revision rather than accepting either tag set unchanged.
- Capabilities: AI evaluation and AI observability.
- User outcome: Evaluate or monitor an AI system.
- Removed: Agent-building capability/outcome. Evaluating agents and including a built-in agent do not establish that users can build agents.
- Suggested description: “Evaluation and observability platform for AI applications and agents. The free product includes 25,000 spans and 1 GB of ingestion per month; the reset period for the span allowance is not stated.”
- Offer extraction: Free tier; 25,000 spans with period unknown; 1 GB ingestion per month.

### Audio Enhancer

- Decision: Keep in Brokie's broad catalog, but exclude from the current AI inference/GPU collection.
- Old error: Any mention of audio was classified as audio generation.
- Classification: Audio processing/enhancement, not audio generation. Candidate operations include noise removal, echo removal, and vocal enhancement; user outcome is “clean up or improve audio.”
- Modeling consequence: Global catalog inclusion and collection/view membership must be separate fields.
- Potential facts: completely free; unlimited enhancements; no login; MP3/WAV/FLAC; noise removal; echo removal; vocal enhancement.

### Brave Search API

- Decision status: Needs taxonomy and UX revision; do not accept either existing tag set unchanged.
- Keep in broad Brokie and an AI-agent/RAG infrastructure collection; exclude from a narrowly defined inference/GPU view.
- Capabilities: Web, news, image, and video search API; retrieval/RAG data source. It is not image/video generation, model inference, a model API, or an agent-building platform.
- Candidate outcomes: Obtain live web context for an agent; call a search API; obtain data for RAG.
- Description should contain only its function: “Search API for web, news, image, and video results, designed for RAG pipelines and AI-agent context.”
- Cost data: Usage credit, USD 5, monthly reset.
- Requirement data: Credit card required for verification.
- Unknowns: Request quantity, broader eligibility, expiry, and geography.
- UX consequence: Cost and requirements are separate structured blocks, not prose appended to the description or ordinary tag text.

### Google Colab / Colaboratory

- Decision: Resolve the `Google Colab` and `Colaboratory` source records to one canonical product named **Google Colab**; both currently point to the same product URL.
- Preserve both source descriptions as separate evidence rather than discarding either duplicate.
- Capabilities: Hosted Python/Jupyter notebook and GPU compute.
- Candidate outcomes: Run Python notebooks; obtain hosted compute; use GPU-accelerated compute.
- Offer data: Public free tier.
- Resource claim: One source explicitly claims access to an Nvidia Tesla K80 GPU. Retain this as an unverified, time-sensitive source claim until checked against a current primary source.
- Unknowns: Current accelerator models, guaranteed GPU availability, usage quota, session duration, account/card requirements, and geography.
- Collections: AI notebooks, virtual compute, and GPU compute.
- Description: “Hosted Python and Jupyter notebook environment with optional accelerated compute.”
- Pipeline consequence: Duplicate source records become evidence attached to one canonical product, not duplicate opportunity cards.

### Future AGI

- Decision status: Needs taxonomy and structured-offer revision; do not accept either existing tag set unchanged.
- Capabilities: AI evaluation, observability/tracing, model gateway/routing, AI testing/simulation, and AI safety/guardrails.
- Remove `agent-platform` / `build-agent`: Evaluating and simulating agent applications is not evidence that the product builds agents.
- Remove `model-api`: The source presents a gateway that mediates model access, not hosted model inference supplied by Future AGI.
- Candidate outcomes: Evaluate an AI system; monitor or trace an AI system; test or simulate an AI agent; add or test guardrails; use a model gateway.
- Claimed outcome: “Improve” LLM and agent applications. Treat this as a source-attributed benefit of the evidenced evaluation/observability mechanisms, not as evidence of recursive self-improvement or an autonomous optimization loop.
- Description: “Platform for evaluating, observing, tracing, simulating, and applying guardrails to LLM and AI-agent applications.”
- Offer data: Free tier; 50 GB storage; 2,000 evaluation credits; 100,000 gateway requests per month; 1,000,000 text-simulation tokens; 60 voice-simulation minutes; unlimited projects; unlimited seats; BYOK LLM-as-judge with a USD 0 platform fee.
- Only the gateway request limit has an explicit monthly reset in the supplied text; reset periods for the other metered allowances remain unknown.
- Requirement relationship: Bringing one's own model key is required specifically for the USD 0 platform-fee LLM-as-judge arrangement.
- Distribution: Open source.
- Other unknowns: Account, card, geography, and general eligibility.

## Open design questions

- How narrow should `agent-platform` be?
- Which adjacent infrastructure belongs in the first trusted collection?
- Should vertical AI SaaS discounts enter now or wait for vertical collections?
- When may product identity/name support a label that the description does not state directly?
- How should multiple source records merge into one canonical product while preserving offer-specific evidence?
- Which offer terms deserve prominent card badges versus expandable details?
- How should claims such as “unlimited” be displayed without independently verifying them?
