# Brokie

Find free and discounted resources by **what you need to accomplish**, rather than by the company providing them.

Brokie is an experiment in building an autonomous, provenance-conscious index of free tiers, credits, grants, and useful services. Version 0.1.0 introduced the typed librarian pipeline; version 0.1.1 connects it through review, trusted publication, the read API, and the explorer. Models propose classifications, while deterministic code owns evidence integrity, normalization, stable identity, immutable history, and review routing.

## What 0.1.1 includes

- Markdown and CSV ingestion with stable source IDs and line/row provenance
- A versioned JSON contract, controlled vocabulary, and immutable SQLite revision store
- Need-first capabilities with typed savings, limits, requirements, and uncertainty
- Free OpenRouter and NVIDIA librarian adapters with one bounded repair attempt
- Exact evidence validation, deterministic normalization, and inspectable run traces
- A typed read-only search API with OpenAPI, static explorer, refresh snapshots, and persistent review queues
- Lock-protected unattended Linux jobs and systemd templates

This release classifies supplied descriptions. It does not independently guarantee that an offer is current, available in a region, or compatible with another offer.

## Requirements

- Node.js 22.5 or newer (`node:sqlite` is used)
- A free-for-dev-style Markdown file
- A startup-offers CSV
- Optionally, an NVIDIA NIM or OpenRouter key for inference experiments

## Install and test

```bash
npm install
npm test
```

The test uses synthetic fixtures and does not need credentials or private source data.
For a core deployment without the optional Pi comparison adapter, use `npm ci --omit=optional`.

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

Version 0.1.1 is the local-first typed librarian proof of concept. Hermes and NemoClaw remain candidates for a later autonomous maintenance supervisor, not replacements for the deterministic evidence pipeline.

The v0.1 catalog architecture is specified by the [typed data contract](docs/DATA-CONTRACT.md), its [Draft 2020-12 candidate schema](schemas/catalog-candidate.schema.json), a [versioned controlled vocabulary](schemas/vocabularies.v0.1.json), and an immutable [SQLite revision store](packages/catalog/schema.v0.1.sql). Librarian output is only a proposal: deterministic validation owns evidence integrity, scoped references, duplicate economics, indexing, and publication.

The provider-neutral [v0.1 librarian runner](docs/LIBRARIAN-V0.1.md) adds bounded model classification, one repair attempt, deterministic normalization, stable identity planning, inspectable traces, and mandatory review routing. It supports the OpenRouter free-model router and explicitly selected NVIDIA NIM endpoints without paid fallback.

See [the product brief](docs/PRODUCT_BRIEF.md) and [v0.0.1 experiment report](docs/V0.0.1-EXPERIMENT.md).

The authoritative long-term mission, Scout/Librarian boundary, trust model, and current roadmap live in the [Brokie north star](docs/NORTH-STAR.md). Future implementation work should treat it as the strategic source of truth.

The [runtime decision](docs/ADR-001-RUNTIME.md) retains Node for v0.1.x while keeping the durable boundaries portable and recording concrete triggers for reconsideration.

The working [agent-access and Firecrawl implementation study](docs/AGENT-ACCESS.md) records the skill-led, API-first distribution direction, emerging build and inspiration request modes, transferable implementation lessons, and safeguards for future HTTP, CLI, MCP, and skill work.

For current Linux commands and the eventual service shape, see [WSL development](docs/WSL-DEVELOPMENT.md).

## Relationship to free-for-dev

Brokie is an independent companion project inspired by and capable of consuming free-for-dev-style catalogs. It is not an upstream contribution or an official free-for-dev project.
