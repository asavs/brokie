# Brokie: product brief and working plan

> **Document role:** detailed planning and decision archive. For the authoritative current mission, role boundaries, and implementation horizon, read [`NORTH-STAR.md`](NORTH-STAR.md). Where the two disagree, the north star records the later decision.

Status: detailed decision archive; implementation began with releases `0.0.1`, `0.1.0`, and `0.1.1`

## Confirmed initial decisions

- Initial audience: founders and developers, with room to expand later.
- First flagship outcome: launch a small subscription SaaS as cheaply as possible.
- First eligibility geography: United States, with geography modeled extensibly.
- Savings metric: realistic total cash savings over twelve and twenty-four months, not merely advertised value.
- Operating-cost target: zero dollars, enforced with explicit resource and external-service budgets.
- Preferred deployment target: Oracle Cloud using the Oracle CLI.
- Fallback deployment target: Google Cloud using the Google Cloud CLI.
- Portability requirement: Brokie must not depend on provider-specific managed services for its core database, scheduler, evidence store, or API.
- Deployment assumptions such as free-instance quantity, shapes, storage, egress, and eligibility must be verified against current official provider terms before provisioning.
- Public mission: broad money-saving assistance without permanently limiting Brokie to software, startups, or developer infrastructure.
- Initial coverage: software, developer services, cloud resources, inference, and startup opportunities because these are the strongest available source collections.
- First autonomous role: Brokie Librarian.
- Public-media ambition: fully autonomous newsletter and multi-channel social publishing, including short-form video and posts for TikTok, Instagram, and Facebook.
- Publication posture: no routine pre-publication approval once a channel has passed its staged launch evaluation; publication remains constrained by evidence, channel policy, credential scope, action budgets, and emergency stops.
- Local-model posture: optional fallback or experiment rather than a foundational dependency; prefer provider-agnostic access to zero-cost remote inference with hard spend controls.
- Public identity: Brokie should openly identify itself as an autonomous AI operating through free infrastructure, free inference, free accounts, and other zero-cost resources; this is part of the product's personality rather than something to conceal.
- Account ownership: a human owner should retain recovery and ultimate control of future public accounts while Brokie receives only the scopes needed to operate them.
- Current subject boundary: recommend and explain discounts, free services, credits, and related opportunities that match a stated need; do not initially expand into personalized legal, tax, investment, debt, insurance, banking, or regulatory advice.
- Proof-of-concept boundary: only the Librarian is in scope.
- Proof-of-concept data boundary: organize a small subset of the already cataloged information rather than enriching the complete corpus.
- Proof-of-concept external-action boundary: no newsletters, social posts, public replies, account management, campaigns, or other publication.
- Proof-of-concept research value: occasional bounded failure is acceptable and should be captured as evaluation evidence, but credentials, spending, and irreversible external actions remain protected by structural controls.
- Version 0.0.1 subject slice: AI, model inference, and adjacent virtual-compute resources.
- Version 0.0.1 sources: only the existing `free-for-dev` README and supplied startup-offers CSV; no official-page retrieval or broad discovery.
- Version 0.0.1 product framing: a local derivative of the free-for-dev catalog with an autonomous Librarian that organizes source entries around user needs.
- Version 0.0.1 output design: delegated to the initial implementation design, with an emphasis on auditable matching rather than premature completeness.
- Version 0.0.1 execution environment: develop and evaluate locally first; deploy the winning unattended configuration to Oracle Cloud afterward.
- Version 0.0.1 harness selection: run a small controlled bake-off rather than choosing solely from feature lists.
- Available inference routes: NVIDIA NIM credentials are visible in the current environment; an OpenRouter credential is expected but was not visible to the current process during the initial readiness check.
- Preferred free inference routes: OpenRouter's `openrouter/free` router plus selected NVIDIA NIM free endpoints, initially including DeepSeek V4 Flash and Inkling where compatible.
- Inference reproducibility requirement: record the requested route and the actual resolved provider/model for every run.

### Local deployment-tool readiness

- OCI CLI 3.90.3 is installed.
- An OCI configuration file exists, although credential validity and tenancy access have not yet been tested.
- Node.js and the SQLite CLI are installed.
- Google Cloud CLI, Terraform/OpenTofu, and Docker are not currently installed.
- None of the missing tools is required for the first native Node.js and SQLite implementation.

This document describes a local companion project. It is not intended as an AI-authored contribution to the upstream `free-for-dev` repository.

## One-sentence product

Tell Brokie what you want to accomplish, and it will find the cheapest credible way to do it using free tiers, credits, grants, discounts, and startup programs.

## Expanded product vision

Brokie may ultimately become a fully autonomous money-saving assistant and meta-SaaS. In addition to maintaining an opportunity index and creating savings plans, it could publish useful findings, manage its public presence, interact with a community, learn what people are trying to accomplish, and use that feedback to improve its coverage.

The long-term loop is:

```text
Discover an opportunity
  -> verify and index it
  -> use it in practical savings plans
  -> publish useful findings and examples
  -> answer questions from people and agents
  -> learn which goals remain underserved
  -> improve the ontology, evidence, and plans
  -> repeat within explicit budgets and permissions
```

"Fully autonomous" means Brokie can continuously pursue this mission inside explicit boundaries. It does not mean that one model process receives every credential or that every generated action is automatically authorized.

This is a long-term vision, not the proof-of-concept scope. The first experiment does not publish or interact publicly.

## Product thesis

People do not fundamentally want a directory of vendors or coupons. They want to accomplish an outcome while spending less money.

