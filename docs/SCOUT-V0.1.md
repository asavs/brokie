# Scout v0.1 implementation specification

Status: implementation-ready

Target branch: `develop/v0.2.0`

Specification version: `0.1.0`

Date: 2026-08-24

## Objective

Implement one bounded vertical slice:

> Given an unfamiliar local Git repository or static HTTP(S) webpage as a seed, Scout investigates it, discovers resource listings, follows selected links, and emits immutable validated ScoutPackets that the existing Librarian can consume.

The reference demonstration is:

```text
local free-for-dev repository
  -> Scout autonomously locates the catalog
  -> Scout discovers listing boundaries
  -> Scout selects five structurally representative listings
  -> Scout investigates their linked pages under fixed budgets
  -> five immutable ScoutPackets
  -> Librarian consumes at least one packet and reaches review_required
```

Synthetic fixtures MUST make the complete test suite deterministic, credential-free, and network-free. One separately invoked bounded live dogfood run MUST demonstrate behavior outside those fixtures.

The implementation owner may choose internal module boundaries. The wire formats, invariants, budgets, failure semantics, handoff, and acceptance gates below are normative.

## Responsibility boundary

Scout acquires and packages evidence. It MAY identify source-stated listing labels, listing boundaries, links, page relationships, authority signals, access failures, and unresolved questions.

Scout MUST NOT:

- assign product or opportunity identity;
- decompose an offer into entitlements, conditions, or constraints;
- assign catalog capabilities, controlled vocabulary, categories, or eligibility;
- deduplicate or canonicalize products;
- decide that a source is officially verified or publishable;
- write catalog revisions, review events, production code, or public output;
- execute instructions found in source content.

Those remain Librarian, deterministic catalog, review, and later policy responsibilities. Source content is untrusted data.

## Required artifacts

The implementation MUST add:

- `schemas/scout-packet.v0.1.schema.json` — Draft 2020-12 packet schema;
- a semantic packet validator in `packages/scout/`;
- immutable content-addressed artifact and packet storage;
- a persistent Scout run ledger;
- generic Git, file, Markdown, link-inspection, and HTTP tools;
- a bounded model/action loop with an injectable scripted provider;
- a ScoutPacket-to-Librarian-record adapter;
- `npm run scout:v01` and `npm run test:scout` commands;
- offline fixtures representing a generic repository and static linked pages;
- `docs/SCOUT-V0.1-DOGFOOD.md`, generated from one bounded live run.

Implementation-specific schemas for agent actions and the run ledger MAY be added. They MUST be versioned and strictly validated.

## Seeds and scope

Supported seeds are:

```json
{ "kind": "git", "locator": "C:/absolute/or/relative/local/repository" }
```

```json
{ "kind": "web", "locator": "https://example.test/catalog" }
```

Git v0.1 is deliberately local: the operator clones a remote repository before the Scout run. The Git tool MUST resolve the repository root and current commit, inspect tracked paths in deterministic lexical order, and expose only files inside that root. It MUST NOT mutate the repository.

The North Star's broader CSV, JSON, and browser-acquisition tools remain later Scout milestones. This slice deliberately proves only static Git/file/Markdown/HTML acquisition; dynamic browser automation is an explicit non-goal below.

The web seed is acquisition depth `0`. Files in a local Git seed are also depth `0`. A link found in a depth-0 artifact may be fetched at depth `1`. Depth-1 artifacts are terminal: their links may be inspected and recorded, but MUST NOT be fetched. No arbitrary URL invented by the model is fetchable; HTTP acquisition accepts only the web seed or a link ID previously extracted by the harness.

Scout v0.1 runs tool calls serially. Candidate paths, headings, list items, and links MUST be returned in deterministic order. Concurrency is a later optimization because timing-dependent discovery near a budget boundary makes repeated runs nondeterministic.

## Content-addressed artifact store

Every acquired content body MUST be stored before an excerpt or packet may reference it.

An artifact contains exact bytes. Its identity is:

```text
artifact_id = "art_sha256_" + lowercase_hex(sha256(exact_bytes))
```

Artifact metadata MUST contain:

- `artifact_id`;
- `kind`: `repository_file`, `http_body`, or `derived_text`;
- media type;
- byte length;
- lowercase SHA-256;
- optional `derived_from_artifact_id` and a versioned transformation name.

