# Librarian v0.2 ten-listing evaluation

Date: 2026-08-26

Status: completed; bulk queue remains paused

## Question

Can the simplified Librarian turn a small, varied set of collection-only Scout packets into faithful review candidates through several free or explicitly authorized quota routes?

This is a classification evaluation of the retained free-for-dev collection listings. It is not current official verification. None of the candidates were trusted or published.

## Boundaries

- Source state: `var/pipeline-url-final2`
- Source repository revision: `99d188953fbb2c7c522b97398f4830b91b58016f`
- Evaluation state: `var/librarian-v0.2-ten-2026-08-26`
- Ten distinct listings, sixteen provider jobs, and at most two calls per job
- Maximum model calls: 32; actual model calls: 21
- Per-call timeout: 120 seconds
- OMP tools, sessions, extensions, skills, rules, and thinking were disabled
- No paid route and no fallback route
- No web fetches or Scout changes
- The main 1,291-packet queue was not consumed or reordered

Exact command:

```powershell
npm run eval:librarian:v02:ten
```

The ignored runtime directory retains the per-job SQLite state, catalog, trace, raw provider response, proposal, compiled candidate, and result summary. The committed configuration is `evaluations/librarian-v0.2-ten.json`.

## Sample

| Listing | Why it is in the sample |
| --- | --- |
| Google AI Studio | Multiple rate limits, abbreviated magnitudes, and model-specific allowances |
| Brave Search API | Money, monthly cadence, explicit card requirement, and API taxonomy |
| CloudWatch | Deliberate generic-monitoring versus AI-observability trap |
| Kaggle | Several compute resources and verification-scoped limits |
| telemetry.dev | Supported AI-observability anchor, limits, retention, and no-card evidence |
| ShipStatic | No-cost access, explicit negative requirements, and a paid exclusion |
| What Is My IP | Generic API versus model API and a simple no-cost claim |
| Transcript LOL | Daily usage allowance and explicit signup language |
| Revdoku | Multiple resources with nested capacity and item-size limits |
| DB Designer | Clear offer whose product function is absent from the current capability vocabulary |

Google AI Studio, Brave Search API, and CloudWatch ran on all three routes. The other seven listings each ran on one route.

## Route results

| Route | Class | Jobs | Calls | Reported input/output tokens | Provider failures |
| --- | --- | ---: | ---: | ---: | ---: |
| `google-antigravity/gemini-2.5-flash-lite` | quota | 5 | 7 | 25,706 / 1,044 | 0 |
| `nvidia-nim/minimaxai/minimax-m3` | free | 5 | 5 | 44,821 / 8,808 | 0 |
| `xai-oauth/grok-4.20-0309-non-reasoning` | quota | 6 | 9 | 20,082 / 1,240 | 2 |

Provider token accounting is not directly comparable. NVIDIA completed every assigned job in one call but reported much larger token usage. Gemini completed all jobs but needed repairs for Brave's money shape and telemetry.dev's retention shape. xAI failed Brave and Kaggle after using its one repair, because it persisted with unsupported audience values.

## Adversarial semantic review

`clean` means faithful enough to the supplied collection listing for review. It does not mean verified or publishable. `safe defer` means the final candidate withheld the questionable opportunity rather than inventing a nearby capability.