The catalog is therefore supporting infrastructure. The primary result should eventually be a savings plan: a compatible combination of products and opportunities, tailored to the searcher's requirements and eligibility, with honest estimates of present cost, future cost, savings, expiration, setup difficulty, and migration risk.

The interaction shape resembles a specialized search index. A user or agent describes a need naturally without knowing the vendor. The system retrieves ranked, current, evidence-backed opportunities and explains why each result applies.

## What exists today

### Source collections

- `free-for-dev/README.md`: a large collection of public developer free tiers.
- `startup-offers.csv`: 277 startup-oriented credits, discounts, programs, and aggregators.

### Local generated artifacts

- `local-index/build-index.mjs`: reproducible source parser and normalizer.
- `local-index/generated/resources.json`: normalized machine-readable records.
- `local-index/generated/index.html`: searchable local human interface.
- `local-index/README.md`: rebuild instructions.

### Current corpus measurements

- 1,289 linked free-tier entries.
- 277 startup offers.
- 1,566 combined records.
- 75 combined source-category labels.
- Approximately 50 startup-offer names have an exact-name match in the free-tier README.
- The startup CSV has complete values in all eight of its columns.

### What the current index can do

- Full-text search.
- Filter by source type, category, and source.
- Sort basic fields.
- Keep public free tiers distinct from startup offers.
- Export normalized JSON for future processing.

### What it cannot do yet

- Search reliably by the user's desired outcome.
- Determine whether a user qualifies.
- Distinguish verified claims from aggregator claims.
- Determine whether offers can be combined.
- Assemble complete savings plans.
- Estimate realistic savings or post-offer costs.
- Track changes or expiration over time.
- Explain uncertainty and conflicting evidence.

## Intended users

### Humans

- Individuals trying to accomplish something inexpensively.
- Bootstrappers and side-project builders.
- Startup founders and small teams.
- Open-source maintainers, students, nonprofits, and educators.
- People auditing or reducing an existing technology or operating budget.

### Agents

- Coding agents selecting infrastructure and services.
- Research agents finding grants, programs, and eligibility evidence.
- Planning agents assembling a project or company operating stack.
- Cost-optimization agents reviewing an existing stack.
- Brokie itself, acting as the autonomous catalog maintainer.

## Core user promise

The principal input is:

> I want to accomplish ___, and I want to spend no more than ___ over the next ___.

The public positioning should remain broad while being honest about initial coverage. A working formulation is:

> Tell Brokie what you want to accomplish. Brokie will find credible ways to do it for less.

Initial supporting copy can state that Brokie currently knows the most about software, cloud services, AI inference, startup programs, and the tools required to launch and operate projects. Coverage can expand without changing the core promise.

The principal output is:

- What to use.
- Whether the searcher likely qualifies.
- What it costs now.
- What it would normally cost.
- What it may cost later.
- What the user can realistically save.
- What setup work is required.
- Which opportunities can be combined.
- When benefits expire.
- What causes costs to increase.
- How difficult it will be to migrate away.
- Evidence and freshness for every material claim.

## Core concepts

### Goal

An outcome the searcher wants, such as launching a subscription SaaS, adding transactional email, opening a business bank account, hiring a contractor, or becoming SOC 2 compliant.

### Capability

A functional ingredient required by a goal, such as PostgreSQL, authentication, email delivery, bookkeeping, payroll, or contract generation.

### Product

The underlying service provided by a vendor. A product may support many capabilities and have several opportunities.

### Opportunity

A particular public free tier, usage allowance, credit, grant, startup program, discount, or special benefit.

### Eligibility rule

A structured, explainable condition governing access to an opportunity.

### Evidence

A dated primary or secondary source supporting a specific claim.

### Observation

What the maintainer found when checking a source at a point in time, including content hash, availability, extracted claims, and conflicts.

### Plan

A compatible collection of products and opportunities that accomplishes a goal under a user's profile, budget, horizon, and constraints.

## Opportunity types

These must remain distinct rather than being reduced to one misleading value score:

- Permanent public free tier.
- Usage-limited free tier.
- Time-limited credit.
- Startup program.
- Percentage discount.
- Fixed-value discount.
- Grant or cash award.
- Open-source benefit.
- Nonprofit benefit.
- Education or student benefit.
- Partner or membership benefit.
- Aggregator or directory.
- Informational resource.

## Goal-oriented taxonomy

The taxonomy should be hierarchical and allow many-to-many relationships.

### Build and launch

- Build a prototype.
- Launch a website.
- Launch a SaaS.
- Deploy an API.
- Build a mobile application.
- Build an AI application.
- Add authentication.
- Add payments.
- Send transactional email.
- Store files and user uploads.
- Add search.
- Add analytics.
- Monitor errors and uptime.

### Operate a company

- Incorporate a company.
- Open a business bank account.
- Manage bookkeeping and tax.
- Create and manage contracts.
- Hire and pay employees or contractors.
- Manage compliance and security.
- Run customer support.
- Set up sales and CRM workflows.
- Produce marketing and design assets.
- Conduct user research.

### Reach a milestone

- Get the first 100 users.
- Support the first 10,000 users.
- Prepare for fundraising.
- Complete a security review.
- Become SOC 2 compliant.
- Expand into another country.
- Reduce current operating costs.
- Replace an expiring credit.

## Proposed data model

### Product

- Stable ID.
- Vendor and product names.
- Canonical URL and domains.
- Description.
- Capabilities.
- Supported goals.
- Regions and deployment model.
- Integration relationships.

### Opportunity

