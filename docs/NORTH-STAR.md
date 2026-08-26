# Brokie north star

Status: authoritative living product direction

Last reconciled: 2026-08-24

Current release: `0.1.1`

This document exists so implementation details cannot quietly replace the product. It records the current long-term mission, role boundaries, trust model, and sequencing decisions. The product brief remains the detailed decision archive; this is the compact source of truth.

## One-sentence product

Tell Brokie what you want to accomplish, and it will find the cheapest credible way to do it using free tiers, credits, grants, discounts, and startup programs.

## Product thesis

People do not fundamentally want a vendor directory or a pile of coupons. They want to accomplish an outcome while spending less money.

The catalog is supporting infrastructure. The eventual product is an evidence-backed savings plan that explains:

- what to use;
- whether the searcher likely qualifies;
- present, future, and post-offer costs;
- realistic cash savings over twelve and twenty-four months;
- setup effort, constraints, expiration, compatibility, and stacking;
- migration and lock-in risk;
- the evidence, freshness, uncertainty, and assumptions behind every material claim.

The public mission is intentionally broader than software. Initial coverage emphasizes software, developer services, cloud resources, AI inference, virtual compute, and startup programs because those are the strongest available collections.

The first audience is founders and developers. The first flagship outcome is launching a small subscription SaaS as cheaply as credibly possible. United States eligibility comes first, with geography represented extensibly.

## Long-term autonomous loop

```text
Scout discovers and acquires useful source material
  -> evidence packets enter the Librarian
  -> the Librarian maintains typed catalog knowledge
  -> the Planner assembles credible savings plans
  -> the Correspondent publishes useful findings
  -> the Community Agent answers questions and collects corrections
  -> usage reveals missing goals and weak evidence
  -> Scout and Librarian improve coverage
  -> the loop repeats within explicit permissions and zero-dollar budgets
```

"Fully autonomous" means the roles continuously pursue the mission inside structural boundaries. It does not mean one model receives every credential or that arbitrary generated actions are authorized.

## Role boundaries

### Scout

Purpose: go looking for useful source material and bring back what it found.

The Scout:

- accepts a seed such as a repository, webpage, post, document, or collection;
- uses bounded file, HTTP, or browser tools to look for material about free things;
- preserves what it acquired, where it came from, and what it could not access;
- may choose which supplied link to open next, but does not interpret the source;
- never extracts catalog facts, judges authority, reconciles conflicts, resolves identity, assigns ontology, or publishes.

The Scout's handoff is an immutable, versioned `ScoutPacket`, not a catalog record.

### Librarian

Purpose: turn Scout packets into maintained catalog knowledge.

The Librarian:

- consumes one or more packets about a suspected subject;
- inspects the acquired material, selects exact evidence, and judges source relationships;
- resolves or defers canonical product identity and deduplicates across sources;
- separates products from opportunities and splits one listing into zero or more typed opportunities;
- models benefits, limits, requirements, applicability, eligibility, links, time, and ambiguity;
- assigns supported capabilities and need-first categories;
- reconciles new observations with immutable history;
- requests supplemental Scout investigation when evidence is insufficient;
- creates candidate revisions, research requests, and review items;
- never selects a personalized recommendation or publishes promotional material.

### Planner

Purpose: help a human or agent accomplish a stated goal for less money.

The Planner interprets requirements and profiles, evaluates likely eligibility, combines compatible products and opportunities, compares cost horizons, and explains tradeoffs, assumptions, expiration cliffs, and migration risks with citations.

### Correspondent

Purpose: turn published knowledge and plans into useful public material.

The Correspondent may eventually create opportunity highlights, comparisons, recipes, changelogs, newsletters, RSS entries, and social posts. It generates only from approved facts and plans.

### Community Agent

Purpose: answer supported questions, collect corrections and submissions, and turn recurring requests into structured coverage gaps. It does not hold production database, cloud-owner, billing, or account-recovery credentials.

### Growth Agent

Purpose: improve useful reach without changing evidence, eligibility, or ranking. Commercial incentives must remain visible and independent from organic recommendation ranking.

### Operator

Purpose: keep Brokie healthy and inside its resource budget. It monitors jobs, APIs, storage, backups, quotas, inference, and costs; retries or restarts only known bounded operations; and does not autonomously expand infrastructure or rewrite production code initially.

## Scout packet boundary

The normal handoff is approximately one packet per discovered listing or subject seed, not one packet per final opportunity.

```text
one collection listing
  -> one Scout packet
  -> zero, one, or many products
  -> zero, one, or many opportunities
```

