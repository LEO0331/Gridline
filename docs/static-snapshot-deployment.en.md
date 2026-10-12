# Static daily snapshot deployment

## Flow

Gridline separates **data refresh** from **site deployment**.

1. `Refresh daily dashboard snapshot` is scheduled at 06:17 Asia/Taipei daily (`22:17 UTC` on the preceding date), or manually via `workflow_dispatch` with `all` or `company-coverage` scope. GitHub's scheduler may start late; `generatedAt` is the source of truth.
2. The Node 22 job runs `scripts/publish-snapshot.js` without installing frontend dependencies. The publisher invokes the snapshot generator, which refreshes configured providers sequentially with bounded retries. Only retryable failed tickers are retried; denied publisher requests enter cooldown and are not repeatedly retried by the wrapper. Event providers apply their own bounded retry policy.
3. Price history is validated per ticker. Stooq is the primary demo provider and Yahoo Finance chart data is the fallback. Empty, stale, undersized, or incomplete price coverage is treated as degradation, not success. Weekend and holiday runs skip price requests only when every tracked ticker already has at least 60 valid sourced closes through the latest expected NYSE session; otherwise they perform a catch-up refresh. The strict expected-close gate remains in force.
4. Successful ticker results replace the corresponding source observations. A degraded ticker/source retains its last-known-good observations, so an upstream empty response cannot erase history. Incrementally discovered infrastructure events and company announcements remain accumulated even after successful checks; source cursors and prior verification dates persist.
5. The generator writes a **schemaVersion 4** `public/data/dashboard-snapshot.json` containing source health, outcomes, observations, versioned scores, `companyHistory`, `backtestCoverage`, and a compact `demoReadiness` summary, plus the matching runtime projection `dashboard-overview.json`.
6. `npm run demo:check` validates demo-critical invariants before anything is committed. If a blocker is present, the refresh workflow fails and the existing public snapshot remains unchanged.
7. When the generated snapshot artifacts change and pass the gate, the publisher commits them to `main`. It requires a clean tracked checkout with no unpublished commits. Up to three publication attempts detect concurrent `main` updates, discard only generated snapshot changes, fast-forward and regenerate; rejected-push recovery can undo only its verified snapshot-only commit. Other permission, validation or history errors stop the job, without force-pushing.
8. The refresh workflow then explicitly dispatches `Deploy to GitHub Pages` with `workflow_dispatch`. This explicit dispatch is required because GitHub suppresses ordinary workflow chaining for pushes created with the repository `GITHUB_TOKEN`.
9. The Pages workflow installs from the lockfile, runs the shared regression action and snapshot acceptance, builds the React app from refreshed `main`, and deploys the Pages artifact. Snapshot-only deployment skips Lighthouse; application deployment runs it. Documentation-only/build-output-only pushes skip deployment. Monday at 10:37 Asia/Taipei, the Pages schedule runs Lighthouse against the deployed site without rebuilding or publishing.

An always-running refresh summary reports source/ticker coverage, retained evidence, missing financial-field classifications and freshness warnings. If collection fails, the summary explicitly identifies that it may describe the previous published snapshot. See [Actions operation](actions-maintenance.md) for publication safeguards and schedules.

A snapshot commit by itself is **not** proof that GitHub Pages has been updated. Confirm the subsequent `Deploy to GitHub Pages` run, or compare the deployed `#health` generation time with the committed snapshot.

## What a successful refresh updates

The Action writes a new `generatedAt` timestamp and provider outcome/health metadata. Successful ticker results update their source observations; degraded results retain prior usable observations and receive a new checked/error status. Events and company announcements retain incremental history. The generator then calculates cited MA5/MA10 market signals, retains only v2 recorded signal history, and evaluates demo readiness. Market-price history and EIA observations move when those providers succeed. Manual `company-coverage` refreshes only `sec,company-research`, retaining price/grid data and still applying the complete snapshot gate.

The dashboard's snapshot labels read `generatedAt` directly from the deployed JSON and display it in the viewer's local time zone. The Data Health page exposes the exact UTC timestamp. `generatedAt` represents when the file was generated; an observation's own `observedAt` remains the date of the underlying market or operating data.

The previous Expansion/Pushback indexes, curated driver amounts, regional MW/stage/friction estimates, and invented company fundamentals/exposure scores have been removed from active views and new exports. The UI shows unavailable where dated primary-source measurements do not exist.

Historical context: the 2026-09-22 snapshot's legacy SEC numeric facts and EIA `rtoLoad` rows were withheld after an integrity review. Subsequent corrected refreshes restored dated SEC facts and EIA data; that historical degraded state is not the current coverage status. All 20 companies now have SEC revenue/EPS and company-specific research. The financial-field backfill recovered 15 previously missing debt/capex fields; five remain explicitly not separately reported. Consult the current snapshot's health and [company research coverage](company-research-coverage.md) for field definitions and publisher limitations.

The Events page uses a separate infrastructure-event pipeline. The scheduled `events` adapter currently discovers candidates from Loudoun County News RSS (with listing fallback), Oracle's corporate newsroom and Texas Governor news RSS/listing. It also reads exact records from `server/event-candidates.json`, currently two Loudoun articles and one Texas Governor policy article. PJM, ERCOT and Oracle investor news remain paused at the user's request; daily jobs do not request their endpoints or candidates. Previously verified records remain with their original dates. The Texas Governor publisher is not relabeled ERCOT, and Oracle corporate discovery does not resume Oracle investor news. Inactive Oracle OCI Blog/FERC alternatives are diagnostic only. See [event discovery](event-discovery.md) and the [source-decision log](event-source-decisions.md).