- Stable ID and product relationship.
- Name and opportunity type.
- Benefit amount, unit, allowance, discount, or grant value.
- Duration, reset period, renewal behavior, and expiration.
- Application URL.
- Offer status.
- New-customer and existing-account restrictions.
- Stacking and exclusivity rules.
- Advertised value and realistic usable-value estimate kept separately.

### Eligibility

- Applicant types.
- Company stage and incorporation requirements.
- Company age, funding, revenue, and employee limits.
- Geography and industry.
- Accelerator, investor, partner, or referral requirements.
- New-customer or previous-credit restrictions.
- Application and manual-review requirements.
- Required documents.
- Unknown values represented explicitly as unknown rather than false.

### Cost and risk

- Credit-card requirement.
- Current and post-offer pricing.
- Overage behavior.
- Usage thresholds.
- Expiration consequences.
- Setup complexity.
- Migration difficulty.
- Vendor lock-in and data-egress risk.
- Commercial-use limitations.

### Evidence

- Claim ID and structured field supported.
- Source URL and source type.
- Exact or summarized supporting passage.
- First seen, last seen, and last verified dates.
- Content hash.
- Confidence level.
- Conflict and supersession relationships.

## Search and ranking

Search should combine semantic retrieval with structured rules. Semantic similarity alone cannot reliably evaluate eligibility, compatibility, or cost.

Candidate ranking should consider:

- Goal fit.
- Required-capability coverage.
- Eligibility confidence.
- Realistic savings over the chosen horizon.
- Evidence quality and freshness.
- Geographic availability.
- Compatibility with the rest of a plan.
- Application and setup friction.
- Expiration and post-offer cost.
- Lock-in and migration risk.

There should be no unexplained global "best" score. Every recommendation should state why it ranked and what assumptions could change that ranking.

## Human experience

The homepage should lead with one natural-language prompt:

> What are you trying to do for less?

Optional profile fields should initially be minimal:

- Personal project, organization, or startup.
- Country or operating geography.
- Maximum budget.
- Planning horizon.

Results should present several strategies where useful:

- Cheapest permanent option.
- Largest first-year savings.
- Easiest setup.
- Lowest migration risk.
- Best option without an application or credit card.

Each result should show:

- Outcome enabled.
- Products and opportunities used.
- Estimated cost and savings.
- Eligibility determination and explanation.
- Important restrictions.
- Expiration and future cost.
- Evidence and verification date.
- Confidence and unresolved questions.

Vendor and category browsing should remain available as secondary navigation.

## Agent experience

The same knowledge base should support:

- Versioned JSON snapshots.
- Stable identifiers.
- A documented query API.
- An MCP server.
- A CLI.
- An installable agent skill.
- Structured eligibility predicates.
- Evidence attached to every material claim.
- Full-text and semantic retrieval.
- Change history and freshness scores.

Agent responses should contain ranked candidates or plans, citations, qualification reasoning, conflicts, assumptions, and missing information. They should not merely return records containing matching words.

The working [agent-access and Firecrawl implementation study](AGENT-ACCESS.md) expands this direction with emerging build and inspiration request modes, a skill-led and API-first access model, observed implementation lessons, response-contract requirements, and a development checklist. Its interface names and sequence remain provisional.

## Brokie as an autonomous meta-SaaS

The public product should be composed of several roles with separate permissions rather than one omnipotent agent.

### Brokie Librarian

Purpose: maintain trustworthy knowledge.

- Discover candidate opportunities.
- Find and preserve primary-source evidence.
- Detect changes and possible expiration.
- Maintain pricing, benefits, eligibility, capabilities, and provenance.
- Produce candidate facts and review items.
- Never publish promotional content directly.

### Brokie Planner

Purpose: help a person or agent accomplish an outcome for less money.

- Interpret goals and constraints.
- Determine required capabilities.
- Evaluate likely eligibility.
- Assemble compatible products and opportunities.
- Compare present and future costs.
- Explain assumptions, risks, expiration, and migration.
- Cite the evidence supporting every material recommendation.

### Brokie Correspondent

Purpose: turn verified knowledge into useful public material.

- Publish opportunity highlights.
- Produce expiration and material-change alerts.
- Create free-stack recipes and comparisons.
- Publish changelogs, newsletters, RSS entries, and product updates.
- Generate content only from approved facts and plans.

### Brokie Community Agent

Purpose: interact with users and convert conversations into useful feedback.

- Answer supported questions and mentions.
- Collect corrections and new-opportunity submissions.
- Identify recurring goals and missing coverage.
- Route disputes, sensitive requests, and uncertain answers to review.
- Avoid collecting unnecessary sensitive information in public channels.

### Brokie Growth Agent

Purpose: improve reach and usefulness within strict integrity rules.

- Select topics from actual search and question patterns.
- Test content formats and posting schedules.
- Measure useful engagement and conversions.
- Suggest communities, integrations, and partnerships.
- Never change evidence, eligibility, or recommendation ranking.
- Never conceal commercial incentives.

### Brokie Operator

Purpose: keep Brokie healthy and within its budget.

- Monitor VM, storage, backups, jobs, APIs, models, and quotas.
- Restart known services and retry bounded failures.
- Generate health and cost reports.
- Escalate security, backup, quota, or corruption incidents.
- Avoid autonomous production code changes or infrastructure expansion initially.

## Trust and permission architecture

Each role should have its own identity, credentials, tools, database permissions, and action budget.

The initial trust hierarchy should be:

```text
Evidence and source observations
  -> candidate structured claims
  -> validated and reviewed knowledge
  -> savings plans
  -> publishable claims
  -> public content and replies
```

