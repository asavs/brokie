# Brokie agent access and Firecrawl implementation study

Status: working architectural direction with the first v0.1 HTTP slice implemented

Last reviewed: 2026-08-24

## Purpose

This note keeps the agent-distribution design and the lessons drawn from Firecrawl's Developer Index durable. It should inform future API, CLI, MCP, skill, retrieval, and evaluation work without prematurely freezing a public contract.

The central direction is:

> Brokie should be skill-led and API-first. The skill teaches an agent how to use Brokie well; a canonical query service owns data, policy, and behavior; CLI, MCP, and other clients remain thin adapters.

This extends the product brief and the typed data contract. It does not authorize implementation of the later Planner, publication, or public-agent phases.

## Emerging request modes

Two top-level request shapes currently appear to cover most prospective Brokie use:

### Build mode

The searcher knows the outcome:

> I want to make or accomplish this. Find the cheapest credible way.

The system interprets the goal and constraints, determines required capabilities, evaluates opportunities and likely eligibility, and eventually assembles evidence-backed plans.

Reducing the cost of an existing system is a variation of build mode. The existing stack, migration tolerance, and current spending become additional inputs.

### Inspiration mode

The searcher is looking for possibility rather than fulfillment of a fixed goal:

> Show me what is unusually cheap or free so I can decide what is worth making.

The system should surface useful clusters, combinations, newly feasible projects, and unusual opportunities without pretending that an idea is already a compatible or verified plan.

These modes are a product hypothesis, not yet an API enum. Validate them against real requests before allowing names or boundaries to harden across HTTP, CLI, MCP, the skill, and evaluation fixtures. Monitoring is a possible longitudinal form of either mode rather than necessarily a third top-level mode.

## What Firecrawl actually demonstrates

Firecrawl markets the Developer Index through an agent skill, but the skill is not the service boundary. The observable public system is layered:

```text
Developer Index skill
  -> selects a query strategy and access surface
  -> HTTP, CLI, or MCP
  -> public Firecrawl API gateway
  -> separate Developer Index upstream
```

### Skill

The `firecrawl-developer-index` skill is a compact operating manual. It teaches:

- when specialized developer search is appropriate;
- which of dedicated search, combined web search, and general web retrieval to use;
- how error, conceptual, API-contract, version-specific, and ecosystem queries differ;
- how and when to narrow by artifact type, repository, or documentation source;
- how to interpret matched passages and source authority;
- when to stop searching or fall back to the open web.

The skill contains judgment and routing policy, not the index or its ranking implementation.

### CLI and MCP

The CLI and MCP implementations are thin adapters over the canonical HTTP endpoint. They construct a small request, call `/v2/search/developer`, and render the returned results. The MCP tool exposes fewer options than HTTP, reducing the decision surface presented to a model.

This is an important separation: HTTP provides the complete contract, while agent-native surfaces can deliberately expose a smaller safe and understandable subset.

### Public API gateway

The open Firecrawl API repository shows that the public gateway owns:

- strict input schemas and parameter allowlists;
- canonical and compatibility routes;
- authentication and keyless access;
- timeouts and upstream error translation;
- request origin and integration attribution;
- metering, quotas, billing, and usage records;
- response normalization and simplified projections.

The dedicated endpoint preserves ranked results, stable IDs, matched passages, coverage, and repository/source indexing status. The general search surface converts developer hits to a simpler web-result shape and uses the first matched passage as the description. That projection is useful but lossy.

### Index backend

The public Firecrawl application proxies a separately configured upstream at `/v2/code/search`. The inspected repositories do not establish how the Developer Index itself stores artifacts, builds embeddings or lexical indexes, chunks content, reranks candidates, or schedules refreshes.

Do not infer a vector database, storage engine, or ingestion architecture from the public gateway. Those details remain unknown unless supported by later primary-source evidence.

## Transferable lessons

### One canonical service, several projections

HTTP, CLI, MCP, skills, SDKs, and a human interface should not develop independent ranking or policy implementations. They should project one versioned service contract, with deliberate and documented loss when a surface is simpler.

### Routing language is behavior

