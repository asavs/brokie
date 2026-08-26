# Simplified Librarian v0.2

Status: active `0.2.1` development boundary

## Job

The Librarian reads one Scout listing and proposes how that material fits the existing catalog. It does not browse, publish, invent unsupported facts, or manufacture durable catalog bookkeeping.

```text
Scout listing
  -> small semantic proposal
  -> deterministic compiler
  -> existing catalog candidate validation
  -> immutable candidate revisions
  -> review required
```

## What the model returns

The model returns only:

- a function-only description or `null`;
- zero or more exact controlled capability IDs;
- either no evidenced offer or one collection-local offer;
- compact entitlements;
- explicitly stated boolean and audience conditions.

It does not return source snapshot IDs, evidence IDs, catalog IDs, local keys, support envelopes, organization roles, links, comparison candidates, review state, the catalog schema, or the full vocabulary document.

The request contains only the source name and URL, the bounded collection listing, the allowed capability IDs, and normalized units. Page browsing and official verification remain separate work.

## What Brokie adds deterministically

Brokie:

- selects the exact collection listing as the evidence span;
- copies observation and snapshot metadata;
- creates stable local keys and support envelopes;
- preserves the listed URL as a `source` link rather than claiming it is canonical;
- defaults numeric comparators to `exact`;
- normalizes common comparator aliases such as `eq`, `lte`, and `gte`;
- expands explicit thousand/million/billion magnitude units;
- fills empty condition arrays and harmless cost-scope unknowns;
- removes unknown capability IDs;
- withholds a small set of high-risk capabilities when the listing lacks their defining evidence;
- prevents cadence words from becoming quantity source units;
- withholds an offer when no controlled capability survives;
- compiles into the existing v0.1 catalog candidate contract;
- validates, persists, and sends successful candidates to review without publishing them.

The v0.1 Librarian remains available and unchanged at its public CLI boundary. The v0.2 packet worker selects the simplified path.

## Failure policy

- Invalid JSON or an unrecognized semantic shape receives at most one compact repair request.
- Provider errors remain provider errors. No paid fallback is selected.
- Common formatting differences are normalized instead of consuming a repair call.
- Unknown vocabulary is a visible downgrade, not a reason to invent the nearest tag.
- The original provider response, parsed proposal, compiler actions, usage, resolved route, compiled candidate, and validation failures remain in the ignored run trace.
- Every successful candidate still requires review before publication.

## Live development evidence

The retained ignored state is:

`C:\Users\asas\Projects\brokie\main\var\pipeline-url-final2`

The current queue contains 1,291 unprocessed packets and eight review-required results. The live samples deliberately stopped there.

The later ten-listing, sixteen-job multi-route evaluation is recorded in
[`evaluations/LIBRARIAN-V0.2-TEN-2026-08-26.md`](evaluations/LIBRARIAN-V0.2-TEN-2026-08-26.md).
It produced two clean jobs, three safe deferrals, nine candidates needing semantic
revision, and two bounded provider failures. Bulk processing remains paused.

Observed route behavior:

- Gemini Flash Lite accepted a Chrome Remote Desktop proposal in one call with 3,296 input and 73 completion tokens after mechanical normalization was added. The candidate incorrectly selected `virtual_machine`, demonstrating the current vocabulary/semantic-review gap.
- xAI OAuth returned a sparse Amazon Web Services collection heading as a truthful product-only result in one call with 556 input and 20 completion tokens.
- xAI OAuth extracted a CloudWatch offer in one call with 768 input and 149 completion tokens, but proposed the too-narrow `ai_observability` capability and initially represented `1M` as a magnitude-bearing primitive. Magnitude expansion is now deterministic; the capability remains a review failure.
- NVIDIA NIM MiniMax extracted six Google AI Studio limits but initially omitted exact comparators. Exact numeric comparators are now deterministic defaults.
- A post-fix NVIDIA CloudFront run completed in one call. It extracted three entitlements, then Brokie withheld the offer because no existing capability exactly described CDN service. The compiler action is retained instead of selecting an approximate capability.

Provider token accounting varies substantially. The post-fix CloudFront request reported 8,915 input and 3,749 completion tokens through NVIDIA, while the detailed CloudWatch request reported 768 input and 149 completion tokens through xAI. Harness and provider overhead therefore remain part of route evaluation even with the same compact Brokie contract.

## Known limits

- The v0.1 capability vocabulary is too narrow for broad free-for-dev coverage. Missing concepts must not be replaced with semantically adjacent IDs.
- One whole collection listing is currently the selected evidence span. It is exact and bounded, but not yet claim-minimal.
- The model can still write a poor function description or misclassify a supported capability; deterministic validation cannot prove semantic correctness.
- A collection listing can establish an unverified candidate, not current official truth.
- Canonical identity, cross-packet deduplication, supplemental Scout acquisition, and official verification remain later steps.
- OMP is still an external, unpinned harness, and provider usage accounting is not directly comparable across routes.

## Bulk-processing gate

Do not resume the remaining queue yet. First review a small representative set and require:

1. one-call mechanical validity for ordinary supported listings;
2. no nearest-tag capability substitutions;
3. correct magnitude, cadence, and entitlement interpretation;
4. truthful product-only output when the listing or vocabulary is insufficient;
5. visible compiler actions and provider failures;
6. a selected route whose latency and reported token use are reasonable for the queue.

The next improvement is controlled-vocabulary coverage and a reviewed multi-model sample, not a more complicated Librarian prompt.