Locators, timestamps, HTTP headers, and run IDs are acquisition facts, not artifact identity. The same bytes acquired from two locations reuse one artifact while preserving two acquisitions.

Artifacts MUST be written atomically beneath a SHA-256-sharded directory. Creating an existing ID MUST verify the stored bytes and return the existing artifact. Artifact files and manifests MUST never be updated or deleted by Scout.

HTML-to-text output, if used for excerpts, MUST be stored as a separate `derived_text` artifact. Raw HTTP bytes MUST remain stored. Transformations MUST be deterministic, locally executable, and versioned.

## ScoutPacket contract

Each selected collection listing produces exactly one packet, including when linked-page investigation is partial or blocked.

The JSON schema MUST be strict (`additionalProperties: false`) and express this shape:

```json
{
  "schema_version": "0.1.0",
  "packet_id": "scoutpkt_sha256_<64 lowercase hex>",
  "seed": {
    "kind": "git | web",
    "locator": "operator-supplied canonical locator",
    "revision": "Git commit or null"
  },
  "subject": {
    "source_label": "exact source-stated listing label",
    "primary_url": "http(s) URL or null",
    "selection_reason": "structural sampling rationale"
  },
  "listing": {
    "acquisition_id": "acq_sha256_<64 lowercase hex>",
    "artifact_id": "art_sha256_<64 lowercase hex>",
    "excerpt_ids": ["exc_sha256_<64 lowercase hex>"]
  },
  "followed_pages": [],
  "skipped_links": [],
  "excerpts": [],
  "uncertainties": [],
  "provenance": {
    "tools_used": [],
    "model_route": {},
    "budget": {},
    "source_timestamps": [],
    "trace_fingerprint": "trace_sha256_<64 lowercase hex>"
  },
  "investigation": {
    "status": "complete | partial | blocked",
    "reason_codes": [],
    "unresolved_questions": []
  }
}
```

The complete schema MUST define the following records and invariants.

`listing` is a full Acquisition with `excerpt_ids`; each `followed_pages` item is also a full Acquisition with `excerpt_ids`. The abbreviated example above shows the minimum relationship, not a second weaker record type.

### Acquisition

An acquisition records:

- deterministic `acquisition_id`;
- `kind`: `git_file`, `http_seed`, `http_link`, or `derived`;
- requested locator and final locator;
- acquisition depth integer `0` or `1`;
- acquisition depth state: `discovered`, `resolved`, `investigated`, or `blocked`;
- parent acquisition ID and originating link ID when applicable;
- status: `acquired`, `blocked`, `failed`, or `skipped`;
- artifact ID when and only when acquired;
- normalized HTTP status when applicable;
- one normalized failure record when not acquired;
- authority assessment.

Acquisition identity is the SHA-256 of the canonical, nonvolatile acquisition record without `acquisition_id`. It MUST NOT include timestamps, run IDs, provider metadata, transient exception strings, `Date` headers, or other values that change across an otherwise identical run.

The collection `listing` MUST reference a depth-0 acquired artifact. Followed pages MUST be separate acquisition objects and MUST NOT be folded into or substituted for the listing.

The acquisition depth state preserves semantic progress independently of numeric traversal depth:

- `discovered`: the harness has a valid locator or extracted link but has not acquired its body;
- `resolved`: the body and final locator are stored, but the content has not yielded a selected evidence excerpt;
- `investigated`: the stored body was inspected and the packet preserves the resulting evidence excerpt or an explicit evidence-absent observation;
- `blocked`: acquisition or inspection could not reach the intended state, with a normalized failure or uncertainty.

The depth-0 listing in an emitted packet MUST be `investigated`. A chosen link that was not dispatched remains `discovered` in `skipped_links`; a failed or denied acquisition is `blocked`; a successfully stored followed page is `resolved` or `investigated`. State transitions are append-only ledger events; the packet records the final state.

### Excerpt

An excerpt contains:

- deterministic `excerpt_id`;
- `artifact_id`;
- zero-based UTF-8 byte offsets `[start_byte, end_byte)`;
- exact decoded `text`;
- role: `listing`, `linked_evidence`, or `authority_signal`.

