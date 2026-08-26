# Scout v0.2

Status: active pre-release design

## Job

Scout goes looking for free stuff and brings back what it found.

It does not decide what the material means. It does not extract offers, reconcile conflicts, judge authority, assign catalog vocabulary, resolve product identity, or decide publication. Those are Librarian responsibilities.

## Actions

The model has five small actions:

- request another bounded page of repository files;
- choose one supplied file index;
- select listings by supplied candidate index;
- follow one supplied link;
- finish the current subject.

The model never creates paths, URLs, byte ranges, evidence IDs, findings, parsed values, conflicts, or research outcomes. The harness resolves every selected index and permits at most one followed link after the listed page.

## Packet

One packet represents one collection listing and contains only:

- the immutable seed locator and Git revision when applicable;
- the source label and listed URL;
- the exact collection listing and its stored artifact range;
- zero, one, or two acquired pages;
- raw and readable artifact IDs, final URLs, HTTP status, content-incomplete reasons, and acquisition failures.

The packet ID depends only on this subject-local acquired material. Provider choice, companion listings, budgets, traces, and model failures remain in the linked run ledger.

## Acquisition rules

- Git files are read from the recorded revision, never attributed from a dirty working tree.
- HTTP redirects, robots rules, SSRF checks, content bounds, and explicit budgets remain enforced.
- Raw HTTP bytes are retained unchanged.
- HTML receives a deterministic readable-text representation for the Librarian.
- Scripts, hidden content, and source instructions are untrusted data.
- A JavaScript shell may be retained as content-incomplete; HTTP 200 says only that bytes were acquired.
- Only harness-extracted links may be followed.

## Librarian handoff

The adapter gives the Librarian the collection listing and bounded readable page material with packet and artifact references. It never sends whole raw HTML by default.

The Librarian owns evidence selection and every semantic conclusion.

## Collection fan-out

Bulk fan-out is deterministic once a collection has been located. Brokie reads a
recorded Git revision, selects the strongest bounded Markdown/HTML collection, and
creates one collection-only packet for every listing with an extracted HTTP link. A
model does not select or emit thousands of entries.

The packets enter one idempotent SQLite Librarian queue. Replaying the same revision
reuses packet identities and creates no duplicate jobs. Deeper page acquisition can
be requested later for prioritized subjects.

## External models

Provider unavailability is recorded as `external_model_unavailable`. Invalid action JSON is recorded as `external_model_protocol_error`. Scout does not contain model-specific repairs. If a failure occurs after a subject has material, Scout retains that material and moves on.

OMP is the initial worker harness. Its free, quota, and paid routes remain explicit;
paid routes require command-level authorization. Provider ranking and bake-offs remain
outside Scout.

## Compatibility decision

ScoutPacket v0.1 remains immutable and supported by its existing tests. The earlier corrective v0.2 research contract was never released and is superseded by this acquisition-only contract. Its committed dogfood report remains historical evaluation evidence and is not rewritten as if it used the new packet shape.

## Acceptance

- Scout packets contain source material, not Scout interpretations.
- Repeated acquisition of identical subject material yields the same packet ID across model routes, grouping, and ordering.
- Dirty Git working-tree content is not attributed to the recorded revision.
- Acquisition failures and browser-required content remain visible.
- Librarian input contains readable source material and no raw HTML.
- The v0.1 regression suite remains green.
- Generic Scout core contains no source-specific behavior.
