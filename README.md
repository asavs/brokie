# Brokie

Find free and discounted resources by **what you need to accomplish**, rather than by the company providing them.

Brokie is an experiment in building an autonomous, provenance-conscious index of free tiers, credits, grants, and useful services. Version 0.0.1 contains the first librarian subsystem: it ingests supplied catalogs, keeps their original evidence, maps opportunities to controlled capabilities and user needs, and produces a searchable local explorer.

## What 0.0.1 includes

- Markdown and CSV ingestion with stable source IDs and line/row provenance
- A normalized SQLite schema and JSON staging format
- Deterministic selection and initial annotations for AI, inference, and adjacent compute
- A need-first static explorer
- Direct and Pi-based zero-cost inference experiments
- A small human-reviewed evaluation set

This release organizes supplied descriptions. It does not independently guarantee that an offer is current, available in a region, or compatible with another offer.

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

## Build an index

```bash
node packages/librarian/build.mjs /path/to/free-for-dev.md /path/to/startup-offers.csv
node packages/librarian/build-explorer.mjs
```

Then open `packages/librarian/generated/index.html`. Machine consumers can read `staging.json` or `brokie-v0.0.1.sqlite` in the same directory.

## Inference experiment

```bash
node packages/librarian/run-direct.mjs --provider=nvidia --model=nvidia/nemotron-3-ultra-550b-a55b
node packages/librarian/evaluate.mjs packages/librarian/generated/runs/<trace>.json
```

The runner refuses to operate without the selected provider's key and never falls back to a paid route.

## Project status

This is intentionally v0.0.1. The immediate roadmap is a read-only search API, refresh/change detection, a persistent review queue, larger evaluations, and unattended Linux execution. Hermes and NemoClaw are candidates for the later autonomous maintenance supervisor, not replacements for the deterministic evidence pipeline.

See [the product brief](docs/PRODUCT_BRIEF.md) and [v0.0.1 experiment report](docs/V0.0.1-EXPERIMENT.md).

## Relationship to free-for-dev

Brokie is an independent companion project inspired by and capable of consuming free-for-dev-style catalogs. It is not an upstream contribution or an official free-for-dev project.
