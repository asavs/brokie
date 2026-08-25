# Brokie agent handoff

This directory is the independent Brokie repository. The parent `free-for-dev` checkout is a read-only source input; never edit it as part of Brokie work or prepare AI-authored upstream contributions.

Before planning or implementing substantial work, read these documents in order:

1. `docs/NORTH-STAR.md` — authoritative product direction, role boundaries, guardrails, and roadmap.
2. `docs/DATA-CONTRACT.md` — authoritative typed catalog semantics.
3. `docs/DATA-UX-SCRATCHPAD.md` — detailed reviewed examples and data/UX decisions.
4. `docs/PRODUCT_BRIEF.md` — extended planning and decision archive.

If documents disagree about product direction, `docs/NORTH-STAR.md` wins. If they disagree about catalog representation, `docs/DATA-CONTRACT.md` wins.

Project rules:

- Preserve the separation between Scout evidence acquisition, Librarian catalog interpretation, Planner recommendations, and public publishing roles.
- Models propose; typed deterministic harnesses validate identity, evidence, economics, persistence, budgets, and publication state.
- Default external-service spend is exactly zero. Never fall back silently to paid inference or infrastructure.
- Preserve raw provenance, immutable observations, inspectable failures, and explicit unknowns.
- Do not publish model output merely because it validates.
- Keep the application portable across a local machine, Oracle Cloud, Google Cloud, and ordinary Linux VMs.
- Do not commit private source collections, credentials, generated state databases, or run traces.
- Release versions and tags use plain `n.n.n` without a `v` prefix or prerelease suffix.
- Run `npm test` before committing release-affecting changes.