Information may move forward only when it meets the policy for the next layer. Public engagement and model-generated content must never flow backward and silently become verified knowledge.

Recommended permissions:

| Role | Read verified data | Submit candidates | Change verified facts | Publish | Infrastructure access |
| --- | --- | --- | --- | --- | --- |
| Librarian | Yes | Yes | Policy-gated | No | No |
| Planner | Yes | No | No | No | No |
| Correspondent | Yes | No | No | Through gateway | No |
| Community | Yes | Yes | No | Bounded replies | No |
| Growth | Aggregates only | Suggestions | No | Through gateway | No |
| Operator | Health metadata | Incidents | No | Status only | Narrow operations |

No social or conversational agent should possess production database write credentials, cloud-owner credentials, billing authority, or account-recovery access.

## Publication and social lifecycle

Every public claim should travel through a recorded pipeline:

```text
Candidate topic
  -> retrieve verified facts
  -> generate draft
  -> check citations and claims
  -> check policy, tone, duplication, and platform rules
  -> publish automatically or queue for review
  -> record platform receipt and source versions
  -> monitor responses and corrections
```

Each publication record should preserve:

- Stable publication ID.
- Source opportunity, plan, and evidence versions.
- Generated content and revisions.
- Model, prompt, and policy versions.
- Autonomy and approval mode.
- Destination platform and account.
- Platform post ID and publication time.
- Corrections, edits, or deletions.
- Engagement measurements.

When a material claim changes, Brokie should be able to find every affected publication and decide whether to annotate, correct, remove, or supersede it.

### Social-account access

Prefer official platform APIs with narrowly scoped credentials. Separate publishing, analytics, and moderation credentials where the platform permits it.

Allow where needed:

- Create approved posts.
- Read Brokie's own posts.
- Read mentions and replies.
- Read non-sensitive engagement measurements.
- Perform explicitly defined moderation actions.

Do not grant by default:

- Change passwords or recovery information.
- Authorize new applications.
- Purchase advertising.
- Change billing.
- Delete an account.
- Enter commercial agreements.
- Send unrestricted direct messages.

Computer use should be an isolated fallback for platforms without adequate APIs. It should run in a disposable environment with one narrowly scoped account rather than a browser containing all of Brokie's identities.

## Public autonomy levels

Autonomy should advance separately for each channel and action type.

### Level 0: drafts only

- Generate posts, replies, reports, and campaigns.
- Require approval before every external action.

### Level 1: approved deterministic formats

- Publish changelogs, verified opportunity highlights, and expiration notices using reviewed templates.
- Use only verified database fields and approved plan outputs.

### Level 2: bounded supported replies

- Answer questions when evidence and confidence satisfy policy.
- Include citations and distinguish general information from individualized advice.
- Queue uncertain, sensitive, legal, tax, medical, investment, or reputationally risky replies.

### Level 3: bounded autonomous campaigns

- Select topics and schedules.
- Run content-format experiments.
- Adapt within frequency, duplication, tone, and platform budgets.
- Preserve a complete action and decision log.

This is the intended steady-state publishing level for Brokie's newsletter and social channels. Human pre-approval should not be required for ordinary posts or replies once the relevant channel has demonstrated acceptable behavior in a staged evaluation. "Bounded" refers to factual grounding, permissions, rate limits, topic policies, account security, commercial authority, and emergency controls—not routine editorial approval.

### Level 4: commercial relationships

Keep human approval for:

- Sponsorships and affiliate agreements.
- Paid campaigns and advertising purchases.
- Partnership commitments.
- Statements resolving public disputes.
- Legally binding terms.
- Material account, billing, or access changes.

## Commercial model and ranking independence

Possible future revenue paths include:

- Clearly disclosed affiliate links.
- Optional paid monitoring, profiles, or team features.
- Premium application and eligibility assistance.
- Cost-audit reports.
- API access for other agents and products.
- Private Brokie deployments.
- Clearly separated sponsorships.
- A carefully defined savings-based fee.

Commercial relationships must never silently influence organic ranking. Every affected result should disclose:

- Recommendation basis.
- Commercial relationship.
- Affiliate or sponsorship status.
- Evidence quality.
- Relevant non-affiliate alternatives.

Advertised, sponsored, and organically ranked results should be visually and structurally distinct.

## Harness and model architecture under discussion

The current recommended split is provisional and should be tested before adoption.

### Trusted production maintainer

- Brokie-owned Node.js scheduler, policy engine, job state, database writes, and budgets.
- Pi SDK as a lightweight model and tool-call loop.
- systemd timers for durable scheduling.
- SQLite as auditable state and memory.
- Narrow domain tools rather than arbitrary shell access.
- A local OpenAI-compatible model for routine classification and extraction.
- Optional budget-capped remote-model escalation.

### Experimental autonomous agent

- Hermes Agent as a possible public persona, discovery worker, community agent, or campaign researcher.
- Read-only access to verified data.
- Candidate and staged outputs rather than production publication or database authority initially.
- Memory and skill writes approval-gated during evaluation.
- Computer use isolated and disabled by default.

### Lightweight alternative

- `fx` remains a promising small native or embeddable worker.
- Its current experimental status makes it a candidate for evaluation rather than the initial trusted core.

### Provisional model ladder

1. No model for fetching, hashing, deterministic diffs, validation, and scheduling.
2. A quantized Qwen3-8B-class local model for bounded extraction, classification, and tagging.
3. A configurable stronger remote model for ambiguous or complex reasoning, protected by hard zero-dollar and request limits.
4. Human review for consequential uncertainty.

