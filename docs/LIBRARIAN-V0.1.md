# Librarian v0.1

The v0.1 librarian turns one normalized source record into a typed catalog proposal. The model classifies; deterministic code owns evidence validation, normalization, identity, immutable persistence, and review routing.

## Run one record

Build the synthetic fixture catalog first:

```bash
npm run build:fixture
```

Use OpenRouter's free-model router:

```bash
npm run librarian:v01 -- \
  --source-id=<source-id> \
  --provider=openrouter \
  --model=openrouter/free
```

Or select a free NVIDIA NIM endpoint explicitly:

```bash
npm run librarian:v01 -- \
  --source-id=<source-id> \
  --provider=nvidia \
  --model=nvidia/nemotron-3-nano-30b-a3b
```

The process reads `OPENROUTER_API_KEY` or `NVIDIA_NIM_API_KEY`. It refuses a paid OpenRouter route and never falls back to one. Use `--record=<path>` instead of `--source-id` to process a single normalized JSON record, and `--state-dir=<path>` to choose where run state is stored.

## Bounded workflow

1. Send the source text, candidate schema, and controlled vocabulary to the selected provider.
2. Parse and deterministically normalize safe structural mistakes while retaining the raw response.
3. Validate exact evidence, typed economics, vocabulary membership, scoped references, and semantic invariants.
4. If validation fails, make exactly one repair request containing the failures.
5. If a candidate passes, assign stable identities and append immutable catalog revisions.
6. Route those revisions to review. Passing model output is never published automatically.

Each provider attempt is written immediately to the state database. A JSON trace also records raw output, reasoning when supplied, normalization actions, validation failures, token usage, identity decisions, and final disposition.

## State layout

The default `var/v0.1` directory contains:

- `catalog-v0.1.sqlite`: typed immutable product and opportunity revisions
- `brokie-state.sqlite`: librarian runs, attempts, and the revision review queue
- `runs/<run-id>.json`: human-readable execution traces

The current boundary is deliberate: the librarian proposes catalog data for a small proof-of-concept subset. Research, publication, social posting, and autonomous infrastructure supervision remain later systems.
