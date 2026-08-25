# Scout v0.1 semantic audit

Status: authoritative corrective audit

Date: 2026-08-25

Scout v0.1 proved a useful acquisition kernel. It can inspect an unfamiliar static Git or web seed, discover listing boundaries, enforce request/page/byte/time/inference/depth budgets, preserve immutable raw artifacts and exact byte-backed excerpts, protect HTTP access with robots and redirect-aware SSRF checks, retain partial failures in a ledger, and hand a packet into the Librarian path. Those properties remain valuable and are retained as regression coverage.

## What `complete` means in v0.1

In ScoutPacket v0.1, `investigation.status = complete` means that at least one chosen linked page returned an accepted HTTP body and no chosen link failed or was skipped. It does not mean that the research objective was answered.

The v0.1 model sees listing boundaries, labels, headings, and extracted links, but not the complete listing description during selection. After fetching a page it sees only transport status. The harness then records the entire successful response body as one `linked_evidence` excerpt. Consequently, HTTP 200 is enough to produce `complete` even when the response is a marketing shell, requires browser rendering, omits offer terms, contradicts the collection, or contains no useful evidence.

## What the live run proved—and did not prove

The retained v0.1 report proves that five listed URLs were fetched within fixed budgets and packaged without weakening the acquisition gates. It does not retain the runtime packets or artifacts, so the selected page bodies cannot now be reviewed. Its five `complete` results therefore demonstrate acquisition success, not research quality, corroboration, freshness, or offer completeness.

The live run also did not prove that Scout can:

- identify missing benefit, limit, requirement, eligibility, or caveat evidence;
- navigate from a homepage to a relevant pricing, plans, documentation, terms, or eligibility page;
- select short relevant evidence from readable page content;
- distinguish a resolved page from an answered research question;
- preserve source-local findings and conflicts for the Librarian;
- keep Git evidence faithful to the recorded revision when the worktree is dirty;
- keep subject evidence identity stable across unrelated run, grouping, and model changes.

The legacy flattened adapter further proves mechanical compatibility only: it concatenates the listing with entire followed pages, and the integration test supplies a prepared mock Librarian candidate. It does not prove useful live classification.

## Corrected responsibility boundary

Scout owns locating, fetching, deterministic cleaning, bounded navigation, exact excerpt selection, faithful source-local statements, parsed primitive values, authority relationships, conflicts, missing evidence, acquisition failures, and unanswered research questions.

Librarian owns canonical product identity and deduplication, product/opportunity decomposition, normalized entitlements and constraints, eligibility and applicability semantics, controlled vocabulary, freshness/trust/publication decisions, and supplemental research requests.

Scout may preserve that a source states “2 Database Models” and parse the primitive `{ value: 2, source_unit: "Database Models" }`. It may not decide that this is a canonical entitlement, a public free tier, or the identity of an opportunity.

## Corrective decision

ScoutPacket v0.1 remains immutable and supported. The correction introduces a versioned v0.2 research packet and runner with explicit research requests and outcomes, bounded readable derived artifacts, selected evidence, one optional second-hop navigation, revision-faithful Git reads, subject-local evidence identity, and a structured transitional Librarian handoff.

Full-source fan-out is paused. Until the same five listings demonstrate materially different truthful outcomes and produce reviewable live Librarian candidates, multiplying v0.1 acquisition packets would scale transport success rather than knowledge quality.

