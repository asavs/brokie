# WSL development and unattended operation

## Development baseline

Brokie is tested with Ubuntu on WSL 2 and Node.js 22. Keep the Linux checkout inside the WSL filesystem (for example `/root/brokie` during development or `/opt/brokie` for a service) rather than sharing `node_modules` through `/mnt/c`.

```bash
git clone https://github.com/asavs/brokie.git ~/brokie
cd ~/brokie
npm ci --ignore-scripts
npm test
```

Run a persistent refresh twice to observe change detection:

```bash
node packages/maintainer/job.mjs \
  test/fixtures/free-for-dev.md \
  test/fixtures/startup-offers.csv \
  --state-dir=var

node packages/maintainer/job.mjs \
  test/fixtures/free-for-dev-v2.md \
  test/fixtures/startup-offers.csv \
  --state-dir=var
```

Inspect and decide review items:

```bash
node packages/maintainer/review.mjs list --state=var/brokie-state.sqlite
node packages/maintainer/review.mjs show REVIEW_ID --state=var/brokie-state.sqlite
node packages/maintainer/review.mjs decide REVIEW_ID accepted --note="Verified source change" --state=var/brokie-state.sqlite
node packages/maintainer/promote.mjs --state-dir=var
```

Read `var/latest.json` for the current immutable snapshot paths, then start the API:

```bash
node apps/api/server.mjs \
  --catalog=/absolute/path/from/latest.json \
  --state=var/brokie-state.sqlite
```

The server binds only to `127.0.0.1:8787` by default and rejects non-GET methods. Test it with `curl http://127.0.0.1:8787/health`.

### Local review workstation

Review writes are disabled by default. To make decisions and leave structured card/tag feedback through the browser, explicitly enable them on a loopback-only development server:

```bash
node apps/api/server.mjs \
  --catalog=/absolute/path/to/trusted/catalog.sqlite \
  --state=var/brokie-state.sqlite \
  --host=127.0.0.1 \
  --review-writes=true
```

Open `http://127.0.0.1:8787/review`. Each response records the decision, desired controlled tags, overall comment, description-quality assessment, proposed source-grounded description, and requirements feedback. “Needs revision,” “merge,” and “unsure” remain unpromotable; browser review never promotes a snapshot.

The POST endpoint additionally requires same-origin JavaScript's custom local-review header and JSON content type. It has no CORS permission and should never be exposed directly beyond loopback. Public or shared review requires authentication and CSRF protection that v0.1.0 intentionally does not provide.

## Service shape

The files in `deploy/systemd/` document the intended Oracle/long-running Linux shape. Before using them:

1. create a dedicated unprivileged `brokie` user;
2. install the checkout at `/opt/brokie` and state at `/var/lib/brokie`;
3. place only source paths—not inference keys—in `/etc/brokie/brokie.env`;
4. promote a reviewed immutable snapshot to `/var/lib/brokie/current`;
5. keep the API loopback-only and use an authenticated reverse proxy or SSH forwarding.

The first successful refresh becomes the trusted baseline automatically. Later refreshes are compared with that promoted baseline—not merely the last observation—and cannot replace `var/current` until every change in the candidate run is accepted. Rejected or deferred changes therefore remain visible on later refreshes. Promotion is snapshot-wide in v0.1.0; partial merge decisions are a later feature.

The timer uses a randomized daily delay and a persistent schedule. The job uses an exclusive lock, logs one NDJSON record per attempt, and exits with code 75 when a prior refresh still owns the lock.

The current WSL distro defaults to `root`; that is acceptable for local experimentation but is explicitly not the Oracle deployment identity.