Model output is always a candidate claim or proposed action. Schema-valid output is not automatically verified truth.

For version 0.0.1, local quantized inference is removed from the critical path. The working ladder is:

1. No model for deterministic selection, parsing, validation, storage, and comparison.
2. Free remote inference for extraction, classification, matching, and explanations.
3. A second free model or provider for disagreement checks on the reviewed sample.
4. Human judgment for the proof-of-concept reference labels and consequential ambiguity.

The inference router must refuse paid fallback. A provider outage or exhausted free quota should pause or defer work rather than incur a charge.

### Version 0.0.1 local-first rationale

Local evaluation keeps application behavior, harness behavior, model behavior, and deployment behavior from becoming one undiagnosable experiment. The initial sequence should be:

1. Build the fixed corpus slice and reviewed sample locally.
2. Run identical tasks through candidate harnesses and free inference routes.
3. Compare output quality, cost, latency, observability, recovery, and unsafe-action attempts.
4. Select the smallest configuration that satisfies the Librarian contract.
5. Deploy that configuration to one Oracle VM.
6. Confirm unattended scheduling, restart recovery, quota handling, persistence, and zero-cost operation.

Oracle deployment is therefore part of version 0.0.1 validation, not the environment in which the Librarian is first designed.

### Harness bake-off contract

The candidate set should initially include:

- Pi SDK embedded in the Brokie worker.
- Hermes Agent in a constrained Librarian profile.
- `fx` in noninteractive or embedded form if its current interface supports the task cleanly.
- A minimal direct OpenAI-compatible loop as the control.

All candidates should receive the same:

- Fixed source records.
- Prompt and controlled vocabulary.
- Output JSON Schema.
- Tool surface.
- Request and time budget.
- Inference route where technically possible.
- Retry and failure policy.

Score separately:

- Schema-valid completion rate.
- Field precision and recall against reviewed labels.
- Unsupported-claim rate.
- Unknown-preservation rate.
- Duplicate and relationship quality.
- End-need matching quality.
- Token and request use.
- Wall-clock latency.
- Retry and resume behavior.
- Trace completeness.
- Attempts to exceed the permitted tool or action surface.

## Self-improvement policy

Brokie should improve through explicit, reviewable artifacts rather than an opaque agent autobiography.

Preferred learned artifacts:

- Versioned extraction rules.
- Source-specific parsers.
- Source reliability measurements.
- Reviewed ontology mappings.
- Regression tests.
- Evaluation examples.
- Documented policy changes.
- Approved skills with versions and rollback.

Avoid initially:

- Unreviewed production prompt mutation.
- Unreviewed skill creation or rewriting.
- Autonomous application-code deployment.
- Broad prose memories that silently influence evidence decisions.
- Social engagement being treated as factual confirmation.

If Brokie later proposes a skill or policy improvement, it should include evidence, tests, expected benefit, affected permissions, and a rollback path.

## Autonomous Brokie maintainer

Brokie should behave as a conservative evidence-gathering librarian running inexpensively on one small VM.

### Maintenance loop

1. Discover a candidate opportunity or scheduled record to revisit.
2. Fetch the known source with strict request and concurrency budgets.
3. Detect whether the source changed using metadata and content hashes.
4. Extract candidate claims.
5. Seek official primary-source evidence.
6. Compare claims with the current structured record.
7. Assign confidence and identify conflicts.
8. Apply safe observations automatically.
9. Queue consequential interpretations for review.
10. Schedule the next check based on volatility and importance.

### Record states

- Discovered.
- Needs primary source.
- Verified.
- Changed.
- Conflicting.
- Possibly expired.
- Expired.
- Unavailable.
- Needs human review.

### Safe automatic actions

- Record page availability, redirect, and content hash.
- Refresh `last_seen`.
- Save an observation or candidate claim.
- Flag a difference or conflict.
- Adjust freshness.
- Schedule a follow-up.

### Actions requiring stronger evidence or review

- Declare an offer expired.
- Replace a monetary limit.
- Interpret ambiguous eligibility language.
- Conclude that offers can be stacked.
- Estimate practical savings.
- Recommend a migration-sensitive plan.

### Tiny-machine architecture

- SQLite for products, opportunities, rules, evidence, observations, events, profiles, and plans.
- A scheduled worker using systemd timers or cron.
- A small web and API process.
- Locally stored text snapshots or evidence passages, compressed and deduplicated.
- Incremental local embeddings only when they materially improve retrieval.
- Static JSON and HTML snapshots as a resilient fallback.
- No distributed queue, Kubernetes cluster, or managed vector database in the initial architecture.

### Deployment shape

The preferred first deployment is a single Oracle Cloud VM, even if the account permits several free instances. Additional instances should be introduced only when a measured workload or isolation requirement justifies them.

The initial machine should run:

- One small web/API service.
- One scheduled maintainer worker, normally idle.
- SQLite in write-ahead logging mode.
- A compact local evidence store.
- A reverse proxy with HTTPS when the service becomes public.
- Automated encrypted backups to a separately configured destination.

The application should be deployable through ordinary files, environment variables, and a system service. Provider-specific infrastructure definitions may provision compute, networking, and storage, but the application itself should remain portable between Oracle Cloud, Google Cloud, a local machine, and another Linux VM.

Multiple free VMs could later provide useful isolation:

- Public API and web interface.
- Fetching and maintenance worker.
- Search or embedding worker.
- Monitoring and backup relay.

They should not form a distributed system merely because the quota exists. A single machine is easier to secure, back up, observe, and keep within the zero-dollar budget.

