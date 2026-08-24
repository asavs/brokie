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
- **Evidence:** Exact source-grounded text supporting a claim, plus its derivation method.
- **Relationship:** Alias, duplicate, parent provider, alternative, dependency, stackability, or replacement.
- **Verification:** Last checked time, method, result, and suspected staleness.
- **Unknown:** A missing, ambiguous, contradictory, or suspected-stale field, attached to the affected entity and supporting evidence.
- **Review decision:** Human conclusion, explanation, desired labels, and unresolved questions.

### Assertions and uncertainty

Each extracted assertion should reference evidence and carry a small, inspectable state:

- `derivation`: `explicit` or `inferred`;
- `verification_status`: `unverified`, `verified`, `disputed`, or `stale`;
- `evidence_ids`: one or more supporting source excerpts.

A model-generated confidence score may be retained as optional diagnostic metadata, but it is not required for v0.1 and does not determine trust or promotion unless it is calibrated against reviewed examples.

An assertion state does not fully describe incomplete information. The catalog contract also records explicit unknowns:

```text
field
reason: missing | ambiguous | contradictory | suspected_stale
evidence_ids
```

The librarian emits assertions and unknowns. The harness decides which unknowns matter enough to create operational `research_job` records, routes those jobs to a separate researcher, and attaches any returned evidence. Research jobs are workflow state, not catalog ontology.

### Offer/access terms

Do not force the whole opportunity into one overlapping access-type enum. Describe it with orthogonal fields:

- delivery mode: hosted, self-hosted, downloadable, hybrid, or unknown;
- availability: public, eligibility-gated, application-required, invite-only, or unknown;
- named plan and whether the source explicitly calls it a free tier or trial;
- one or more typed benefits: no-cost access, included usage, monetary credit, percentage discount, fixed discount, waived fee, trial access, or grant;
- license and distribution terms when software is available for self-hosting;
- requirements and eligibility.

Each benefit should support:

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

Example: Arize AI has a source-explicit free tier whose benefit is no-cost monitoring of up to `2 monitored_models`, with period, expiry, card requirement, and eligibility currently unknown.

A product may expose multiple independent savings opportunities. For example, a hosted free tier and an open-source self-hosting option must be separate opportunity records so hosted quotas are not applied to self-hosting and “open source” does not imply free infrastructure.

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

Compute resources need execution and ownership facets so “uses a GPU” is not confused with “provides a hosted GPU”:

- execution location: provider-hosted, client device, self-hosted, hybrid, or unknown;
- accelerator type and access method;
- whether hardware is provided by the opportunity;
- runtime or interface, such as browser, notebook, CLI, package, or kernel.

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
- evidence, verification, and review status.

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
  -> derive research jobs from important unknowns
  -> human review disagreements
  -> publish trusted snapshot
  -> monitor for source and availability changes