Excerpt identity is the SHA-256 of `artifact_id`, offsets, and role. Semantic validation MUST read the stored artifact and prove that the byte range is valid UTF-8 and decodes exactly to `text`. Every excerpt must be referenced by the appropriate listing or followed-page acquisition. Orphan excerpts and references to missing artifacts are invalid.

### Link

Links are extracted by the harness, not invented by the model. A link has a deterministic ID, source artifact ID, exact source byte span, exact source label, raw destination, resolved HTTP(S) destination, and source acquisition depth. Unsupported schemes remain inspectable skipped links but are never fetchable.

The packet MUST record every link chosen for investigation as either a followed page or a skipped link with a reason. It need not record every link in the artifact.

### Authority

Authority describes the relationship of an artifact to the listing; it is not verification or trust.

Allowed levels are:

- `collection` — the seed collection or repository listing;
- `linked_first_party` — linked content with deterministic same-origin evidence or explicit self-identification;
- `linked_third_party` — linked content that is observably a distributor, directory, repository, or other third party;
- `unknown` — the relationship cannot be established.

Every assessment includes `basis`: `seed`, `same_origin`, `source_statement`, `cross_origin`, or `unknown`, plus zero or more supporting authority-signal excerpt IDs. Scout MUST NOT emit `official`, `verified`, or an equivalent trust conclusion.

### Uncertainty

Allowed uncertainty codes are:

- `link_unavailable`;
- `access_blocked`;
- `content_incomplete`;
- `conflicting_source_text`;
- `not_investigated`;
- `authority_unknown`;
- `other`.

An uncertainty includes a concise observation, optional excerpt IDs, and whether it blocked completion. It MUST describe missing or conflicting acquisition evidence, not make a catalog classification.

### Provenance

Packet provenance preserves the deterministic context needed to interpret or replay the evidence:

- `tools_used`: tool name and implementation/schema version, ordered by first use;
- `model_route`: provider, requested model, and the ordered distinct resolved model names used while producing the packet;
- `budget`: configured maxima and deterministic consumed counters for requests, pages, bytes, inference calls, and maximum reached depth;
- `source_timestamps`: optional source-controlled timestamps such as Git commit time or an HTTP `Last-Modified` value, each tied to an acquisition ID and labeled by kind;
- `trace_fingerprint`: SHA-256 of the canonical normalized action, tool, acquisition, and packet-finalization event sequence relevant to this packet.

The trace fingerprint excludes wall-clock times, run UUIDs, token counts, latency, provider request IDs, and transient error text. Full event timestamps, requested/resolved model metadata per attempt, token usage, and the mapping from trace fingerprint to local trace live in the run ledger. This keeps operational provenance complete without making an otherwise identical packet acquire a new identity merely because it ran later.

### Investigation status

- `complete`: the collection listing is preserved, at least one selected linked page was acquired, and no chosen link has a blocking failure.
- `partial`: the collection listing is preserved and at least one selected linked page was acquired, but another chosen investigation was skipped, blocked, or failed.
- `blocked`: the collection listing is preserved but no selected linked page was acquired.

Once a listing has been selected, budget exhaustion, robots denial, HTTP failure, unsupported content, or provider failure MUST produce a valid `partial` or `blocked` packet. It MUST NOT make the listing disappear.

Packet finalization is a harness responsibility. If the model/provider becomes unavailable after selection, the harness MUST finalize packets from validated selected-listing state and normalized acquisition failures rather than requiring another model response.

## Packet identity and immutability

Canonical JSON for Scout v0.1 means UTF-8 JSON with recursively lexicographically sorted object keys, preserved array order, no insignificant whitespace, integers only for numeric fields, and no `undefined`, non-finite, or negative-zero values.

`packet_id` is `scoutpkt_sha256_` plus the SHA-256 of the canonical packet with `packet_id` omitted. Deterministic provenance, including model route and source-controlled timestamps, participates in packet identity. Packets contain no acquisition wall-clock timestamps, run IDs, token usage, latency, provider request IDs, or transient error strings. Those belong to the ledger.

Packets MUST be validated against JSON Schema and semantic invariants before an atomic create-only write. If a packet ID already exists, the store MUST prove byte-for-byte canonical equality and report reuse. A collision or differing content is fatal. Repeated identical fixture runs MUST create two ledger runs but one set of five packet files with identical IDs.