### Resource policy

- Cap requests, concurrency, LLM calls, storage, and daily work.
- Hash unchanged pages and skip unnecessary extraction.
- Recheck volatile or expiring opportunities more frequently.
- Recheck stable records slowly.
- Use exponential backoff for broken sources.
- Batch extraction work where practical.
- Track its own operating cost as a first-class metric.

## Trust principles

- Fun voice, sober evidence.
- Prefer official sources over aggregators.
- Use aggregators for discovery, not final truth.
- Cite every material claim.
- Separate facts, interpretations, and estimates.
- Never imply that all advertised benefits can be claimed together.
- Keep advertised value distinct from realistic usable value.
- Show post-credit cost and expiration risk.
- Prefer durable savings where they better fit the user's horizon.
- Preserve uncertainty instead of manufacturing false precision.
- Maintain a complete history of material changes.

## Benchmark concept

A future evaluation suite, provisionally called SaveDex, should use realistic tasks with fixed expected evidence and outcomes.

Suggested tracks:

1. Opportunity discovery: find an appropriate opportunity without knowing the provider.
2. Eligibility resolution: decide whether a given profile qualifies and cite the controlling rule.
3. Plan construction: assemble compatible ingredients that accomplish a goal.
4. Cost projection: estimate savings and identify when costs begin or increase.
5. Constraint adherence: respect conditions such as no card, permanent tier, geography, or provider exclusions.
6. Freshness and change detection: prefer current evidence and identify superseded claims.

## Preliminary implementation sequence

This sequence records the work implied by the product vision. It is not yet an active execution plan or goal. Scope, autonomy, harness, model, publication, and business decisions should be discussed before converting it into committed milestones.

### Phase 0: Preserve the raw corpus

- Keep the existing reproducible importer.
- Add source-specific stable identifiers.
- Preserve raw source text alongside normalized fields.
- Record import timestamps and source versions.
- Add validation tests and import summaries.

Definition of done: the two current sources can be rebuilt without silent data loss, and every normalized record can be traced back to its raw source.

### Phase 1: SQLite knowledge base

- Define product, opportunity, source, evidence, claim, and observation tables.
- Separate products from offers.
- Resolve obvious duplicate products conservatively.
- Import the 1,566 records.
- Create a review queue for ambiguous matches.
- Expose a read-only JSON API and data export.

Definition of done: the catalog has stable identities, provenance, and lossless source traceability.

### Phase 2: Capability and goal ontology

- Create a small initial controlled vocabulary.
- Map a high-value sample rather than classifying everything immediately.
- Support hierarchical goals and many-to-many capabilities.
- Record classification confidence and whether a mapping was human or machine produced.
- Add outcome-first search to the human interface.

Definition of done: users can search several representative goals without knowing vendor names and receive materially relevant results.

### Phase 3: Eligibility and evidence

- Define the structured eligibility rule language.
- Fetch official sources for a prioritized subset.
- Store claim-level evidence and verification dates.
- Add user profiles and explainable eligibility evaluation.
- Distinguish verified, inferred, conflicting, and unknown values.

Definition of done: the system can explain likely eligibility for a meaningful subset without hiding unknowns.

### Phase 4: Autonomous maintenance

- Add scheduled URL and content-hash checks.
- Add source-change observations and extraction jobs.
- Implement confidence-based automatic actions.
- Build the human review queue.
- Produce a daily Brokie report.
- Enforce request, storage, and model budgets.

Definition of done: the system keeps a prioritized subset fresh for a month without uncontrolled cost or silent factual overwrites.

### Phase 5: Savings plans

- Model requirements, compatibility, stacking, and exclusions.
- Add cost horizons and post-offer pricing.
- Generate several explainable plan strategies.
- Identify bottlenecks, expiration cliffs, and migration risk.
- Add scenario comparison.

Definition of done: a user can describe a representative project and receive an evidence-backed plan with plausible present and future cost.

### Phase 6: Agent distribution

- Stabilize the query and response schema.
- Add CLI, MCP, and agent skill interfaces.
- Publish versioned snapshots.
- Require citations and uncertainty in agent responses.
- Add rate and budget controls.

Definition of done: an external agent can query Brokie, receive structured evidence-backed plans, and act without scraping the human interface.

### Phase 7: Evaluation and expansion

- Build the first SaveDex dataset.
- Measure retrieval, eligibility, planning, and freshness separately.
- Expand sources and goal coverage based on failures.
- Add feedback loops for incorrect or expired results.

Definition of done: improvements can be measured against realistic tasks rather than judged by catalog size or demos alone.

## Recommended first vertical slice

This earlier product-oriented vertical slice is deferred until the smaller Librarian proof of concept succeeds. Do not begin by enriching all 1,566 records.

Suggested initial goal:

> Launch a small subscription web application as cheaply as possible.

Initial capabilities:

- Frontend hosting.
- Application or API compute.
- PostgreSQL database.
- Authentication.
- Transactional email.
- Monitoring and error tracking.
- Payments.

Initial deliverables:

- Twenty to fifty strongly relevant products.
- Public free tiers and startup opportunities represented separately.
- Official evidence for important limits and eligibility.
- A small profile questionnaire.
- Eligibility explanations.
- At least three plan strategies.
- Present cost, first likely paid bottleneck, expiration, and migration warnings.
- A maintainer loop that rechecks this subset.

This slice exercises ingestion, ontology, evidence, eligibility, planning, maintenance, and both human and agent presentation without requiring complete corpus enrichment.