Firecrawl encountered agent-routing failures when similarly named search and research surfaces overlapped. Corrections had to span skill triggers, MCP descriptions, CLI guidance, response documentation, and regression tests.

Brokie must treat names, tool descriptions, trigger language, fallback rules, and result shapes as versioned product behavior. A routing change is incomplete until every agent-facing surface and its tests agree.

### Coverage must be observable

Firecrawl echoes whether a scoped repository or documentation source is indexed. This distinguishes "the source is covered but nothing matched" from "the system cannot search that source."

Brokie needs an equivalent distinction among at least:

- no relevant match;
- outside current catalog coverage;
- known candidate but not publishable;
- stale or superseded evidence;
- blocked by a material unknown or contradiction;
- excluded by user constraints.

### Evidence should travel with results

Matched passages let an agent answer from evidence without performing another fetch. Brokie should similarly return typed evidence references and compact supporting passages with every material recommendation. Markdown can be a presentation format, but it must not replace evidence IDs, source revision identity, observation time, or support scope.

### Agent tools benefit from a small surface

The full HTTP API may support detailed filters. MCP and skill instructions should expose only distinctions that agents use reliably. More controls are not automatically a better agent interface.

### Telemetry should identify the access path

The canonical service should record whether a request originated from HTTP, CLI, MCP, a skill-driven client, the human application, or an internal Brokie role. This enables routing evaluation and safe budget enforcement without changing result ranking.

## Brokie architectural direction

### Applied to v0.1

The first implementation pass now connects the typed architecture end to end:

- librarian output enters the immutable v0.1 revision store and revision review queue;
- the v0.1 review command appends deterministic catalog trust, reject, or revision-request events;
- the read-only API queries only the `current_published_revisions` projection;
- typed search results preserve explicit types, coverage state, revision identity, compact sources, and exact evidence;
- coverage reports distinguish known revisions from published opportunities;
- `/openapi.json` is the documented contract and the web explorer consumes the same endpoints;
- bounded inputs, request and header timeouts, header limits, and regression fixtures protect the initial HTTP boundary.

This completes the typed publication and read path, not the whole direction below. The CLI-over-HTTP, Brokie skill, MCP adapter, origin telemetry, richer coverage states, and build/inspiration evaluation remain later work. The legacy refresh/snapshot path also remains separate and must converge before the old catalog can be removed.

### Canonical boundary

The durable external boundary should be a versioned, read-only JSON API backed by the current trusted catalog projection. An OpenAPI description should document that contract. The API must not read directly from unreviewed librarian candidates when serving trusted recommendations.

The API can now serve the v0.1 typed catalog through one trusted published projection, while retaining a v0.0.1 compatibility fallback. The typed path is the forward contract; the legacy refresh and snapshot pipeline still needs to converge before the compatibility catalog can be removed or the agent contract declared stable.

### Access surfaces

Expected access surfaces, in approximate order:

1. REST/JSON API with an OpenAPI description.
2. A small CLI over that same API.
3. An installable `brokie-savings` agent skill covering routing, evidence use, uncertainty, and fallback behavior.
4. A read-only MCP server exposing a deliberately small subset of the API.
5. Versioned JSON and SQLite snapshots for bulk, local, and offline consumers.
6. SDKs after the HTTP contract stabilizes.
7. A2A or another remote-agent task protocol only when Brokie performs asynchronous delegated planning, rather than ordinary queries.

The public product may later include a richer agent or application UI, but no UI should become the only way to access structured results.

### Candidate operations

Names remain provisional. The smallest useful read surface is likely to cover:

- search for opportunities by goal, capability, or constraint;
- retrieve one opportunity and its current trusted revision;
- retrieve the evidence supporting material fields;
- inspect catalog coverage, freshness, and changes;
- evaluate explainable eligibility for supplied profile facts;
- later, construct or compare plans;
- later, explore opportunity-driven project possibilities.

Corrections, candidate submissions, applications, publication, and other writes require separate tools, credentials, permissions, and review paths. They must not be hidden side effects of read operations.

### Agent response contract

Agent-facing results should retain:

