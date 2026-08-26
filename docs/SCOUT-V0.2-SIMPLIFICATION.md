# Scout v0.2 simplification record

The first corrective design asked Scout to navigate, select exact evidence, parse values, reconcile sources, describe conflicts, and answer a multi-topic research request in one strict action protocol. Live free models frequently failed that protocol, and the code accumulated repair logic around them.

That design confused acquisition with catalog interpretation.

The replacement boundary is intentionally plain:

> Scout went looking for free stuff. This is what it found, where it found it, and what it could not access.

The pre-release contract therefore removed:

- research requests and topic outcomes;
- Scout findings, parsed primitives, and conflicts;
- evidence-selection requirements;
- authority and catalog judgments;
- semantic repair and packet-derivation tooling.

Scout now chooses only files, listing indexes, and at most one extracted link. Deterministic code performs acquisition, storage, readable-text conversion, provenance, budgets, and identity. Librarian receives the material and owns every interpretation.

The complexity lint remains a guardrail: Scout functions must stay at cyclomatic complexity 12 or less, nesting depth 3 or less, and 80 lines or less. No suppressions are present.