Candidates require a known primary-source host, a specific article path, a publication date, a relevant category and region, and an accessible page matching the candidate heading and publication evidence. Failed checks are reported as rejected and do not create public events. The separate company-research lane can use issuer-bound SEC releases; SEC filings do not automatically become infrastructure-event cards.

Events stay in Current for 30 days from publication, then appear in Archive. Both are views over the same records. A successful refresh retains earlier event observations and revisions in the static snapshot and SQLite rather than deleting them when they age out of Current. Partial provider access produces partial aggregate coverage; complete unavailability is degraded. Last-known-good events and provider success dates remain. The historical `public/data/event-review.json` still records the three manually reviewed pages checked on 2026-09-23, through 2026-09-22, with curated-only scope and no verified PJM RSS coverage. It is not the current automated check: newer snapshot event health takes precedence, without changing `generatedAt` based on that review. The October 12 snapshot reports partial coverage for the active Loudoun/Oracle/Texas Governor providers. Current check and last-success dates are in `sourceHealth.events.coverage.sources`. External sites can change or deny access after validation; the archive retains original URLs and dates.

To submit an exact primary record, add an object to `server/event-candidates.json` with an active `source` (`Loudoun`, `Oracle` corporate news, or `Texas Governor`), `title` matching the source page heading, `category` (`POWER`, `GRID`, `PERMIT`, or `CAPEX`), `publishedAt` as an ISO timestamp, `region`, and the article `url`. Adding a candidate does not activate a paused publisher. A factual `summary` requires an `evidenceText` excerpt and `dateText` visible on that page; the latter must match `publishedAt`. The daily job rejects generic pages, unrelated hosts, unreachable pages, title/date mismatches, and missing supporting text. Do not enter an inferred headline or an unverified date.

## Demo-readiness gate

The public snapshot must satisfy these critical checks before the daily workflow may publish it:

- snapshot schema is v4 or newer;
- `generatedAt`, `companyHistory`, `backtestCoverage`, and company-score methodology metadata are present;
- the enabled `trackedTickers` form a nonempty, unique subset of the supported 20-symbol universe, and each has at least 60 usable positive, dated, HTTPS-sourced daily closes through the latest expected NYSE session (today at or after 4:15 PM New York time; otherwise the previous trading session, skipping weekends and holidays), with latest prices no more than ten days old;
- no non-event provider may be labelled `ok` while reporting zero records;
- no historical reconstruction is required or exported.

The compact/full snapshots must match, any dated event-review artifact must pass its scope/date/HTTPS checks, and company scores must use the published price-signal methodology without invented fundamental/exposure scores. Snapshot age over 96 hours is a warning. All 20 symbols are enabled in the checked-in public snapshot: NBIS, CRWV, ORCL, AVGO, APLD, IREN, CIFR, CORZ, GDS, VNET, EQIX, DLR, IRM, VRT, ETN, ANET, PWR, GEV, CEG and BE.

Degraded optional providers are **warnings**, not automatic blockers, if the retained public snapshot still satisfies the critical data requirements. This makes partial-data behavior visible without unnecessarily taking down a useful demo.

Run the same gate locally with:

```bash
npm run demo:check
```

To run tests/build first and then validate the current static snapshot:

```bash
npm run verify:demo
```

`verify:demo` is expected to fail against an old or intentionally incomplete committed snapshot. Generate a current snapshot first when validating the end-to-end demo state.

## Setup

Add the provider configuration you intend to use under repository **Settings → Secrets and variables → Actions**:

- `SEC_USER_AGENT`
- `EIA_API_KEY`
- `PJM_API_KEY`
- `FERC_API_KEY`
- optional `COMPANY_IR_FEEDS`

The market-price demo providers do not currently require a repository secret. `PRICE_BASE_URL` and `PRICE_FALLBACK_BASE_URL` can be overridden in another deployment profile when using approved/licensed providers.

Supabase variables configure optional account functionality during the Pages build and the independent daily database heartbeat:

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_PUBLISHABLE_KEY`

Authentication is not required for the public research dashboard or the snapshot refresh. The existing project has the expanded-watchlist and health-function migrations applied. Fresh projects should apply `supabase/user-preferences.sql` (already supporting all 20 symbols), then `20261008_add_database_health.sql` for the heartbeat. `20261008_expand_watchlist.sql` upgrades older four-symbol constraints; it is not necessary for a table created from the current schema. See [Supabase health check](supabase-health-check.md).

## Failure policy

Gridline fails closed at the data boundary:

- HTTP success with zero usable observations is degradation, not success;
- failed/degraded sources do not erase last-known-good static history;
- if retained history still meets the demo-critical gate, the snapshot may publish with visible warnings;
- if market history, schema-v4 point-in-time data, or another critical invariant is missing, `demo:check` fails before the snapshot is committed;
- a total snapshot-script failure also fails the workflow and leaves the existing public artifact untouched;
- if snapshot commit succeeds but the explicit Pages dispatch fails, the repository contains the new data but the deployed site remains on the prior build. Re-run `Deploy to GitHub Pages` manually and investigate the dispatch step.

Use **Data status** in the main navigation (`#health`) to inspect the same snapshot that the deployed public dashboard is serving.
