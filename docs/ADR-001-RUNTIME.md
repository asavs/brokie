# ADR-001: Retain Node.js for the v0.1 runtime

Status: accepted for v0.1.x

Date: 2026-08-24

## Decision

Brokie will retain Node.js for the v0.1 release line. Runtime boundaries remain ordinary JSON, SQLite, SQL, and HTTP so this decision does not make Node a permanent architectural commitment.

The core installation requires only AJV. The Pi coding-agent comparison is an optional dependency and is not part of catalog ingestion, validation, review, publication, or serving. A core deployment can use:

```bash
npm ci --omit=optional
```

## Context

The v0.1 implementation already has audited deterministic validation, immutable SQLite storage, fixtures, and HTTP tests in JavaScript. Rewriting those pieces would consume release risk without correcting the material architectural defect found during this review: the typed catalog, human trust decisions, public API, and web explorer were separate paths.

Node's built-in HTTP and SQLite modules are sufficient for the small local-first service. They also keep the deployment shape compact. However, Node's current SQLite API remains an active compatibility risk: the latest documentation inspected on this date labels `node:sqlite` stability 1.2, release candidate, while the supported Node 22 runtime still emits an experimental warning. `DatabaseSync` is synchronous, so long queries can block the event loop.

Those are reasons to isolate and measure the runtime, not reasons to rewrite before the typed product path works.

## Alternatives considered

- Python would provide a mature standard-library SQLite binding and similarly simple deployment, but its common SQLite path is also synchronous. A rewrite would not improve Brokie's trust model, data contract, or catalog convergence by itself.
- Go or Rust could produce a compact standalone service and stronger concurrency control. Today that benefit does not outweigh a second implementation of the schema, JSON contract, and fixtures.
- Bun would preserve JavaScript but add another young runtime dependency without removing the SQLite portability question.

No alternative is rejected permanently. The SQLite file and OpenAPI contract are intended to make replacement empirical rather than ideological.

## Consequences

- The v0.1 API uses a read-only SQLite connection, bounded inputs, explicit HTTP timeouts, and a small request surface.
- Publication policy stays in deterministic catalog queries and immutable review events, not in adapters or the web application.
- New agent surfaces should call the HTTP contract instead of importing Node modules.
- The Pi adapter remains available for the original comparison but does not burden core production installs.
- We accept the Node 22 SQLite warning for this release and test the exact runtime in CI and deployment environments.

## Revisit when measured evidence shows one of these

- p95 catalog query time or concurrent traffic causes material event-loop stalls;
- the Node SQLite API changes incompatibly or cannot provide required SQLite features on a target host;
- the zero-cost deployment target cannot reliably run the supported Node release;
- ingestion or serving requires sustained CPU parallelism that workers cannot satisfy simply;
- a replacement prototype passes the same contract, catalog, review, and API fixtures with a materially smaller operational or resource cost.

A rewrite proposal should include comparative install size, idle memory, cold start, representative query latency, concurrency behavior, and migration effort. Language preference alone is not a release criterion.

## Primary references

- [Node.js SQLite documentation](https://nodejs.org/docs/latest/api/sqlite.html)
- [Node.js HTTP documentation](https://nodejs.org/docs/latest/api/http.html)
