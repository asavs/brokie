# Librarian v0.2.1 corrective ten-listing evaluation

Date: 2026-08-26

Status: completed; model-contract repair accepted, bulk queue remains paused

## Decision

Keep the simplified Librarian and its deterministic compiler. The small proposal can
now preserve constraints, scoped requirements, external-credential facts, and
source-local verification requirements without changing the durable catalog contract.
Do not add source-specific parsing or broaden the controlled vocabulary in this
correction.

The rerun eliminated terminal provider failures, but it did not make weak model output
trustworthy. Three jobs were clean, four safely withheld an unsupported opportunity,
and nine still need semantic revision. Every accepted candidate remains review-only.

## What changed

The proposal and prompt are versioned `librarian-v0.2.1`. Compared with the first
evaluation, the model may propose:

- constraints, including retention, per-item limits, exclusions, and paid add-ons;
- boolean requirements scoped to an entitlement or the whole opportunity;
- required or explicitly unnecessary external credentials such as an API key;
- source-local requirements such as phone or identity verification without inventing
  an audience category.

The compiler validates entitlement targets and compiles all of these into the existing
catalog candidate `0.1.0` contract. It also rejects two additional nearest-tag errors:
an `API requests` quota alone is not evidence of `generic_service_api`, and generic
metrics are not `heartbeat_monitoring` without heartbeat or uptime evidence.

No capability vocabulary or persisted catalog schema changed. Generic cloud
monitoring and database design therefore remain honest vocabulary gaps.

## Boundaries and retained evidence

- Source state: `var/pipeline-url-final2`
- Source repository revision: `99d188953fbb2c7c522b97398f4830b91b58016f`
- Corrective evaluation state: `var/librarian-v0.2-ten-2026-08-26-fix1`
- Ten listings, sixteen provider jobs, at most two calls per job
- Maximum calls: 32; actual calls: 20
- Per-call timeout: 120 seconds
- No paid route or fallback route
- No Scout changes, web fetches, or main-queue consumption
- Final prompt SHA-256: `0F03F46977116833090AD836C2CC39F343983678CC5DE6591F4460CA5E00EE57`

Exact command:

```powershell
npm run eval:librarian:v02:ten -- --output-dir=var/librarian-v0.2-ten-2026-08-26-fix1
```

The retained run used the final prompt bytes while the in-development identity still
said `librarian-v0.2`. The code now calls those same bytes `librarian-v0.2.1`, giving
the corrected contract a distinct run identity. The two final generic CloudWatch
capability guards were added from the retained result and are covered by deterministic
regression tests; the retained candidate was not rewritten.

## Route results

| Route | Class | Jobs | Calls | Reported input/output tokens | Terminal failures |
| --- | --- | ---: | ---: | ---: | ---: |
| `google-antigravity/gemini-2.5-flash-lite` | quota | 5 | 6 | 31,410 / 1,031 | 0 |
| `nvidia-nim/minimaxai/minimax-m3` | free | 5 | 6 | 42,071 / 3,835 | 0 |
| `xai-oauth/grok-4.20-0309-non-reasoning` | quota | 6 | 8 | 49,540 / 1,056 | 0 |

Provider token accounting is not directly comparable. All sixteen jobs reached a
validated review candidate; four jobs needed the one allowed repair call.

## Adversarial semantic review

`clean` means faithful enough to the supplied collection listing for human review,
not current official verification or publication. `safe defer` means the final
compiler withholds the offer because no controlled capability is adequately supported.

| Job | Calls | Verdict | Finding |
| --- | ---: | --- | --- |
| Google AI Studio / Gemini | 1 | needs revision | Six limits are correct and unsupported `model_api` is removed, but the description still invents API delivery. |
| Google AI Studio / NVIDIA | 2 | clean | Function and all six model-specific limits are represented without the previous API overreach. |
| Google AI Studio / xAI | 1 | needs revision | Limits are correct, but the function-only description is replaced by an offer summary. |
| Brave Search API / Gemini | 2 | needs revision | Capabilities, credit, and card requirement are correct; the monthly cadence is omitted. |
| Brave Search API / NVIDIA | 1 | clean | Search capability, monthly USD 5 credit, and required card are all preserved. |
| Brave Search API / xAI | 2 | needs revision | The previous provider failure is gone, but repair drops the description and offer. |
| CloudWatch / Gemini | 1 | safe defer | Product description is useful; the offer is withheld because generic cloud monitoring has no controlled capability. |
| CloudWatch / NVIDIA | 1 | safe defer | Product-only output preserves the vocabulary gap without selecting a nearby tag. |
| CloudWatch / xAI | 1 | safe defer after final guard | The retained proposal repeats the old nearest-tag error; final generic guards remove all three unsupported capabilities and therefore withhold the offer. |
| Kaggle / xAI | 2 | needs revision | Product capabilities survive, but repair drops all compute benefits and verification requirements. |
| telemetry.dev / Gemini | 1 | needs revision | The new retention constraint and no-card condition work live, but retention is also incorrectly duplicated as an entitlement. |
| ShipStatic / xAI | 1 | needs revision | Hosting and no-cost access are useful; no-signup/repository/build facts and the paid-domain exclusion are omitted. |
| What Is My IP / NVIDIA | 1 | clean | Correct generic API/public-IP capabilities and the previously missed no-cost access. |
| Transcript LOL / Gemini | 1 | needs revision | Daily transcription allowance is correct; signup and no-external-key facts are still omitted. |
| Revdoku / xAI | 1 | needs revision | Agent-tag inflation is removed, but the model still flattens per-bucket and per-file limits instead of using constraints. |
| DB Designer / NVIDIA | 1 | safe defer | The proposal recognizes the free plan and both nested limits; the compiler withholds the opportunity because database design has no controlled capability. |

Totals after applying the final generic guards:

- 3 clean jobs
- 4 safe deferrals
- 9 candidates needing semantic revision
- 0 terminal provider failures

## What this proves

- The small contract can preserve a live card requirement and a live retention
  constraint.
- A collection-local free-access claim no longer disappears merely because no numeric
  quota is stated.
- Constraint and condition targets compile into the durable typed candidate and are
  range-checked.
- Unsupported capabilities can safely collapse an offer to product-only output.
- Provider completion and JSON validity are distinct from semantic quality.

The full external-credential and source-local `other` condition paths are proven by a
deterministic candidate-validation fixture. No live route in this sample actually used
those fields successfully, so live API-key, phone-verification, and identity-
verification recall remains unproven.

## Deliberate TODOs and known gaps

- Model recall: Kaggle, ShipStatic, Transcript LOL, and Revdoku omit facts the contract
  can now express. Keep these as model-evaluation failures; do not add listing-specific
  parsers.
- Model discipline: telemetry.dev duplicates retention as both benefit and constraint.
  A future generic semantic check may reject this pattern if a broader sample supports
  the rule.
- Vocabulary: generic cloud monitoring and database design still need a separately
  reviewed vocabulary release.
- Route choice: NVIDIA produced two of the three clean jobs but sometimes needed a
  repair and reported high token use. No route is yet approved for the full queue.
- Evidence: collection listings remain unverified aggregator evidence. Official-source
  confirmation is later Scout work.
- Bulk scale: the 1,291 queued packets remain untouched. Run another bounded sample
  before choosing a route and batch size.

## Conclusion

The overengineered part was the model boundary, not the durable catalog contract. The
corrective slice keeps one small proposal, one deterministic compiler, and one review
queue. It fixes the missing shapes without asking Scout to interpret catalog semantics
or asking the Librarian model to construct Brokie's persistence machinery.
