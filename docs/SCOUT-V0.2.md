# Scout v0.2 corrective investigation specification

Status: implementation specification

Date: 2026-08-25

Scout v0.2 is a corrective research slice beside, not a mutation of, ScoutPacket v0.1. The v0.1 schema, runner, command, fixtures, report, and regression tests remain supported.

## Research request

Every run and packet carries a typed request with a stable request version, one objective, and fixed topics. The dogfood objective is:

> Find current authoritative evidence for the offer described by this collection listing, including its free/discounted benefit, numerical limits, requirements, eligibility, and material caveats.

The initial topics are `benefit`, `numerical_limits`, `requirements`, `eligibility`, and `material_caveats`. Each has an independent outcome: `answered`, `partially_answered`, `not_found`, `conflicting`, or `blocked`. Transport and acquisition state never imply a research outcome.

## Evidence and findings

Raw Git and HTTP bytes remain immutable content-addressed artifacts. HTML is deterministically transformed by `html-readable-text@0.2.0` into a separate UTF-8 readable artifact. The packet acquisition records authoritative lineage between raw and readable artifact IDs plus the transformation version; lineage is not embedded as a single parent in new readable manifests because different dynamic HTML bodies may clean to the same immutable text. Legacy v0.2 derived manifests remain readable as content representations, but their original single-parent field does not override packet-local lineage. Script, style, template, SVG, comments, and hidden elements are excluded; block structure is rendered as bounded readable text. Source content remains untrusted data.

The model receives bounded readable windows and bounded harness-extracted links. It may select only byte ranges that the harness exposed. A finding contains a source-local statement, derivation (`explicit`, `parsed`, or `inferred`), exact supporting excerpt IDs, acquisition IDs, a topic, and optional parsed primitives. Supported primitive shapes cover quantity and source-unit text, money and currency, cadence text, date text, boolean requirements, and audience text. Primitive source text must resolve inside the cited evidence. Findings are not catalog facts.

Conflicts reference two or more findings. Outcomes reference findings and conflicts and retain unresolved questions. The exact statement excerpt is identified separately from its supporting evidence. For this authoritative-evidence request, `answered` requires at least one statement excerpt from a linked first-party acquisition; a collection-only claim must remain partial or unresolved. `conflicting` requires a conflict; `partially_answered` requires both support and an unresolved question; `not_found` and `blocked` cannot masquerade as supported answers.

No whole raw HTML response is selected as evidence by default. Excerpts are short ranges from the listing, readable derived artifacts, or plain-text artifacts and are byte-validated against immutable storage.

## Bounded navigation

The path is limited to collection depth 0, listed page depth 1, and at most one selected evidence page at depth 2 per subject. Only harness-extracted HTTP(S) links may be followed. The model cannot invent a URL. Pricing, plans, documentation, terms, and eligibility links are shown as ordinary bounded link candidates rather than source-specific tools or rules.

JavaScript-dependent or materially empty readable content remains acquired but `content_incomplete`, with a `browser_required` or sparse-content reason. Browser automation is out of scope.

## Git revision fidelity

Git paths are enumerated and read from the recorded commit using Git object access. Working-tree bytes are never attributed to `HEAD`. A dirty tracked file must produce the recorded blob or a normalized fidelity failure, never the dirty bytes.

## Stable evidence identity

Packet identity is a hash of the subject-local evidence document only: request, seed revision, subject hint, acquisitions and artifact lineage, exact excerpts, findings, conflicts, outcomes, and unresolved questions. Arrays are canonically ordered.

Provider/model names, global trace fingerprints, selection order, companion subjects, invalid actions, global budget configuration/counters, timings, and run IDs remain in the ledger and map to packet IDs there. They do not participate in packet identity. Identical validated subject evidence must retain one packet ID across irrelevant grouping, ordering, route, and run differences.

## External model boundary

Scout core does not adapt itself to a particular free model. The provider boundary has
two named external failures:

- `external_model_unavailable`: the selected provider did not return a usable response;
- `external_model_protocol_error`: the response was not exactly one valid permitted
  action or failed deterministic packet validation.

Either failure ends the active subject's model work immediately. When listing evidence
already exists, Scout emits a packet whose topics are `blocked`, records the exact
failure and validation detail in the ledger, and continues to the next bounded subject.
Before subject selection, the run fails without fabricating packets. Scout does not
retry, unwrap Markdown, search prose for JSON, move values between fields, split mixed
source findings, invent missing comparisons, reinterpret conflicts, or normalize an
unsupported answer into a different answer.

Provider retry policy and provider-specific adaptation are explicit TODOs outside
Scout core. The retained `derive-packet-v02` command remains an explicit offline tool
for the historical DB Designer evaluation; the live runner never invokes it silently.

## Complexity budget

The corrective Scout source is linted with ESLint's classic cyclomatic-complexity rule:

- maximum cyclomatic complexity: 12 per function;
- maximum block depth: 3;
- maximum function length: 80 nonblank, noncomment lines.

`npm run lint` is part of `npm test`. New Scout v0.2 code must be decomposed rather
than suppressed or added to an exception list.

## Librarian handoff

The v0.2 adapter returns a structured bundle containing packet ID, request, subject, acquisitions, authority relationships, selected excerpts, findings, conflicts, outcomes, and unresolved questions. A transitional `record` projection contains only the collection listing and selected short findings—not whole raw pages—and carries the structured bundle into the Librarian prompt.

The Librarian remains responsible for candidate evidence keys, canonical identity, products, opportunities, entitlements, constraints, conditions, vocabulary, trust, and review. Passing the packet validator is never publication approval.

## Dogfood and non-goals

The corrective dogfood is exactly five configured listing labels. Configuration may name evaluation subjects; generic Scout core, prompts, schemas, and transformations must not contain source- or vendor-specific behavior.

Out of scope are full repository fan-out, CSV support, arbitrary crawling, browser automation, authenticated pages, Oracle deployment, Planner behavior, and release `0.2.0`.

Acceptance requires deterministic adversarial tests plus one retained live state directory. The live report must distinguish acquisition from research, show selected bounded evidence and gaps, and record real free-model Librarian results for all five packets without paid fallback.
