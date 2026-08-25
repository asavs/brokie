# Scout v0.2 corrective dogfood report

This report records the corrective five-subject evaluation. It is assembled from the
Scout ledger, immutable packet store, packet-derivation manifest, and retained
Librarian runs. It intentionally excludes raw third-party pages, provider responses,
credentials, cookies, authorization headers, and the ignored runtime cache.

## Verdict

The v0.1 acquisition kernel remains useful: it acquires immutable byte-addressed
artifacts, enforces budgets, records failures, and emits packets the Librarian can
consume. It did not prove research quality. In v0.1, `complete` meant the bounded
acquisition workflow completed, not that the offer question was answered.

The corrective slice now represents the research objective and per-topic outcomes
separately from transport and content state. An HTTP 200 page can therefore remain
`resolved` and its questions can remain `blocked`. Render demonstrates that behavior
in this evaluation. Scout-selected findings cite exact bounded excerpts in stored
readable artifacts; raw HTML remains preserved but is not selected wholesale as
evidence or passed wholesale to the Librarian.

Fan-out remains paused. The model route is still noisy, one final candidate handoff is
conservative to the point of being sparse, and the five subjects need human review
before this approach is scaled.

## Research request

> Find current authoritative evidence for the offer described by this collection
> listing, including its free/discounted benefit, numerical limits, requirements,
> eligibility, and material caveats.

The typed topics are `benefit`, `numerical_limits`, `requirements`, `eligibility`, and
`material_caveats`. Outcomes are `answered`, `partially_answered`, `not_found`,
`conflicting`, or `blocked`; they are not inferred from HTTP status.

## Evaluation provenance

The final review set contains five validated packets selected from four bounded live
runs. This is not represented as one pristine five-packet run. The first full run
finished partially because free-model provider/protocol failures consumed its time
budget. Focused runs then re-investigated the incomplete subjects under smaller
budgets. The packet-set manifest is
`docs/evaluations/scout-v0.2-corrective-packet-set.json`.

All live inference used the explicitly selected free route
`nvidia/nemotron-3-ultra-550b-a55b`, with reasoning disabled for typed actions and no
paid fallback.

| Selected subjects | Run ID | Result | Configured budget | Consumed budget | Recovery/failure summary |
| --- | --- | --- | --- | --- | --- |
| ChromeRemoteDesktop, render.com | `scoutrun_cb1610e7088c4c33b95987e5d5fe832b` | partial | 30 requests; 12 pages; 5,000,000 bytes; 1,800,000 ms; 40 inference calls; depth 2 | 16 requests; 11 pages; 3,351,599 bytes; 1,801,645 ms; 37 inference calls; depth 2 | 21 invalid actions, 5 provider errors, then time budget exhausted |
| RocketGit | `scoutrun_460a39de7c474a4585bfd51385f1ef15` | completed | 30 requests; 12 pages; 5,000,000 bytes; 1,800,000 ms; 40 inference calls; depth 2 | 14 requests; 10 pages; 2,919,665 bytes; 27 inference calls; depth 2 | 11 invalid actions, 7 provider errors; recovered |
| DB Designer | `scoutrun_95f418285ab347da87794a87d573a348` | completed | 8 requests; 3 pages; 1,500,000 bytes; 900,000 ms; 12 inference calls; depth 2 | 3 requests; 3 pages; 789,800 bytes; 10 inference calls; depth 2 | 2 invalid actions, 3 provider errors; recovered |
| buddy.works | `scoutrun_9c616f6c2f0b4e4b853bbfb446dfbba9` | completed | 8 requests; 3 pages; 1,500,000 bytes; 900,000 ms; 12 inference calls; depth 2 | 3 requests; 3 pages; 887,075 bytes; 7 inference calls; depth 2 | 2 provider errors; recovered |

An operator quoting error also created retained run
`scoutrun_ca475c7ff35146cb94c14471dddad75d`: PowerShell split an unquoted `DB Designer`
target. It is excluded from the packet set but retained as inspectable evaluation
history.

## Research results

### ChromeRemoteDesktop

- Packet: `scoutpkt_sha256_cf7098fb8d49588dec552404ee8248fa52fcb26c13aab646eca4a1df83042662`
- Outcomes: benefit `answered`; numerical limits `partially_answered`; requirements
  `answered`; eligibility `answered`; material caveats `answered`.
- Pages: collection `README.md`; `https://remotedesktop.google.com/`;
  `https://remotedesktop.google.com/unsupported-browser/?target=/access`.