```

Models should propose structured facts; deterministic validation and human-reviewed evidence decide what becomes trusted. Keep prompts thin and the harness thick: the data contract, provenance checks, validation, entity resolution, and review gates carry the system's durable behavior.

### Entity resolution

Multiple source records may describe the same underlying product or opportunity. Matching records should resolve to one canonical entity while every source statement remains independently attributable as evidence.

- Prefer the product's current public name as the canonical display name.
- Do not discard a duplicate merely because another record is more complete.
- Merge compatible claims into the canonical entity, preserving source-level provenance.
- Keep conflicting, stale-looking, or time-sensitive claims as unverified claims until checked.
- Queue uncertain merges and contradictions for review rather than silently choosing one record.

### Claim and capability fields

The contract keeps source-attributed `claimed_outcomes` separate from evidence-grounded `capabilities`. Search may use both fields without requiring prompt-specific rules for individual marketing verbs.

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
- Claimed outcome: “Improve” LLM and agent applications.
- Description: “Platform for evaluating, observing, tracing, simulating, and applying guardrails to LLM and AI-agent applications.”
- Offer data: Free tier; 50 GB storage; 2,000 evaluation credits; 100,000 gateway requests per month; 1,000,000 text-simulation tokens; 60 voice-simulation minutes; unlimited projects; unlimited seats; BYOK LLM-as-judge with a USD 0 platform fee.
- Only the gateway request limit has an explicit monthly reset in the supplied text; reset periods for the other metered allowances remain unknown.
- Requirement relationship: Bringing one's own model key is required specifically for the USD 0 platform-fee LLM-as-judge arrangement.
- Distribution: Open source.
- Other unknowns: Account, card, geography, and general eligibility.

### Gonka Broker

- Decision: Accept the candidate classification.
- Capabilities: Hosted model inference and OpenAI-compatible model API.
- Candidate outcomes: Call an AI model through an API; obtain free model inference.
- Remove `gpu-compute`: The GPU network is provider-side infrastructure, not a GPU machine or accelerator exposed for user-controlled compute.
- Description: “OpenAI-compatible API serving open-source models through a decentralized inference network.”
- Architecture: Decentralized GPU network.
- Offer data: Free token allowance of at least 1,000,000 tokens, resetting monthly.
- The allowance requires a comparator in the contract: `quantity: 1000000`, `comparator: at_least`, `unit: tokens`, `period: month`.
- Unknowns: Whether the allowance covers input, output, or combined tokens; model-specific differences; rate limits; account/card requirements; and geography.

### Google AI Studio

- Decision: Accept the candidate trusted classification of hosted model inference.
- Keep model API access as an inferred, unverified assertion rather than a trusted capability because the supplied text gives request and token rate limits but does not explicitly say API.
- Candidate outcome: Obtain free model inference.
- Description: “Environment for running inference with Gemini Flash and Gemma models.”
- Offer data for Flash: 5 requests per minute; 20 requests per day; 250,000 input tokens per minute.
- Offer data for Gemma 4: 30 requests per minute; 14,400 requests per day; 16,000 input tokens per minute.
- Uncertainty: The source does not unambiguously map “Flash” to both named Gemini Flash versions.
- Other unknowns: Output-token allowance; whether quotas apply to an API, browser environment, or both; account/card requirements; geography; and eligibility.

### Keywords AI

- Decision status: Needs taxonomy revision; do not accept either existing tag set unchanged.
- Capabilities supported by the supplied text: LLM monitoring, unified model API, and model gateway.
- Remove `evaluation`: Monitoring alone does not establish evaluation.
- Remove `model-inference`: The source describes calling other models through one interface, not inference supplied by Keywords AI.
- Candidate outcomes: Monitor an LLM application; call many LLMs through one interface; use a model gateway.
- Description: “LLM monitoring platform and unified interface for calling more than 200 models.”
- Supported-model claim: At least 200 models.
- Offer claims: 10,000 free requests per month; USD 0 for platform features.
- Explicit unknown: `allowance.scope` is ambiguous because the supplied evidence does not say whether “requests” meters gateway model calls, monitoring/logging events, or another operation.
- The harness should derive a research job asking what the allowance meters and whether third-party inference charges are separate.
- Other unknowns: Account/card requirements, geography, rate limits, and eligibility.

### Latitude

- Decision status: Needs taxonomy and opportunity-model revision; do not accept either existing tag set unchanged.
- Capabilities: AI observability, AI evaluation, tracing, and monitoring.
- Remove `agent-platform`: Tracing or evaluating production agents is not evidence that the product builds agents.
- Candidate outcomes: Monitor an AI system in production; trace an AI application or agent; evaluate an AI system.
- Description: “LLM observability and evaluation platform for tracing, monitoring, and evaluating production AI agents.”
- Hosted opportunity: Free Starter plan; 20,000 credits per month; 30-day data-retention window; unlimited seats.
- Hosted explicit unknown: The scope of a “credit” is ambiguous and may produce a harness-derived research job.
- Open-source opportunity: MIT-licensed, self-hostable software. Infrastructure cost is unknown and must not be presented as free hosting.
- Modeling consequence: Keep the hosted free tier and open-source/self-hosting option as separate opportunities under one product.

### MediaWorkbench.ai

- Decision status: Needs taxonomy and offer-model revision; do not accept the candidate unchanged.
- Capabilities: Hosted model inference, code generation, image generation, and research assistance.
- Restore `image-generation`: The supplied text explicitly says image creation.
- Candidate outcomes: Generate code; create images; conduct deep research; use hosted AI models.
- Description: “AI workspace providing access to Azure OpenAI, DeepSeek, and Gemini models for code generation, deep research, and image creation.”
- Supported services: Azure OpenAI, DeepSeek, and Google Gemini.
- Benefit: Included usage of 100,000 words. Do not create a separate `free_allowance` opportunity type; included usage is a benefit within an opportunity whose plan form is currently unknown.
- Explicit unknowns: Reset period; input/output/combined accounting; whether image creation consumes the word-denominated allowance; account/card requirements; geography; and eligibility.
- Product-boundary rule: Keep multiple capabilities or offerings under one product unless evidence establishes distinct named subproducts, separately scoped benefits, or different requirements. Benefit records can carry an `applies_to` scope; leave it unknown when the source does not say.

### OpenRouter

- Decision: Accept the candidate trusted classification of hosted model inference.
- Keep model routing as an inferred, unverified assertion because the supplied text and product identity suggest model breadth but do not explicitly state gateway, routing, unified API, or model switching.
- Candidate outcome: Use a hosted AI model for free. Accessing multiple models through one service remains inferred.
- Description: “Hosted model service offering access to a catalog of free and paid AI models.”
- No-cost benefit applies to the source-listed DeepSeek R1, DeepSeek V3, Llama, and Moonshot AI models, subject to rate limits of unknown quantity.
- Claude, OpenAI, Grok, Gemini, and Nova are mentioned as paid catalog options and are not part of the no-cost benefit.
- Unknowns: Rate-limit quantities, interface type, account/card requirements, geography, and eligibility.

### RunMat

- Decision status: Defer the candidate and replace both existing broad labels.
- Remove `gpu-compute`: The source describes browser WebGPU acceleration, not access to provider-hosted GPU hardware.
- Remove `notebook`: Jupyter kernel support is an integration, not evidence that RunMat provides a hosted notebook.
- Capabilities: Browser numerical-computing IDE, MATLAB-syntax runtime, client-side GPU acceleration, Jupyter kernel integration, CLI runtime, and NPM package.
- Candidate outcomes: Run MATLAB-style numerical computations without MATLAB license fees or desktop installation; accelerate supported workloads using an existing browser-accessible GPU.
- Compute facets: Execution location is inferred as `client_device`; accelerator type is GPU; access method is WebGPU; hardware is not supplied by the opportunity.
- Browser opportunity: No-cost browser-app access; no installation, account, or license fee required.
- Open-source opportunity: Downloadable/self-hostable runtime with CLI, NPM package, and Jupyter kernel interfaces; license is unknown.
- Collection membership: Keep in broad Brokie and numerical/local-compute views; exclude from collections promising free hosted GPU hardware or hosted notebooks.

### ShipStatic

- Decision status: Defer the candidate so false AI labels can be replaced with broad-catalog hosting/deployment capabilities.
- Remove `agent-platform`: Being operable by an AI agent is not evidence that the service builds agents.
- Remove `model-api`: A generic service API is not a model inference API.
- Capabilities: Static-site hosting, static-site deployment, edge delivery, and agent-compatible automation.
- Interfaces: CLI, MCP, SDK, and generic service API. Compatibility/operability and protocol belong in separate contract facets rather than capability inflation.
- Candidate outcome: Deploy and host a static site manually or from an AI agent.
- Description: “Static-site hosting service deployable through CLI, MCP, SDK, or API, with automatic HTTPS and global edge delivery.”
- Benefits: No-cost static hosting; source-stated permanent site retention; automatic HTTPS; global edge delivery; source-stated unmetered bandwidth.
- Requirements/exclusions: Signup, installation, repository, and build step are source-stated as not required for the basic deployment path; custom domains are paid.
- Explicit unknown: The source does not establish whether an account is required specifically for permanent retention, despite separately saying basic deployment needs no signup and free accounts retain sites permanently.
- Collection membership: Keep in broad Brokie and agent-compatible hosting/deployment views; exclude from inference/GPU.

### telemetry.dev

- Decision: Accept the candidate classification of AI observability; remove model API.
- Receiving telemetry about model calls through a generic ingestion interface is not evidence that the service provides model inference.
- Capabilities: AI/LLM observability, model-call tracing, tool-step tracing, and token/cost/latency/error monitoring.
- Interfaces: OTLP over HTTP and TypeScript SDK.
- Candidate outcomes: Monitor an AI/LLM application; trace model calls or agent tool steps; diagnose token usage, cost, latency, and errors.
- Description: “OpenTelemetry-based observability service for tracing model calls and tool steps, including token, cost, latency, and error data.”
- Hosted Free-plan benefits: 10,000 spans per month; 7-day retention; 1 project; 2 seats.
- Requirement: Credit card explicitly not required.

### Zenable

- Decision status: Defer the candidate so the false GPU label can be replaced with broad-catalog governance/tooling capabilities.
- Remove `gpu-compute`: The old deterministic classifier matched `tpu` inside the word “outputs.”
- Capabilities: Policy-as-code guardrails, code quality/compliance enforcement, automated output remediation, and automated pull-request review.
- Interfaces: MCP server and GitHub App.
- Candidate outcomes: Enforce organizational policies on AI-generated code; automatically fix noncompliant coding-tool output; review pull requests for quality and compliance.
- Description: “Policy-as-code guardrails that review and automatically fix coding-tool output for quality and compliance.”
- Free-tier benefits: 100 tool calls per day through the MCP server; 25 automated pull-request reviews per day through the GitHub App.
- Possible requirements: An MCP-compatible client and a GitHub App connection are inferred from the interfaces but are not explicit requirements in the supplied text.
- Collection membership: Keep in broad Brokie and a future AI coding/governance view; exclude from inference/GPU.

## Open design questions

- How narrow should `agent-platform` be?
- Which adjacent infrastructure belongs in the first trusted collection?
- Should vertical AI SaaS discounts enter now or wait for vertical collections?
- When may product identity/name support a label that the description does not state directly?
- How should multiple source records merge into one canonical product while preserving offer-specific evidence?
- Which offer terms deserve prominent card badges versus expandable details?
- How should claims such as “unlimited” be displayed without independently verifying them?