A packet should preserve:

- discovery source, collection version, locator, and raw listing;
- a source label and discovered URL without asserting canonical identity;
- fetched raw artifacts and deterministic readable representations;
- final URLs, redirects, HTTP or Git metadata, timestamps, hashes, and acquisition failures.

Operational model routes, budgets, and traces belong in the linked Scout run ledger rather than in the evidence identity. Findings, evidence selection, authority, conflicts, and unanswered catalog questions belong to the Librarian.

Packet acquisition depth is explicit:

- `discovered`: the collection listing or mention is preserved;
- `resolved`: the listed target was fetched and redirects were resolved;
- `followed`: the Scout opened one additional supplied link;
- `blocked`: acquisition could not continue.

The complete collection may be represented by inexpensive discovered packets while only prioritized packets receive deeper investigation.

## Sources and lineage

The initial dogfood sources are:

- the `free-for-dev` GitHub repository, consumed read-only and versioned by Git commit;
- the private `grants-offers/startup-offers.csv` collection;
- the Bags.fm deals source and an Om Patel post on X/Twitter from which much of that CSV was reportedly assembled.

The exact Bags.fm and Om Patel source URLs remain to be recorded. Until lineage and redistribution terms are understood, the private CSV must not be committed to the public Brokie repository.

Aggregator and social-post evidence is useful for discovery but does not become officially verified merely because the Scout acquired it. Official pricing, documentation, terms, or application sources are preferred for verified catalog status.

## Trust and data principles

- Thin prompts, thick harnesses.
- Models may propose; deterministic typed code owns validation, identity plans, evidence integrity, economics, persistence, budgets, and publication state.
- Preserve exact source evidence and explicitly distinguish stated, parsed, inferred, model-proposed, human-reviewed, verified, disputed, stale, and unknown information.
- Keep product function separate from savings terms.
- Keep benefits, constraints, conditions, applicability, execution location, and uncertainty structurally separate rather than encoding them as fuzzy tag strings.
- Do not infer compatibility, stacking, ownership, eligibility, duration, or public availability from silence.
- Record confidence and model behavior as run metadata where useful; do not treat model confidence as semantic truth.
- Accepted, rejected, deferred, disputed, and failed outputs remain inspectable calibration evidence.
- Repeated acquisition and ingestion are idempotent. Removals become explicit tombstones or superseding observations, not silent deletion.
- Passing schema validation never implies publication.
- Agents may update observations and data under policy; they do not autonomously change Brokie's application code initially.

## Public autonomy and identity

Brokie should openly identify itself as an autonomous AI system operating through free infrastructure, free inference, free accounts, and other zero-cost resources. That constraint is part of the charm and the research value.

The long-term ambition includes a fully autonomous newsletter and publishing across relevant channels, including short-form video and posts for TikTok, Instagram, and Facebook. This is not current scope.

Autonomy advances separately for each channel and action type:

1. drafts only;
2. approved deterministic formats;
3. bounded supported replies;
4. bounded autonomous campaigns;
5. commercial relationships only with explicit human authority.

A human owner retains account recovery and ultimate control. Brokie receives only the credential scopes required for its assigned role. Public claims must remain traceable to published catalog revisions so stale material can be corrected, annotated, removed, or superseded.

Initial subject scope excludes personalized legal, tax, investment, debt, insurance, banking, medical, and regulatory advice. These areas may be considered later only with an appropriate evidence, safety, and liability model.

## Cost, inference, and deployment

- Default and target operating cost: exactly zero dollars.
- Every external service receives an explicit request, token, storage, and spend budget.
- Never silently fall back to paid inference.
- Prefer provider-neutral free remote inference, including OpenRouter free routing and compatible NVIDIA NIM endpoints.
- A configured Gemini key may be used only when the operator explicitly authorizes that paid provider for the command; key presence alone is not permission to spend.
- Record requested and resolved provider/model identity for every run.
- Local quantized models are optional fallbacks or experiments, not foundational dependencies.
- OMP is the initial bounded worker harness. It owns model authentication, provider
  mechanics, retries, quotas, and sessions; Brokie retains typed tools, route permission,
  budgets, durable state, and publication policy. The boundary remains replaceable.
- Develop and evaluate locally before assigning autonomous external actions.
- Preferred deployment target: one Oracle Cloud VM provisioned through the Oracle CLI.
- Fallback deployment target: Google Cloud through the Google Cloud CLI.
- Core storage, scheduling, evidence, and API behavior remain portable to an ordinary Linux VM.
- Do not build a distributed system merely because several free VMs are available; add isolation only when measurements justify it.
- Before provisioning, verify current free-tier shapes, storage, egress, tenancy eligibility, and other assumptions against official provider terms.