## Run ledger

Operational state MUST be durable and separate from immutable packets. SQLite is preferred to match the repository, but an equivalently queryable append-only store is acceptable.

Each run records:

- unique run ID, seed, started/finished timestamps, and final status;
- provider, requested model, resolved model for every inference response, and prompt/action-schema version;
- configured budget and final counters;
- every normalized event's timestamp and the trace fingerprint(s) derived from it;
- ordered model attempts and validated actions;
- every tool call with normalized input, status, output references, failure code, budget before/after, and timing;
- discovered listing candidates, selected listings, followed and skipped links;
- emitted or reused packet IDs;
- final unresolved work and terminal reason codes.

Secrets, authorization headers, cookies, complete provider responses containing secrets, and source page bodies MUST NOT appear in the ledger or dogfood report. Raw model text MAY be stored locally in a restricted trace, but the committed dogfood report must contain only normalized actions and summaries.

Run statuses are `completed`, `partial`, `blocked`, and `failed`. `failed` is reserved for failure before any valid selected-listing packet can be emitted or for an invariant/store corruption. If one or more selected listings exist, ordinary acquisition/provider/budget failures produce `partial` or `blocked` plus packets.

## Structurally enforced budgets

Every run receives positive integer maxima:

| Budget | Meaning | Enforcement point |
|---|---|---|
| `max_requests` | Outbound HTTP requests, including `robots.txt` and every redirect hop | Reserve immediately before dispatch |
| `max_pages` | Content-bearing seed fetches, repository-file reads, and followed-page fetch attempts | Reserve immediately before acquisition |
| `max_bytes` | Raw bytes accepted from files and HTTP bodies, including robots responses | Stop streaming before accepting byte `max_bytes + 1` |
| `max_elapsed_ms` | Wall-clock run deadline | Check before every model/tool call and abort in-flight HTTP/model calls at the deadline |
| `max_inference_calls` | Provider invocations, including invalid or repair responses | Reserve immediately before provider invocation |
| `max_depth` | Highest fetchable acquisition depth | Validate lineage before page/request reservation; v0.1 maximum is `1` |

Budget reservation and counters live in the harness, never in prompts or model compliance. A tool or provider cannot be called after its counter is exhausted. Cached artifact reuse within a run does not consume another page or request, but the cache hit is ledgered. Failed dispatched requests remain charged. Elapsed time is always charged.

The reference five-listing run uses maxima no greater than:

```json
{
  "max_requests": 20,
  "max_pages": 15,
  "max_bytes": 3000000,
  "max_elapsed_ms": 180000,
  "max_inference_calls": 16,
  "max_depth": 1
}
```

The run configuration also fixes `target_packet_count`; it is `5` for both demonstrations. Selection stops at that count, and the harness rejects duplicate listing excerpts within one run.

Tests MUST also use smaller budgets to prove each boundary cannot be exceeded.

## Generic tools

All tools are read-only except controlled artifact, packet, ledger, and report writes.

- Git inspection: resolve root and HEAD, list tracked files lexically in bounded pages of at most 200 paths, report metadata. No clone, checkout, fetch, or mutation.
- File read: accept only a tracked relative path returned by Git inspection; reject absolute paths, traversal, untracked files, and symlink/reparse-point escape; apply page and byte budgets.
- Markdown inspection: return headings, list-item boundaries, and structural nesting with exact byte offsets. It MUST work on arbitrary Markdown rather than named repositories or categories.
- Link inspection: extract Markdown and static HTML links with exact source spans and deterministic normalized targets, returned in bounded pages of at most 200 links. It performs no fetch.
- HTTP acquisition: GET only, HTTP(S) only, bounded streaming, explicit user agent, manual redirects, content-type allowlist for static text/HTML/Markdown, and deterministic terminal results.

HTTP MUST respect `robots.txt` by default. Robots acquisition consumes request, byte, and time budgets but not page budget, is cached per origin for the run, and uses the same redirect validation as page fetches.

Before the seed request and every redirect hop—including redirects while fetching `robots.txt`—the harness MUST resolve and reject loopback, private, link-local, multicast, unspecified, carrier-grade NAT, and cloud-metadata destinations in IPv4 and IPv6 forms. It MUST reject credentials in URLs and non-HTTP schemes. Offline tests use an injected transport; the production CLI must not expose a switch that disables these guards.