- stable product, opportunity, revision, and evidence IDs;
- explicit record and opportunity types rather than type inference from an ID prefix;
- goal and capability fit;
- likely eligibility, supplied facts, assumptions, and unknowns;
- current, normal, and later costs when supported;
- advertised value and realistic savings as separate fields;
- duration, expiration, stacking, setup, and migration risks;
- source URLs, evidence passages, and observation/freshness dates;
- publishability and coverage state;
- ranking reasons and conditions that could change the ordering.

A simplified projection must not silently discard freshness, uncertainty, opportunity type, or evidence state.

### Initial safety boundary

- Ship read-only agent access first.
- Treat all source and catalog prose as untrusted data, never instructions to the consuming agent.
- Do not put credentials, the corpus, ranking logic, or eligibility policy in the skill.
- Give submission and correction workflows separate scopes.
- Never allow agent feedback to mutate trusted knowledge directly.
- Preserve the zero-dollar operating constraint with explicit request and provider budgets.

## Development method

Firecrawl's Developer Index can be used as a research instrument while building Brokie's corresponding surfaces:

1. Search broadly for the architectural question or failure mode.
2. Inspect matched primary artifacts rather than relying on marketing pages.
3. Narrow to a repository or artifact type only after useful vocabulary and likely locations emerge.
4. Prefer the merged change over the issue report when they disagree.
5. Read the relevant source and tests before adopting a pattern.
6. Separate observed implementation from inference, especially when a backend is private.
7. Record the transferable lesson and any deliberate Brokie difference here or in a later ADR.

For every agent-access change, verify:

- the canonical HTTP schema is the source of truth;
- adapters do not duplicate ranking or trust policy;
- tool and skill descriptions route the same request consistently;
- rich and simplified projections declare any information loss;
- coverage gaps differ from empty results;
- evidence, freshness, uncertainty, and identity survive the response;
- request origin, limits, and budgets are recorded;
- read operations have no hidden writes;
- routing and response shapes have regression fixtures;
- agent outcomes are evaluated, not just schema validity.

## Evaluation implications

SaveDex should eventually include an agent-distribution track. At minimum it should measure:

- correct selection between build and inspiration behavior;
- correct tool or endpoint routing;
- retrieval of relevant opportunities without vendor names;
- preservation and citation of evidence;
- correct handling of no-match, no-coverage, stale, and blocked states;
- eligibility and constraint adherence;
- refusal to collapse advertised value into realistic savings;
- consistency among HTTP, CLI, MCP, and skill-driven answers;
- unsafe attempts to submit, publish, purchase, or mutate data through read tools.

## Provisional implementation sequence

1. Converge the typed v0.1 catalog and the existing API on a single trusted published projection.
2. Define a versioned query and response contract using representative fixtures.
3. Implement REST/JSON and publish its OpenAPI description.
4. Add a thin CLI and the first Brokie skill over the same contract.
5. Add a thin read-only MCP adapter.
6. Add SaveDex routing and response-consistency tests.
7. Revisit asynchronous agent protocols only when Planner work requires durable remote tasks.

This sequence is design input, not an active milestone commitment.

## Primary references

Observed on 2026-08-24:

- [Firecrawl Developer Index product page](https://www.firecrawl.dev/developer-index)
- [Firecrawl Developer Index guide](https://docs.firecrawl.dev/features/developer)
- [Firecrawl Developer Index skill](https://github.com/firecrawl/cli/blob/main/skills/firecrawl-developer-index/SKILL.md)
- [Firecrawl developer API gateway](https://github.com/firecrawl/firecrawl/blob/main/apps/api/src/controllers/v2/research-proxy.ts)
- [Firecrawl developer-to-web projection](https://github.com/firecrawl/firecrawl/blob/main/apps/api/src/search/developer.ts)
- [Firecrawl CLI adapter](https://github.com/firecrawl/cli/blob/main/src/commands/developer.ts)
- [Firecrawl MCP adapter](https://github.com/firecrawl/firecrawl-mcp-server/blob/main/src/developer.ts)
- [Firecrawl DevDex benchmark](https://github.com/firecrawl/benchmark-devdex)
- [Model Context Protocol tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [OpenAPI specification](https://spec.openapis.org/oas/)
- [Agent2Agent protocol specification](https://a2aproject.github.io/A2A/latest/specification/)