## Immediate proof-of-concept boundary

The first executable experiment should answer a narrower question:

> Can an unattended Librarian transform a small set of messy catalog entries into a more useful, consistent, outcome-oriented index at zero inference cost while preserving provenance and exposing its mistakes?

In scope:

- Select a small, representative subset of existing records.
- Separate products from opportunities.
- Normalize names, URLs, offer types, and source provenance.
- Assign capabilities and user goals from a controlled vocabulary.
- Extract explicit requirements, benefits, restrictions, duration, and unknowns from the supplied text.
- Identify likely duplicates and related records without silently merging them.
- Produce structured candidate records, confidence values, and explanations.
- Validate schemas and record every model action.
- Compare the autonomous output with a small reviewed reference set.

Not initially in scope:

- Complete-corpus enrichment.
- Personalized savings plans.
- Social media or newsletter publication.
- Public user interaction.
- Account management.
- Broad autonomous discovery.
- Personalized legal, tax, investment, debt, insurance, or regulatory guidance.
- Production database authority.
- Autonomous code, prompt, skill, or policy modification.

The Librarian should write to a candidate workspace or staging database. Promotion to trusted knowledge is a separate operation, even if the proof of concept later tests automatic promotion for high-confidence low-risk fields.

### Version 0.0.1 corpus slice

Version 0.0.1 should select records from the two existing sources that relate materially to one or more of:

- Hosted model inference and completion APIs.
- Model access, routing, and gateways.
- Embeddings, vector search, and retrieval infrastructure.
- AI agents and agent-building platforms.
- Model training, fine-tuning, evaluation, and observability.
- AI development environments and notebooks.
- GPU, accelerator, and compute access.
- Virtual machines and virtual development computers when reasonably usable for AI work.
- Cloud credits or startup programs that can fund these capabilities.
- Supporting AI media or automation products only when the underlying capability is sufficiently concrete.

This is a relevance slice, not a claim that every included record belongs to one exclusive category. Borderline records should carry inclusion reasons and confidence.

### Version 0.0.1 matching model

The Librarian should produce a small knowledge graph rather than assign one flat category.

Each source record may map to:

- Zero or one normalized product candidate.
- Zero or more opportunity candidates.
- One or more capabilities.
- One or more outcome-oriented user needs.
- Zero or more requirements and restrictions.
- Zero or more relationships to other records.

Initial user-need vocabulary:

- I need to call an AI model through an API.
- I need free or discounted model inference.
- I need to compare or route between models.
- I need embeddings or semantic search.
- I need to build an AI agent.
- I need to train or fine-tune a model.
- I need to evaluate or monitor an AI system.
- I need a GPU or accelerator.
- I need a notebook or hosted AI development environment.
- I need a virtual computer or VM.
- I need cloud credits for an AI project.
- I need to generate text, code, images, audio, or video.

Initial relationship vocabulary:

- Same product.
- Same vendor.
- Public free tier for product.
- Startup offer for product or vendor.
- Possible duplicate.
- Alternative to.
- Can be combined with.
- Requires or is accessed through.
- Broader cloud credit that may fund.

The Librarian may propose these relationships but should not assert compatibility, stacking, or equivalence unless the supplied source text states it explicitly.

### Version 0.0.1 outputs

Recommended outputs are:

- `source_records`: lossless selected entries from both supplied sources.
- `products`: normalized product candidates with stable local IDs.
- `opportunities`: free tiers, credits, programs, and discounts separated from products.
- `capabilities`: controlled functional tags.
- `user_needs`: outcome-oriented entry points.
- `requirements`: structured explicit conditions plus unknown values.
- `relationships`: proposed links with confidence and explanation.
- `librarian_runs`: model, provider, prompt, input, output, latency, token, and error metadata.
- `review_items`: ambiguous, unsupported, conflicting, and low-confidence proposals.
- A human explorer centered on user needs rather than vendors.
- A compact evaluation report comparing a reviewed sample with Librarian output.

Every derived field should include derivation status:

- Source-stated.
- Deterministically parsed.
- Model-proposed.
- Human-reviewed.
- Unknown.

Version 0.0.1 should not imply current official verification. It organizes what the supplied catalogs claim.

## Open decisions and questions

Questions are grouped by when they become consequential. Items marked **early** affect the initial architecture or first vertical slice.

The initial audience, flagship outcome, first geography, savings horizon, operating-cost target, and preferred/fallback cloud providers are now resolved in **Confirmed initial decisions**. The matching questions below remain as historical design prompts but no longer block the first implementation.

### Product and audience

1. **Early:** Is Brokie initially for anyone saving money, specifically founders and developers, or founders first with broader expansion later?
2. **Early:** Should the first flagship outcome be launching a SaaS, or is there another outcome you care about more personally?
3. Is the voice prominently playful everywhere, or playful in the assistant and reports while the evidence interface stays neutral?
4. Should Brokie optimize primarily for minimum cash spend, or let users explicitly trade money against time, complexity, privacy, and lock-in?
5. Is this intended to become a public product, an open-source project, a private personal agent, or an experiment until it proves useful?

### Geography and applicant profiles

6. **Early:** Which country or countries should the first eligibility model support?
7. Should personal projects, unincorporated founders, incorporated startups, nonprofits, students, educators, and open-source projects all be first-class profile types?
8. May a saved profile contain sensitive company facts such as funding, revenue, existing vendors, and accelerator membership?
9. Should profiles be local-only by default, or eventually synced behind user accounts?

### Savings and recommendation policy