The Scout model receives only these tools through a strict versioned JSON action protocol. Invalid actions consume an inference call, are recorded, and may receive one corrective response; repeated invalid actions end with the packet-preserving partial/blocked behavior above. There is no shell, browser automation, arbitrary file access, or code-writing tool.

## Provider policy

The provider interface MUST be injectable. Offline tests use a deterministic scripted provider that exercises the same action validator and ledger path as a live model.

Live inference MUST reuse or strengthen the v0.1.1 free-route policy:

- OpenRouter accepts `openrouter/free` or an explicitly free route only;
- NVIDIA requires an explicitly selected model;
- no missing credential, timeout, rate limit, provider error, or invalid response may cause fallback to a paid or different provider;
- requested and resolved model names and token usage, when supplied, are recorded per attempt;
- provider errors consume inference budget and produce explicit packet/run outcomes.

## Librarian handoff

`packetToLibrarianRecord(packet, artifactStore)` MUST validate the packet again and return the existing normalized source-record shape without classification:

- `source_kind`: `repository` for a Git seed or `website` for a web seed;
- `source_locator`: `scout-packet:<packet_id>#listing`;
- `source_name`: exact `subject.source_label`;
- `source_url`: `subject.primary_url` or empty;
- `source_platform`: seed repository remote host, web host, or `scout` when unavailable;
- `raw_text`: a deterministic document containing the collection listing excerpts first and followed-page excerpts second, each with its artifact ID and locator marker;
- category, offer, eligibility, value, and canonical identity fields empty or absent.

The adapter MUST NOT import controlled vocabulary or catalog identity planning. The normal Librarian path consumes the record and remains responsible for `prepareSourceObservation`, model classification, candidate validation, product/opportunity identity, immutable revisions, and review routing.

`npm run librarian:v01 -- --packet=<packet.json> ...` MUST be supported as mutually exclusive with `--record` and `--source-id`. An integration test must feed one fixture packet through a mock Librarian provider and reach `review_required`, with product and opportunity revisions created by the Librarian path—not present in the ScoutPacket.

## Deterministic fixture demonstration

Fixtures MUST model an unfamiliar generic repository rather than copy production source-specific parsing logic. Include:

- multiple plausible Markdown files so catalog discovery requires inspection;
- at least seven structurally varied list entries from which exactly five are selected;
- static linked-page responses with first-party, third-party, redirect, blocked, and unavailable cases;
- at least one listing ending `complete`, one `partial`, and one `blocked`;
- a scripted action transcript that locates the catalog, identifies exact boundaries, selects five entries, and investigates allowed links.

The fixture command MUST run twice against the same output store and prove identical packet IDs, exactly five packet files, two ledger runs, exact excerpt resolution, and deterministic handoff text. It must perform no DNS, socket, HTTP, Git mutation, or credential lookup.

## Live dogfood

The live command accepts an operator-prepared local checkout of free-for-dev plus an explicitly selected free provider/model. It MUST use the reference budgets or stricter values, select exactly five listings, and leave all raw artifacts, packets, and traces in ignored local state.

`docs/SCOUT-V0.1-DOGFOOD.md` MUST record:

- run ID, UTC time, Scout version, seed locator, and exact Git commit;
- provider plus requested/resolved model (never credentials);
- configured and consumed request, page, byte, elapsed, inference, and depth budgets;
- catalog file(s) inspected and why the final boundary was selected;
- five source labels, packet IDs, and `complete`/`partial`/`blocked` statuses;
- every followed URL, every deliberately skipped selected link and reason, and every normalized failure;
- emitted versus reused packet counts;
- what Scout could not determine;
- exact commands needed to reproduce the run, excluding credentials.

The report MUST be generated from the ledger rather than reconstructed from memory. A live failure does not authorize weakening the budgets or acceptance gates; fix the implementation or report the genuine blocker.

## Exact failure codes

Public packet/ledger failures use stable codes, with sanitized detail stored separately:

