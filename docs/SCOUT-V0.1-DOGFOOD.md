# Scout v0.1 dogfood report

Generated from the persistent Scout ledger and its referenced immutable packets. No source bodies, credentials, cookies, authorization headers, or raw provider responses are included.

## Run

- Run ID: `scoutrun_e38a1d58594c4e9b8689eda7a6552d08`
- UTC start: `2026-08-25T03:41:44.491Z`
- UTC finish: `2026-08-25T03:43:28.447Z`
- Scout version: `0.1.0`
- Seed locator: `C:\Users\asas\Projects\free-for-dev`
- Exact Git commit: `7b1e6ff03ab269b364928692abe2eed1510d2cec`
- Provider: `nvidia`
- Requested model: `nvidia/nemotron-3-ultra-550b-a55b`
- Resolved model(s): `nvidia/nemotron-3-ultra-550b-a55b`
- Run status: `completed`

## Budget accounting

| Resource | Configured maximum | Consumed |
| --- | ---: | ---: |
| HTTP requests | 20 | 10 |
| Content pages | 15 | 6 |
| Accepted raw bytes | 3000000 | 1891527 |
| Elapsed run milliseconds | 180000 | 103956 |
| Inference calls | 16 | 10 |
| Acquisition depth | 1 | 1 |

The elapsed deadline governs model and tool work. Consumed wall time also includes harness-owned packet finalization; an in-flight call is aborted at the deadline before that finalization begins.

## Catalog boundary

Files inspected: `README.md`. The selected boundary was the Markdown list structure recorded by the harness; the model selected exact byte ranges from that inspected structure rather than applying a source-specific parser.

## Packets

| # | Source label | Selection reason | Packet ID | Investigation | Store |
| ---: | --- | --- | --- | --- | --- |
| 1 | ChromeRemoteDesktop | Representative entry under 'Major Cloud Providers' with a followable HTTPS link to Google's remote desktop service | `scoutpkt_sha256_5d86ed744303931e030982d196295ec9e89a14bb1f693d754612e2647ab311f1` | complete | emitted |
| 2 | RocketGit | Listed under 'Source Code Repos' with a followable HTTPS link to rocketgit.com | `scoutpkt_sha256_068abbd8b31da34d49bdbd0ba923065b9d604bdf7cb828d4d6b96bd62e728c6d` | complete | emitted |
| 3 | DB Designer | Listed under 'APIs, Data, and ML' with a followable HTTPS link to dbdesigner.net | `scoutpkt_sha256_70a7104abf1e0280e3f747bb9fa27e8608a94bdb180786901f421ec36ff08183` | complete | emitted |
| 4 | buddy.works | Listed under 'CI and CD' with a followable HTTPS link to buddy.works | `scoutpkt_sha256_2a3e365c4ecf8fe53b10a922451ef81e70e9283d7e7261b69246ed50ef64c9f5` | complete | emitted |
| 5 | render.com | Listed under 'Web Hosting' with a followable HTTPS link to render.com | `scoutpkt_sha256_c65629b48ff962b071c5472f7f45f8ef51713e35edcc00a2ac0e76278ff41797` | complete | emitted |

Emitted packets: 5. Reused packets: 0.

## Followed URLs

- ChromeRemoteDesktop: `https://remotedesktop.google.com/` → `https://remotedesktop.google.com/` — acquired
- RocketGit: `https://rocketgit.com/` → `https://rocketgit.com/` — acquired
- DB Designer: `https://www.dbdesigner.net/` → `https://www.dbdesigner.net/` — acquired
- buddy.works: `https://buddy.works/` → `https://buddy.works/` — acquired
- render.com: `https://render.com/` → `https://render.com/` — acquired

## Deliberately skipped selected links

- None.

## Normalized failures

- Run: `invalid_agent_action`

## What Scout could not determine

- No acquisition uncertainty was recorded.
- Scout intentionally did not determine catalog identity, entitlements, eligibility, capabilities, verification, or publication state.

## Reproduce

```powershell
npm run scout:v01 -- --kind='git' --seed='C:\Users\asas\Projects\free-for-dev' --provider='nvidia' --model='nvidia/nemotron-3-ultra-550b-a55b' --target-packet-count=5 --max-requests=20 --max-pages=15 --max-bytes=3000000 --max-elapsed-ms=180000 --max-inference-calls=16 --max-depth=1 --report='docs/SCOUT-V0.1-DOGFOOD.md'
```

The command requires the named provider credential in the environment. It has no paid-provider fallback.
