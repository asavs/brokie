# Scout v0.2 simplification audit

Status: corrective implementation note

Date: 2026-08-26

## Reason

The first corrective implementation made model unreliability an architectural concern.
One 328-line orchestration function discovered sources, fetched pages, interpreted
model actions, repaired malformed primitives, split mixed-source findings, inserted
omitted collection evidence, re-scoped references, reinterpreted conflicts, normalized
outcomes, retried failures, built packets, and finalized runs.

That structure was truthful in many edge cases but not maintainable. It also obscured
the more important boundary: free-provider reliability and model-specific output repair
are not Scout responsibilities.

## Measured baseline

Before refactoring, ESLint reported:

- `runScoutV02`: cyclomatic complexity 152 and 319 lines;
- `validateActionV02`: complexity 76;
- `validatePacketV02`: complexity 115 and 117 lines;
- readable-content helpers: complexity 15 and 18;
- dogfood report generator: complexity 17;
- 61 total complexity, nesting, or function-length violations.

The enforced limit is now complexity 12, nesting depth 3, and 80 lines per function
across `packages/scout/**/*v02*.mjs`. There are no suppressions or grandfathered files.
The project uses supported ESLint 10, so its Node 22 minimum is aligned from 22.5 to
22.13, the maintenance release required by that toolchain.

## Resulting shape

The runner now coordinates small explicit phases:

```text
seed initialization
  -> collection discovery
  -> listed-page acquisition
  -> optional evidence-page acquisition
  -> strict model action
  -> deterministic research assembly
  -> packet validation
  -> immutable storage
```

Separate modules own action syntax, discovery, acquisition, research assembly, packet
construction, readable transformation, reporting, and validation. The runner contains
no semantic repair pipeline.

## Failure policy

An unavailable provider becomes `external_model_unavailable`. Malformed, invented, or
semantically invalid structured output becomes `external_model_protocol_error`. The
active subject is blocked once, the ledger records a TODO stating that provider retry
and adaptation are out of scope, and Scout moves on. There is no correction prompt or
retry streak.

This deliberately trades live completion rate for a smaller and more truthful core.
Improving a free provider route can later happen in an outer orchestrator or provider
adapter without changing Scout evidence semantics.