- First-party capability evidence says it is an easy way to connect remotely or share
  a screen (`exc_sha256_52f3c4501535a75ee70604e3af0861ab902ffc08e50010e0ad8902293614c741`,
  readable artifact
  `art_sha256_0119a34b4cb474e3c5b4b975d2598f2836cf5e602b404e282330f79121c6e4d2`).
- The collection's “practically no limit” device claim and Google-account requirement
  remain collection-local evidence
  (`exc_sha256_95a9d91ea4c7a6b17d64894b1349273f9993d8111f1d7b8aa310765e055ae7a3`).
  The device limit was not corroborated by the inspected first-party pages and remains
  explicitly unresolved.
- The unsupported-browser page supplies a material modern-browser/WebRTC caveat
  (`exc_sha256_eb14937fbef253b0d137939f30303feb6779b5c7188d6f932240020613c49b37`,
  readable artifact
  `art_sha256_569b2b6b2df2cc4a66386c9a98f45fa531734c4c940f84e7f4c916dd45a3e817`).

### RocketGit

- Packet: `scoutpkt_sha256_b0b2964202c83f6e9edbf7690f8f25a27122fdbde6c08b54c1e7aca881b0ff64`
- Outcomes: all five topics `answered`.
- Pages: collection `README.md`; `https://rocketgit.com/`;
  `https://rocketgit.com/op/pricing/P=1-4156466-31d90363`.
- Strong first-party corroboration includes “rocketgit.com is free”
  (`exc_sha256_2de98bbacfe8e96b28090d5ee1af68cbc95baeb0f7fcb920ce49b1af2ceff9fd`)
  and unlimited public and private repositories
  (`exc_sha256_b6b7370341b7b3fc019c25306c763772ce889dac6ab9ca0097446ef54abfbabc`).
  Both resolve into readable artifact
  `art_sha256_5fc55a9f61ea8fef1be752f3cf3152b95646c1c4af69ab4d8e9a87a170358d95`.
- The same source also exposes hosted and behind-the-firewall use, account creation,
  and best-effort support without Scout turning those statements into canonical
  catalog entitlements.

### DB Designer

- Packet: `scoutpkt_sha256_1cefc605f532df5892778222ff0ab967fd2afbc86a726d60138550ba8c558594`
- Outcomes: all five topics `answered`.
- Pages: collection `README.md`; `https://www.dbdesigner.net/`;
  `https://www.dbdesigner.net/plans/`.
- The Plans page identifies Starter and its exact `2 Database Models` and `10 Tables
  Per Model` limits
  (`exc_sha256_424b66f5f38ae71f988e920941e517d57b95ca92dab520ff35925416d92860cb`,
  `exc_sha256_a5176cffd35d610b4b39b08e9faf83888585a963461a0dc7c066a01c71a3abd2`,
  readable artifact
  `art_sha256_14314c015a4e0b7588df65692eefa2ba064c47f909db455bf5fe2e88ffeff4b6`).
- The same page separately exposes Starter, Academic, Non-Profit, and Open Source
  audiences (`exc_sha256_a23ac794022aab8d9b9ad33554787ea6935d85f073837f0283fd7dd882d9683d`,
  `exc_sha256_fd496e5bf890a152a4c17781ec78e20cb6b48457a9fb72b62acc4da21932ef9f`,
  `exc_sha256_9e4828e9b88a4be53aba59dea239f9b2ca516f42dc894f9cfa34cf98e8fcd38f`,
  `exc_sha256_e8ac2feed30f5dc4e32872a89b85d513f2fb5801a9af5cbf384ad0da7f67380f`).
  Scout preserves those source-local statements; Librarian still owns opportunity
  decomposition and eligibility normalization.
- The live model originally called the collection and first-party statements a
  conflict while describing them as equivalent. A deterministic immutable derivation
  removed that self-disclaimed conflict and recomputed the packet ID. The source packet
  and derivation manifest remain retained.

### buddy.works

- Packet: `scoutpkt_sha256_a6cee25280c02607d6b33a7d29d472cd422f0ee26660dcec0583fd3ee60771bb`
- Outcomes: benefit `answered`; numerical limits `conflicting`; requirements
  `answered`; eligibility `answered`; material caveats `partially_answered`.
- Pages: collection `README.md`; `https://buddy.works/` (resolved but not treated as
  inspected evidence); `https://buddy.works/pricing`.