- `budget_request_exhausted`
- `budget_page_exhausted`
- `budget_byte_exhausted`
- `budget_time_exhausted`
- `budget_inference_exhausted`
- `depth_exceeded`
- `robots_denied`
- `ssrf_blocked`
- `unsupported_scheme`
- `unsupported_content_type`
- `redirect_limit_exceeded`
- `fetch_timeout`
- `http_error`
- `content_too_large`
- `path_escape`
- `untracked_file`
- `parse_error`
- `provider_error`
- `invalid_agent_action`
- `no_followable_link`
- `no_listing_found`
- `store_corruption`
- `other`

Exceptions, URLs with credentials, response bodies, and provider payloads MUST NOT become failure codes.

## Explicit non-goals

- investigating all 1,100+ linked sites;
- dynamic X/Twitter or Bags.fm browser automation;
- remote Git cloning inside Scout;
- JavaScript execution or general browser automation;
- PDFs, images, archives, forms, logins, or authenticated pages;
- canonical product deduplication;
- official verification policy;
- scheduled maintenance;
- Oracle deployment;
- Planner behavior;
- public API or social behavior;
- arbitrary recursive crawling;
- Scout-generated production code.

## Executable acceptance gates

The implementation fails review unless all gates pass.

1. **Idempotency:** two identical fixture runs produce the same five packet IDs, five packet files total, and two inspectable ledger runs.
2. **Exact evidence:** semantic validation resolves every excerpt byte range exactly into its stored artifact; offset, text, missing-artifact, orphan-excerpt, and corrupted-artifact negatives fail.
3. **Provenance separation:** every packet has one depth-0 collection listing and separate followed-page acquisitions; tests reject a packet that substitutes linked content for the listing.
4. **Visible partial work:** deterministic fixtures and budget/error tests produce valid `complete`, `partial`, and `blocked` packets; selected listings never vanish because investigation failed.
5. **Structural budgets:** fake transports/providers assert actual dispatches never exceed request, page, byte, elapsed, inference, or depth maxima, including redirects and failures.
6. **Generic core:** a case-insensitive scan of `packages/scout`, prompts, and schemas contains no `free-for-dev`, repository slug, known fixture vendor, category, or source-specific branch. Such names may appear only in fixtures, tests, CLI examples, and the dogfood report.
7. **Librarian ownership:** the packet schema has no product/opportunity IDs, facets, capabilities, entitlements, conditions, constraints, canonical matches, or deduplication decisions. The Librarian integration test proves those arise only after handoff.
8. **Offline reproducibility:** `npm run test:scout` succeeds with credential variables removed and a transport that throws on any unmocked network attempt.
9. **Regression safety:** every test command present in release `0.1.1`, plus the new Scout tests, remains green.
10. **Live evidence:** the committed dogfood report is ledger-generated, uses exactly five packets and fixed budgets, and accounts for everything inspected, spent, followed, skipped, failed, and unresolved.

Review additionally fails for secret leakage, hidden writes, paid fallback, an HTTP redirect that bypasses address validation, a path/symlink escape, mutable packet/artifact writes, or a Scout import of catalog identity/vocabulary logic.

## Review deliverables

The implementation handoff must include:

- commit series and changed-file summary;
- fixture and full-suite commands with results;
- packet IDs and statuses from both repeated fixture runs;
- negative-test inventory mapped to gates 1–9;
- live run command, dogfood report, and local trace/packet locations;
- explicit deviations or blockers—never silently weakened requirements.

## Primary implementation lessons

The contract borrows observable lessons, not Firecrawl internals:

- [Firecrawl crawl documentation](https://github.com/firecrawl/firecrawl-docs/blob/main/features/crawl.mdx) makes page limits, discovery depth, external-link scope, crawl errors, and timing-dependent nondeterminism explicit.
- [Firecrawl advanced scraping guide](https://github.com/firecrawl/firecrawl-docs/blob/main/advanced-scraping-guide.mdx) separates discovery scope from per-page acquisition options.
- [Firecrawl Laravel tool documentation](https://docs.firecrawl.dev/sdks/php) keeps failed, cancelled, partial, and omitted results visible and uses idempotency keys for crawl retries.
- [GitHub-hosted SSRF regression evidence](https://github.com/aden-hive/hive/issues/6879) demonstrates why public-address validation must apply to `robots.txt` and every redirect hop, not only the initial URL.