| Job | Calls | Verdict | Review finding |
| --- | ---: | --- | --- |
| Google AI Studio / Gemini | 1 | needs revision | Captured all six limits, but `model_api` and “prompt engineering” exceed the listing's explicit function evidence. |
| Google AI Studio / NVIDIA | 1 | needs revision | Captured all six limits, but over-selected `model_api` and used cadence words as quantity source units. |
| Google AI Studio / xAI | 2 | needs revision | Dropped the offer during repair and proposed unsupported code-generation and research capabilities. |
| Brave Search API / Gemini | 2 | clean | Correct search/retrieval capabilities, USD 5 monthly credit, and required card after one mechanical repair. |
| Brave Search API / NVIDIA | 1 | clean | Correct search/retrieval capabilities, USD 5 monthly credit, and required card. |
| Brave Search API / xAI | 2 | provider failed | Treated card verification as audience eligibility, then invented unsupported `verified_users`. |
| CloudWatch / Gemini | 1 | needs revision | Correctly parsed quantities but converted generic cloud monitoring into `ai_observability`. |
| CloudWatch / NVIDIA | 1 | safe defer | Used no controlled capability, so the compiler withheld the offer; its unpersisted account requirement was unsupported. |
| CloudWatch / xAI | 1 | needs revision | Invented both `ai_observability` and `agent_infrastructure`. |
| Kaggle / xAI | 2 | provider failed | The route could not represent phone and identity verification without inventing audience vocabulary. |
| telemetry.dev / Gemini | 2 | needs revision | Core capability, span limit, project/seat limits, and no-card condition were good; retention was flattened into an entitlement because the small proposal lacks constraints. |
| ShipStatic / xAI | 1 | needs revision | Found hosting and no-cost access, but inflated agent operability into infrastructure and omitted the explicit negative requirements and paid custom-domain exclusion. |
| What Is My IP / NVIDIA | 1 | safe defer | Product function was good, but it missed the explicit no-cost benefit and emitted no opportunity. |
| Transcript LOL / Gemini | 1 | needs revision | Daily transcription allowance was correct; explicit signup and no-external-key facts were omitted. |
| Revdoku / xAI | 1 | needs revision | Produced no function description, inflated agent compatibility, and flattened database/file limits that need nested constraints. |
| DB Designer / NVIDIA | 1 | safe defer | Product and two limits were recognized; the offer was correctly withheld because no controlled capability fits database design. |

Totals:

- 2 clean jobs
- 3 safe deferrals
- 9 candidates needing semantic revision
- 2 provider failures
- 11 of 16 jobs were mechanically valid in one call

The bulk-processing gate does not pass. Mechanical JSON reliability is no longer the principal problem; semantic precision and the deliberately narrow contract are.

## Ten candidate summaries

1. Google AI Studio: Gemini and NVIDIA extracted the numerical offer well, but capability scope still needs review; xAI lost the offer on repair.
2. Brave Search API: Gemini and NVIDIA produced the strongest outputs in the evaluation; xAI exposed a provider-specific contract-following failure.
3. CloudWatch: the current vocabulary lacks generic cloud monitoring, and two routes substituted AI concepts. The safe result is product-only until vocabulary coverage improves.
4. Kaggle: the source has useful compute evidence, but the current small condition shape cannot express phone and identity verification faithfully. No candidate survived.
5. telemetry.dev: the core result is useful, but retention must remain a constraint rather than an included resource.
6. ShipStatic: the base hosting offer is recognizable, while requirements, exclusions, and agent operability need better separation.
7. What Is My IP: the product classification is useful but the savings opportunity was missed.
8. Transcript LOL: the central allowance is useful; its stated signup and external-key conditions were not preserved.
9. Revdoku: the flat proposal cannot faithfully retain nested limits, so this candidate should not be trusted as-is.
10. DB Designer: the safe product-only result demonstrates a real capability-vocabulary gap rather than a model failure that should be repaired into a nearby tag.

## Corrections made from the evidence

Two small generic harness corrections were added after retaining the original run:

1. High-risk capabilities now require defining words in the listing before compilation. This blocks examples such as generic metrics becoming AI observability, remote desktop becoming a virtual machine, and agent-operable static hosting becoming agent infrastructure. The model proposal remains visible in the trace; the unsupported facet and dependent opportunity are withheld.
2. When a model supplies the cadence word as a quantity's source unit, the compiler replaces it with the normalized quantity unit and records the action. For example, `request` remains the unit and `minute` remains the cadence.

Regression tests cover both changes. The retained evaluation traces were not rewritten.

## Deliberate TODOs and gaps

- Propose and review versioned capabilities for generic cloud monitoring and database design. Do not silently mutate vocabulary `0.1.0` or use nearby tags.
- Decide the smallest representation for constraints and nested targets before accepting telemetry.dev or Revdoku shapes.
- Represent non-audience verification requirements such as phone and identity verification without turning them into eligibility groups.
- Preserve explicit external-credential facts such as “no API key needed” in a later compact condition shape.
- Improve missing-condition recall without adding source-specific parsing.
- Choose a primary bulk route only after a second reviewed sample. NVIDIA was mechanically steady but expensive in reported tokens; Gemini required repairs; xAI had two bounded failures.
- Collection-only evidence remains unverified aggregator evidence. Official-source acquisition is a later Librarian research request, not part of this run.

## Decision

Keep the simplified boundary and the two deterministic guards. Do not resume all 1,291 queued packets, add paid fallback, or expand Scout. The next bounded step is a small versioned vocabulary/constraint design informed by this report, followed by another representative batch.