- The current pricing page says `Free`, `No credit card required`, and records a free
  plan with 1 seat, 1 concurrent execution, 300 pipeline GB-minutes, 1 GB cache, 300
  sandbox CPU-minutes, and 730 sandbox GB-hours. Representative exact excerpts are
  `exc_sha256_166978e630423ce0808ee8943d8b7a8657e11ab2b6ad0054e82d9f17e26ada9a`,
  `exc_sha256_e1ee57f915127e9fef23b5bc04da45c699a86e9664c7ca51d0c0565bf68280b4`,
  and `exc_sha256_735e7e206dc15e888b0e609365498918a9b8e5f351a7e9d5da5e000e4c08d9a9`
  in readable artifact
  `art_sha256_b43727b02d7e5d61d316115565b95e4c575aa73ff496b81171a4b77f26773e5f`.
- These terms conflict with the collection's five-project/120-execution description
  (`exc_sha256_a1b766ea9e92c9365761fc8ea0caa4f2f240e15165c382afb59d77b1a67aa5ef`).
  Permanence versus trial, current project-count limits, and the meaning of the older
  execution count remain unresolved.

### render.com

- Packet: `scoutpkt_sha256_fc95e9c0a3dd46c6b22e8de5b8db33f99978460a0500babaa19f0daf45141b40`
- Outcomes: all five topics `blocked`.
- Pages: collection `README.md`; `https://render.com/`;
  `https://render.com/pricing`.
- Both HTTP pages returned successfully and were stored, but remained `resolved`, not
  `inspected`. The pricing shell's raw and readable artifacts are
  `art_sha256_85b575ece6ff52be6689849574c5be5bee9c48c8c041e42b284f0cb385b273be`
  and `art_sha256_3b63297f4e27a4906cf542c2fbb51d80d572739e7f31ddb6d9337999259fd528`.
  No finding or selected research excerpt was fabricated from those bytes. The packet
  truthfully says the bounded research did not complete.

This is the acceptance example that HTTP 200 and even a stored readable transform do
not imply `answered`, `inspected`, or research-complete.

## Librarian handoff

All five packets were passed through the real free Librarian route. The handoff
preserved the packet ID, topic outcomes, exact excerpts, source URLs, acquisition and
artifact lineage, conflicts, and unresolved questions. The legacy `raw_text` field is
still present for compatibility, but now contains bounded exact Scout evidence rather
than whole homepages. Every result remains `review_required`; nothing was published.

| Subject | Attempts | Candidate summary |
| --- | ---: | --- |
| Chrome Remote Desktop | 1 | Remote desktop application for secure access, screen sharing, collaboration, and support; no offer opportunity proposed. |
| RocketGit | 2 | Git repository hosting with unlimited public/private repositories as a hosted service or behind-the-firewall installation; no offer opportunity proposed. |
| DB Designer | 1 | Cloud-based database schema design and modeling tool; no offer opportunity proposed. |
| Buddy CI/CD | 1 | CI/CD platform for automated build, test, and deployment pipelines; no offer opportunity proposed. |
| Render | 1 | Unified cloud to build and run apps and sites; no offer opportunity proposed. |

The final results file is
`var/scout-v0.2-corrective/runs/scout-v0.2-corrective-five-handoff4-librarian-results.json`.
Per-packet candidate databases, attempts, and review state are under
`var/scout-v0.2-corrective/librarian/handoff4/<packet-id>/`.

The final candidates are deliberately conservative but too sparse: the free model
proposed unsupported capability vocabulary, the deterministic normalizer removed those
unknown facets, and it withheld the dependent opportunity instead of laundering an
unsupported catalog claim. Earlier `handoff2` and `handoff3` attempts are retained for
comparison, but are not substituted for this final five-packet proof.

## Exact live commands

Full five-target Scout run:

```powershell
npm.cmd run scout:v02 -- --kind=git --seed=C:\Users\asas\Projects\free-for-dev --provider=nvidia --model=nvidia/nemotron-3-ultra-550b-a55b --targets=test\fixtures\scout-v02-dogfood-targets.json --target-packet-count=5 --max-requests=30 --max-pages=12 --max-bytes=5000000 --max-elapsed-ms=1800000 --max-inference-calls=40 --max-depth=2 --timeout-ms=120000 --max-tokens=8000 --state-dir=C:\Users\asas\Projects\free-for-dev\.release-brokie\var\scout-v0.2-corrective --report=C:\Users\asas\Projects\free-for-dev\.release-brokie\docs\evaluations\scout-v0.2-corrective-dogfood.md
```