10. **Early:** What does "savings" mean: advertised benefit, expected usable value, avoided market cost, or a comparison against what the user currently pays?
11. **Early:** What default planning horizon should recommendations use: monthly, first year, two years, or user-specified only?
12. Should time-limited credits rank above durable free tiers when they provide substantially more short-term value?
13. How should Brokie value the user's setup time and future migration work?
14. Should plans include opportunities that require sales calls, referrals, accelerator membership, or extensive applications?
15. Should commission-bearing affiliate links ever be allowed, and if so, how visibly must ranking independence be disclosed?

### Evidence and autonomy

16. **Early:** May Brokie automatically update verified facts when an official page changes clearly, or must all material changes receive human approval initially?
17. How long may evidence remain unverified before a result is demoted or hidden?
18. Is an official application page enough evidence, or should Brokie also seek terms, pricing, and documentation?
19. May archived or cached evidence be stored when provider terms permit it, or should the database retain only short supporting passages and hashes?
20. What should happen when official sources conflict with an aggregator or with each other?
21. Should users be able to submit corrections and opportunities, and what evidence must they provide?

### Crawling, models, and cost

22. **Early:** What is the acceptable monthly operating budget—including the target answer of zero—and is there a hard spending ceiling Brokie must never cross?
23. Can the maintainer use limited paid APIs or models when free allowances are unavailable, or must every dependency have a durable free path?
24. Are local models acceptable on the small VM, or should extraction rely primarily on rules and occasional external model calls?
25. How aggressive may crawling be, and should Brokie restrict itself to known pages and explicit discovery sources initially?
26. Should it obey provider robots directives even when a page is publicly accessible? The recommended answer is yes.

### Deployment and ownership

27. **Early:** What free VM or hosting environment do you already have, if any?
28. Does the first deployment need a public domain and HTTPS, or can it remain local/private?
29. Who will review ambiguous changes and how often?
30. What backups are available, and where may snapshots and the SQLite database live?
31. Should Brokie be able to modify its own code, or only its data and job schedule? The recommended initial boundary is data only.

### Scope and source policy

32. Should grants, competitions, cash awards, tax credits, and government programs be in the same product or a related index?
33. Are discounts useful enough to include when the resulting product remains expensive?
34. Should benefits whose application requires joining a paid aggregator be indexed?
35. Should self-hosted software appear when it lowers spending, even though the current free-for-dev source intentionally excludes it?
36. Should secondhand marketplaces, lifetime deals, community giveaways, and referral codes be excluded for trust and stability?

## Working recommendations for unanswered questions

Until decisions are made, the safest initial assumptions are:

- Start with founders and developers launching a small SaaS.
- Support the United States first while keeping geography extensible.
- Optimize for total cash cost over twelve and twenty-four months, with setup complexity and lock-in shown separately.
- Include permanent free tiers, startup credits, and discounts, but never compare them as if they were equivalent.
- Use official primary sources for verified status; use aggregators only for discovery.
- Require review for material factual changes during the first maintenance phase.
- Keep user profiles local and avoid collecting unnecessary sensitive data.
- Give the maintainer a hard zero-dollar default budget and explicit caps for every external service.
- Allow Brokie to update its data and observations, not its own application code.
- Begin with known pages and polite, low-volume refreshes.
- Store compact evidence passages and hashes rather than unrestricted page archives.
- Keep the playful personality out of eligibility facts and evidence wording.

## Decision agenda before committing an implementation goal

The next discussion should resolve or deliberately defer the following questions. These are ordered to prevent premature technical decisions.

### 1. Product boundary

- Is personalized savings planning the initial product, with autonomous publishing added later?
- Which opportunity families belong in the first public promise?
- Does Brokie initially serve only founders and developers, or should its data model immediately include broader personal savings goals?

### 2. Trust and liability posture

- Which claims require human review regardless of evidence confidence?
- Which topics will Brokie decline or treat as general information only?
- What correction, dispute, and takedown process should exist before public posting begins?

### 3. First autonomous role

- Should the first live agent be the Librarian, Planner, Correspondent, or Operator?
- What exact actions may it complete without approval?
- What measurable result would justify increasing its autonomy level?

### 4. Harness experiment

- Which identical maintenance tasks should be run through Pi, Hermes, fx, and a minimal custom loop?
- How will we score accuracy, cost, latency, recoverability, observability, and unsafe action attempts?
- Should Hermes be evaluated first as a discovery/public-persona worker rather than as the trusted database maintainer?

### 5. Model experiment

- Which local models fit and perform acceptably on the selected Oracle shape?
- Which extraction and eligibility tasks form the initial evaluation set?
- Which remote providers have an acceptable zero-cost path and hard spending controls?
- At what confidence or task type must work escalate from local model to remote model or human?

### 6. Social identity and channels

- Which one public channel should Brokie learn first?
- Will the account clearly identify itself as autonomous or AI-assisted?
- What voice, posting frequency, reply policy, and prohibited interactions apply?
- Who holds account recovery authority and reviews early publications?

### 7. Commercial integrity

- Will affiliate links or sponsorships be allowed?
- How will organic ranking remain independent and auditable?
- What business model best aligns revenue with verified user savings?

### 8. Deployment boundary

- Which Oracle tenancy, region, network, and VM shape will host the experiment?
- Will the first service be private, allowlisted, or public?
- Where will encrypted backups and secrets live?
- What is the emergency stop mechanism for agents, publication, and external API use?

Only after this agenda is sufficiently resolved should the preliminary sequence become a concrete plan with an active goal, milestones, acceptance criteria, resource budgets, and deployment authorization.
