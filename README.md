# Brokie

Find free and discounted resources by **what you need to accomplish**, rather than by the company providing them.

Brokie is an experiment in building an autonomous, provenance-conscious index of free tiers, credits, grants, and useful services. Version 0.1.0 introduced the typed Librarian pipeline, 0.1.1 connected its trusted publication path, and 0.2.0 adds a simple repository-to-Scout-packet queue for the Librarian. Models propose classifications, while deterministic code owns evidence integrity, normalization, stable identity, immutable history, and review routing.

## What 0.2.0 includes

- Read-only ingestion from a local or remote Git repository at an exact revision
- Deterministic discovery of a bounded Markdown or HTML collection
- One immutable, provenance-preserving Scout packet per explicit linked listing
- Idempotent fan-out into a resumable SQLite Librarian queue
- A headless OMP Librarian worker with explicit free, quota, and opt-in paid route classes
- The existing typed candidate, review, trusted publication, API, and explorer path from 0.1.x
- Regression coverage for Scout v0.1 and the new acquisition-only Scout v0.2 contract

This release proves acquisition and queueing. It does not claim that every queued listing has been classified, independently verified as current, accepted by a reviewer, or published.

## Requirements

- Node.js 22.13 or newer (`node:sqlite` is used)
- A Git repository containing a Markdown or HTML collection
- OMP on `PATH` for the v0.2 Librarian worker
- An authenticated free or explicitly authorized quota route in OMP for inference

## Install and test

```bash
npm install
npm test
```

The test uses synthetic fixtures and does not need credentials or private source data.
For a core deployment without the optional Pi comparison adapter, use `npm ci --omit=optional`.

## Queue a repository for the Librarian

```bash
npm run pipeline:ingest-v02 -- --seed=https://github.com/ripienaar/free-for-dev --state-dir=var/pipeline
npm run pipeline:librarian-v02 -- --state-dir=var/pipeline --limit=5 --route-class=quota --model=PROVIDER/MODEL
```

The first command performs deterministic collection fan-out without asking a model to emit every listing. The second command processes a bounded queue batch through OMP. Paid routes are refused unless the command explicitly includes `--allow-paid`. See the [v0.2 pipeline guide](docs/V0.2-PIPELINE.md) for state layout and operational details.

## Build an index

```bash
node packages/librarian/build.mjs /path/to/free-for-dev.md /path/to/startup-offers.csv
node packages/librarian/build-explorer.mjs
```

Then open `packages/librarian/generated/index.html`. Machine consumers can read `staging.json` or `brokie-v0.0.1.sqlite` in the same directory.

## Run the v0.1 librarian

```bash
npm run librarian:v01 -- --record=/path/to/normalized-record.json --provider=openrouter --model=openrouter/free
```

The runner reads the selected provider's environment key, refuses paid OpenRouter routes, and never falls back to one. See the [v0.1 librarian guide](docs/LIBRARIAN-V0.1.md) for NVIDIA usage, source-ID selection, state paths, and the bounded review workflow.

Review a generated revision and publish its immutable trust events:

```bash
npm run review:v01 -- list
npm run review:v01 -- decide REVIEW_ID accepted --note="Evidence verified" --reviewer=YOUR_ID
```

Then serve the trusted typed projection and its OpenAPI contract:

```bash
npm run serve
# http://127.0.0.1:8787/openapi.json
```

The server selects `var/v0.1/catalog-v0.1.sqlite` when present and otherwise retains the v0.0.1 fixture fallback.

## Project status

Version 0.2.0 is the first local repository-to-catalog pipeline milestone. A live read-only free-for-dev dogfood run produced 1,299 stable Scout packets and queued them idempotently. Bulk Librarian processing remains paused while its prompt size, repair frequency, and provider bake-off are improved. OMP is the current replaceable worker harness, not the owner of Brokie's evidence, queue, review, or publication policy.

The v0.1 catalog architecture is specified by the [typed data contract](docs/DATA-CONTRACT.md), its [Draft 2020-12 candidate schema](schemas/catalog-candidate.schema.json), a [versioned controlled vocabulary](schemas/vocabularies.v0.1.json), and an immutable [SQLite revision store](packages/catalog/schema.v0.1.sql). Librarian output is only a proposal: deterministic validation owns evidence integrity, scoped references, duplicate economics, indexing, and publication.

The provider-neutral [v0.1 librarian runner](docs/LIBRARIAN-V0.1.md) adds bounded model classification, one repair attempt, deterministic normalization, stable identity planning, inspectable traces, and mandatory review routing. It supports the OpenRouter free-model router and explicitly selected NVIDIA NIM endpoints without paid fallback.

See [the product brief](docs/PRODUCT_BRIEF.md) and [v0.0.1 experiment report](docs/V0.0.1-EXPERIMENT.md).

The authoritative long-term mission, Scout/Librarian boundary, trust model, and current roadmap live in the [Brokie north star](docs/NORTH-STAR.md). Future implementation work should treat it as the strategic source of truth.

The [runtime decision](docs/ADR-001-RUNTIME.md) retains Node for v0.1.x while keeping the durable boundaries portable and recording concrete triggers for reconsideration.

The working [agent-access and Firecrawl implementation study](docs/AGENT-ACCESS.md) records the skill-led, API-first distribution direction, emerging build and inspiration request modes, transferable implementation lessons, and safeguards for future HTTP, CLI, MCP, and skill work.

For current Linux commands and the eventual service shape, see [WSL development](docs/WSL-DEVELOPMENT.md).

## Relationship to free-for-dev

Brokie is an independent companion project inspired by and capable of consuming free-for-dev-style catalogs. It is not an upstream contribution or an official free-for-dev project.