Focused Buddy run:

```powershell
npm.cmd run scout:v02 -- --kind=git --seed=C:\Users\asas\Projects\free-for-dev --provider=nvidia --model=nvidia/nemotron-3-ultra-550b-a55b --target-label=buddy.works --target-packet-count=1 --max-requests=8 --max-pages=3 --max-bytes=1500000 --max-elapsed-ms=900000 --max-inference-calls=12 --max-depth=2 --timeout-ms=120000 --max-tokens=8000 --state-dir=C:\Users\asas\Projects\free-for-dev\.release-brokie\var\scout-v0.2-corrective
```

Focused DB Designer run (the argument must remain quoted in PowerShell):

```powershell
npm.cmd run scout:v02 -- --kind=git --seed=C:\Users\asas\Projects\free-for-dev --provider=nvidia --model=nvidia/nemotron-3-ultra-550b-a55b "--target-label=DB Designer" --target-packet-count=1 --max-requests=8 --max-pages=3 --max-bytes=1500000 --max-elapsed-ms=900000 --max-inference-calls=12 --max-depth=2 --timeout-ms=120000 --max-tokens=8000 --state-dir=C:\Users\asas\Projects\free-for-dev\.release-brokie\var\scout-v0.2-corrective
```

Immutable DB Designer correction:

```powershell
npm.cmd run scout:derive-v02 -- --state-dir=C:\Users\asas\Projects\free-for-dev\.release-brokie\var\scout-v0.2-corrective --packet-id=scoutpkt_sha256_639c2b903c31c2b02da356677161a8bfe778df7d9cb2e13b3b67cd4bae926187
```

Final five-packet Librarian evaluation:

```powershell
npm.cmd run librarian:scout-v02 -- --state-dir=C:\Users\asas\Projects\free-for-dev\.release-brokie\var\scout-v0.2-corrective --packet-set=docs\evaluations\scout-v0.2-corrective-packet-set.json --provider=nvidia --model=nvidia/nemotron-3-ultra-550b-a55b --max-tokens=8000 --timeout-ms=120000 --state-label=handoff4
```

## Retained state

- State root:
  `C:\Users\asas\Projects\free-for-dev\.release-brokie\var\scout-v0.2-corrective`
- Ledger: `var/scout-v0.2-corrective/scout-ledger.sqlite`
- Immutable packets: `var/scout-v0.2-corrective/packets/`
- Raw and derived artifacts: `var/scout-v0.2-corrective/artifacts/`
- Restricted model traces: `var/scout-v0.2-corrective/restricted-traces/<run-id>/`
- Run manifests and Librarian results: `var/scout-v0.2-corrective/runs/`
- DB Designer derivation manifest:
  `var/scout-v0.2-corrective/runs/packet-derivation-scoutpkt_sha256_1cefc605f532df5892778222ff0ab967fd2afbc86a726d60138550ba8c558594.json`
- Final Librarian state: `var/scout-v0.2-corrective/librarian/handoff4/`
- Network diagnostic state: `C:\Users\asas\Projects\free-for-dev\.release-brokie\var\http-diagnostic`

Runtime state remains ignored and has not been deleted.

## Known gaps and deviations

- The retained final set spans four bounded runs because the free route did not
  reliably complete one five-subject run. Packet provenance makes this explicit.
- DB Designer uses a derived immutable packet. The original accepted packet
  `scoutpkt_sha256_639c2b903c31c2b02da356677161a8bfe778df7d9cb2e13b3b67cd4bae926187`
  and the deterministic derivation manifest are retained.
- Render proves truthful blocking, but live evidence did not identify a definitive
  browser-required state. `browser_required` is covered by deterministic tests, not
  claimed from this live page.
- Chrome Remote Desktop's capability is corroborated; its collection claims about
  free status, account requirement, and device quantity are not all independently
  corroborated by the inspected first-party pages.
- The Librarian handoff is a faithful structured bundle plus a bounded compatibility
  projection, not yet a fully native end-to-end catalog ingestion contract.
- The final Librarian candidates contain no proposed opportunities. That is safer than
  inventing controlled vocabulary, but it exposes a real vocabulary/prompt alignment
  weakness that must be fixed before fan-out.
- Free-model provider errors and action-shape repairs remain frequent. Their counts and
  restricted traces are retained rather than omitted.
- Browser automation, full free-for-dev fan-out, CSV, deployment, publication, and a
  `0.2.0` release remain out of scope.