## Current state: release 0.1.1

`0.1.0` proved the typed Librarian transaction. `0.1.1` hardens and connects its trusted publication path:

- versioned candidate schema and controlled vocabulary;
- exact evidence and semantic validation;
- deterministic normalization;
- stable product and opportunity identity;
- immutable revision storage;
- one bounded model repair attempt;
- free OpenRouter and NVIDIA provider adapters;
- inspectable traces and retained calibration failures;
- recoverable `trust`, `reject`, and `request_revision` review events separated from model output;
- trusted typed publication views served through the read-only API and explorer;
- published capability search, coverage reporting, scoped evidence retrieval, and an OpenAPI contract;
- bounded API validation and typed regression fixtures;
- a legacy source refresh worker and Linux service skeleton.

It is not yet a continuous autonomous Librarian or an end-user savings product.

The trusted typed read path is now connected. The principal remaining integration debt is that source acquisition and refresh still use the legacy path:

```text
legacy deterministic importer -> legacy snapshots and refresh
single-record typed Librarian  -> typed review/trust -> typed API and explorer
```

The Scout-to-Librarian loop must replace the legacy acquisition boundary while preserving the working trusted publication projection.

## Next milestone: Scout-to-Librarian loop

The next implementation milestone should resist broad platform work and establish the smallest real information-acquisition loop:

1. Define and validate `ScoutPacket` and Scout run contracts.
2. Give a bounded Scout generic repository, file, Markdown, CSV, JSON, HTTP, and browser acquisition tools.
3. Dogfood five representative free-for-dev listings and review every packet.
4. Fan out the free-for-dev repository into inexpensive discovered packets without hardcoding free-for-dev into the Scout core.
5. Dogfood the private startup-offers CSV as a structurally different collection while preserving its reported lineage.
6. Let the existing Librarian consume packets, deduplicate subjects, and create typed candidate revisions.
7. Support typed Librarian requests for additional source acquisition.
8. Make acquisition and ingestion repeatable, resumable, idempotent, budgeted, and change-aware.
9. Complete refresh convergence on accepted typed revisions while preserving the typed API and explorer introduced in `0.1.1`.
10. Deploy the closed local loop to one Oracle VM for an unattended soak before adding public autonomy.

The Scout may explore unfamiliar sources and compile successful acquisition paths into replayable plans. Those plans are versioned run artifacts, not source-specific behavior embedded in the core architecture. Bulk work should replay deterministically until validation indicates that the source changed enough to require the Scout again.

## Later horizons

After the Scout-to-Librarian loop is trustworthy:

- verify a prioritized subset against official sources;
- model profiles and explainable eligibility;
- implement compatibility, exclusions, stacking, cost horizons, and migration risk;
- build the Planner and natural-language need-first experience;
- stabilize structured API, CLI, MCP, and agent-skill distribution;
- build retrieval, eligibility, planning, and freshness evaluations;
- deploy Operator monitoring, encrypted backups, emergency stops, and zero-cost reporting;
- introduce Correspondent, Community, and Growth roles through staged public autonomy;
- expand beyond software without changing the core promise.

## Success criteria

The project is progressing toward the north star when:

- unfamiliar sources can be investigated without bespoke core code;
- every material catalog fact is traceable through packets and observations to evidence;
- source changes do not cause silent loss, duplication, or factual overwrite;
- users can search by desired outcome without knowing vendor names;
- recommendations disclose eligibility uncertainty, future cost, expiration, and risk;
- external agents can consume structured cited results without scraping the UI;
- a prioritized catalog subset remains fresh unattended under a verified zero-dollar budget;
- public content is generated only from published knowledge and remains correctable;
- broader coverage improves useful savings without weakening evidence standards.

## Unresolved strategic details

- Exact source URLs and redistribution constraints for Bags.fm and the Om Patel post.
- Model and provider bake-offs within the initial OMP worker boundary.
- Packet completeness thresholds for different source and opportunity shapes.
- How much official-source investigation is required before initial publication.
- The first public channel and its staged autonomy evaluation.
- Affiliate, sponsorship, and revenue policy that preserves ranking independence.
- Oracle tenancy, region, VM shape, secrets, backup destination, and emergency-stop design.

These details may change. The mission, role separation, typed evidence discipline, zero-dollar constraint, and staged autonomy should not change accidentally during implementation.
