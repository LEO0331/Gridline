# Gridline — Data Center Infrastructure Intelligence

Gridline is a bilingual, focused research workflow for one question: **Is the data-center buildout showing up in grid demand, project decisions, company disclosures, and market prices?** It brings dated evidence and its original sources together so a researcher can examine those four views without treating correlation as causation.

Broker platforms support trading, while [Yahoo Finance](https://finance.yahoo.com/portfolios) already provides watchlists, market data, news, charts and research. Gridline's contribution is a narrower, source-first investigation: show what each record supports, when it was last checked, and where evidence is missing. It does not have exclusive market data or demonstrated predictive skill, and it is not an automated trading system or investment advice.

Public demo: [Gridline](https://leo0331.github.io/Gridline/)

Demo readiness: [English](docs/demo-readiness.en.md) · [繁體中文](docs/demo-readiness.zh-TW.md)  
Account setup (optional Supabase): [English](docs/accounts.en.md) · [繁體中文](docs/accounts.zh-TW.md)

Documentation reviewed against the current implementation on **2026-10-12**. Browse the [documentation index](docs/README.md) for current guides and dated historical reports.

## The research workflow

| Question | Current evidence | What it cannot establish alone |
| --- | --- | --- |
| Is grid demand changing? | Complete, comparable days of EIA-reported actual PJM load. | Regional load does not isolate data centers or prove that a project secured power. |
| Are projects moving forward or meeting constraints? | Dated, verified primary-source permitting, grid and company records, with each record's last successful check date. | A milestone does not quantify capacity or establish an effect on a tracked company without a documented link. |
| What did companies disclose? | Period-aware SEC revenue, diluted EPS, available capex/debt, filings and dated official announcements for 20 companies. | Definitions and reporting periods differ; these records do not establish earnings quality, valuation or buildout attribution. |
| How have market prices behaved? | Dated closes, descriptive trend/momentum/volatility methods and a separate retrospective price test. | Price behavior does not explain its cause or prove future returns. |

Start with a company or region, inspect the four evidence views, open the underlying records, and check source dates and gaps in Data Health. The researcher makes the synthesis; the dashboard does not combine these views into a buy/sell score. A new feature belongs in the primary workflow only if it answers one of these questions with a dated source, an explicit rule and a clear evidence boundary.

## What the demo demonstrates

- **Infrastructure intelligence** — region navigation and verified primary-source milestones; unsourced regional capacity/stage figures are withheld.
- **Four-lane research brief** — grid demand, project decisions, company disclosures and market prices appear together for a selected company and region, each with its date, source and evidence boundary.
- **Documented relationship register** — three reviewed records connect Oracle–Abilene–ERCOT, Cipher–Apollo–ERCOT development, and Constellation–Crane–PJM planned power supply. Each preserves publication/review dates and distinguishes plans from operating capacity.
- **Company research** — all 20 companies have filing references, supported financial facts, dated official developments and bilingual research questions. Audited definitions distinguish reported zero, unavailable, stale and not-separately-reported fields; issuer-bound SEC alternatives support restricted publishers.
- **Price lookback** — 30D / 90D / 1Y observed closes with explicit insufficient-history states.
- **Lightweight price chart** — native SVG 30 / 60 / 90-session views use the same dated close observations, keep one continuous provider segment, link back to the price source, and overlay dated state-change markers from the currently selected technical method.
- **Previous-snapshot diff** — each refresh compares material customer-facing changes against the immediately preceding committed snapshot: latest closes, recorded trend-signal state, verified event additions/updates/archive transitions, and source-health status.
- **Demo hardening** — explicit snapshot loading/error/empty states, retry, observation-recency labels, keyboard-inspectable SVG charts, modal focus handling, visible focus states, skip navigation, and mobile navigation that remains available below desktop widths.
- **Auditable provenance** — deterministic observation IDs, provider/source metadata, observation and retrieval dates, origin URLs and lineage.
- **Extensible technical signals** — a common registry covers trend/moving averages, RSI momentum and Bollinger volatility with dated evidence, provider continuity checks and descriptive states rather than buy/sell verdicts.
- **Persistent history** — the Node API profile stores immutable observations, source health, score snapshots, scenario runs and backtest runs in SQLite/WAL.
- **Scenario Lab (supporting worksheet)** — records bounded user assumptions for power, demand, CAPEX and regulation without presenting them as observed evidence or an uncalibrated forecast.
- **Retrospective price test (method check)** — MA5/MA10 crossover outcomes using the next observed session and a ten-session exit, with pending windows and no-look-ahead rules; it does not test the whole buildout thesis.
- **Data Health** — `#health` exposes market-snapshot freshness, source status, price coverage, and the separately dated event review.
- **Coverage exceptions** — the Events view reports the configured feed/candidate scope, accepted and excluded counts, excluded reasons, and independent discovery and article-verification status for each active publisher.
- **Fail-closed ingestion** — empty/invalid provider responses are degraded, not successful; last-known-good history is retained.
- **Bilingual research UX** — core Research Lab workflows support English and Traditional Chinese.
- **Optional accounts** — Supabase signup/signin/recovery/preferences are implemented in the React project but do not block the public research demo.
- **Engineering quality gates** — shared PR/production regression checks, snapshot acceptance, safe snapshot publishing, blocking PR/weekly dependency audits, and application/weekly Lighthouse checks. Known unpatched toolchain advisories remain visible.

Detailed design notes: [provenance](docs/data-provenance.md) · [signal methods](docs/signal-methods.md) · [snapshot changes](docs/snapshot-changes.md) · [demo hardening](docs/demo-hardening.md) · [scoring](docs/scoring-methodology.md) · [storage](docs/persistent-storage.md) · [scenario analysis](docs/scenario-analysis.md) · [backtesting](docs/backtesting.md) · [CI](docs/pr-ci.md).

Daily event discovery checks Loudoun County News, Oracle corporate news and Texas Governor news, with independent discovery/verification health, bounded requests and retained history. Texas Governor passed GitHub runner listing and article verification; it retains its publisher label rather than implying an ERCOT statement. Oracle OCI Blog and FERC remain opt-in diagnostics after runner checks returned 403. PJM, ERCOT and Oracle investor news are paused; previously verified events remain visible. No API keys are needed for the active public routes. See [event discovery and live runner checks](docs/event-discovery.md).

## Current evidence boundaries

- The [relationship register](docs/relationship-evidence.md) contains three specific reviewed records; other company-to-facility/grid links remain unavailable. EIA demand in the public snapshot covers PJM, so the Oracle/Cipher–ERCOT records do **not** create an ERCOT demand measurement. The Crane record describes a planned restart and power-supply agreement.
- Event coverage includes configured sources and candidates, not every U.S. infrastructure development. An excluded candidate is not published as a verified event; older accepted records remain visible with their last successful verification date.
- Scenario Lab and the price-only backtest remain under **Methods & assumptions**. They support research discipline and method checking; neither answers the full buildout question or provides a forecast.

## Requirements

- Node.js **22+** (`node:sqlite` is used by the API/storage profile)
- npm using the committed `package-lock.json`; use **npm 10** when regenerating the lockfile to match the Node 22 CI resolver.

## Quick start

```bash
npm ci
npm run dev
```

`npm run dev` starts both:

- React UI: `http://localhost:3000/Gridline`
- Research API: `http://localhost:8787`

Use `Ctrl+C` to stop both processes. For UI-only development, use `npm start`. For API-only development, use `npm run api`.

Provider configuration is documented in [.env.example](.env.example) and the [ingestion guide](docs/api-ingestion.md).

## Architecture

```text
 SEC filings / official company research / EIA PJM load / verified events / market prices
                         │
                         ▼
             public-demo source adapters
                         │
            validate + fail closed
                         │
                         ▼
          normalized observations + provenance
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       SQLite/WAL history       versioned scoring
             │                       │
             └───────────┬───────────┘
                         ▼
                    research API
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        evidence views   method checks   audit queries
                         │
                         ▼
                     React UI

GitHub Pages profile:
provider refresh → full + compact snapshots → consistency/readiness gate
                → safely publish both to main → explicit Pages dispatch
                → shared tests + acceptance + build → Pages deploy
                → Lighthouse for application changes; weekly site audit
```

Key modules:

- `server/sources.js` — SEC, EIA, event and market-price adapters used by the public demo; PJM Data Miner, FERC and company IR adapters are optional API experiments and do not feed its current lenses.
- `server/financial-policy.js` / `server/inline-sec-facts.js` — audited issuer financial definitions and validated inline XBRL fallback.
- `server/company-research.js` / `server/company-source-discovery.js` — official/SEC announcements, source verification, publisher cooldowns and persistent discovery cursors.
- `scripts/publish-snapshot.js` / `scripts/workflow-summary.js` — bounded snapshot publication recovery and coverage/heartbeat reports.
- `server/price-history.js` — validated Stooq history plus Yahoo Finance demo fallback.
- `server/service.js` — cache/source health and zero-row fail-closed behavior.
- `server/provenance.js` — deterministic observation identity and audit metadata.
- `server/database.js` / `server/store.js` — SQLite schema and persistent research history.
- `server/scoring/` — versioned MA5/MA10 signal from cited prices; unsupported company scores are null.
- `server/scenario-engine.js` — bounded user assumptions without an uncalibrated forecast.
- `server/backtest.js` / `src/backtestModel.js` — retrospective price-only MA5/MA10 crossover test.
- `server/historical-reconstruction.js` — recorded-history coverage summary; no v1 reconstructions are generated.
- `server/demo-readiness.js` — public-snapshot acceptance criteria.
- `src/signals/registry.js` — common frontend contract for trend, momentum and volatility methods; calculations fail closed when the latest provider segment is insufficient.
- `src/Components/PriceChart.js` / `src/Components/priceChartModel.js` — dependency-free SVG price history using the same normalized, source-continuous close observations as the signal layer.
- `src/Components/chartSignalMarkers.js` — maps the selected registered method's dated events onto matching visible chart observations without recalculating indicator logic in the chart.
- `server/snapshot-changes.js` / `src/Components/SnapshotChanges.js` — deterministic previous-snapshot comparison plus the bilingual Overview audit surface.
- `src/Components/SnapshotLoadState.js` / `src/freshness.js` — explicit snapshot lifecycle states and shared market-observation recency presentation.
- `src/DataHealth.js` — operational/demo-readiness workspace.
- `src/ScenarioLab.js` / `src/BacktestLab.js` — research workflows.

The storage interface is deliberately narrow so SQLite can be replaced by Postgres in a production deployment without rewriting the scoring/scenario/backtest domain logic.

## Research API

The API is local-only by default (`127.0.0.1`). If deliberately exposed on a network, configure `HOST`, `ALLOWED_ORIGINS` and a long random `API_WRITE_TOKEN`; state-changing requests outside loopback require the bearer token. Never put that token in the static React build.

Selected endpoints:

```text
GET  /api/health
GET  /api/observations
GET  /api/provenance?observationId=...
GET  /api/scores?ticker=NBIS
POST /api/ingest?source=prices
POST /api/scenario
GET  /api/scenario/runs
POST /api/backtest
GET  /api/backtest/runs
```

See [docs/api-ingestion.md](docs/api-ingestion.md).

## Market-price ingestion

The public demo attempts Stooq first. If a ticker's history is empty, stale, undersized or unusable, it falls back to the Yahoo Finance chart endpoint. A healthy `prices` refresh requires every configured ticker to have at least 60 usable daily closes through the latest expected NYSE trading session. Today's close is required from 4:15 PM New York time; before that cutoff, and on weekends or holidays, the previous trading session is expected. Unfinished and future session rows are excluded. The snapshot acceptance gate applies the same session check.

An HTTP `200` with zero usable rows is **degraded**, not `ok`. Degraded refreshes do not erase existing history. Provider identity and origin URL are preserved in provenance. Free demo feeds should be replaced by an approved/licensed market-data provider for commercial finance use.

## Niche signal lenses and retrospective test

The Overview lets a researcher switch between **market signals**, **company financials**, **grid demand**, and **project milestones**. Each lens shows its source, date, rule, and unavailable state. It avoids a composite buy/sell score. Company financials use period-aware SEC revenue or diluted EPS only when an exact record link exists. Grid demand requires explicitly typed EIA actual load and complete comparable days. Project milestones require exact primary records. See [Signal lenses](docs/signal-lenses.md) and [Market signal methodology](docs/scoring-methodology.md).

The frontend signal explorer exposes three conventional technical-analysis families under one result contract: moving-average trend, 14-period Wilder RSI momentum, and 20-period Bollinger volatility bands. Users can switch methods on the Overview; that same selection drives the Market signals lens, the “About this signal” drawer, and dated state-change markers on the price chart. Marker hover text explains the event state while keeping the visualization descriptive rather than turning technical changes into buy/sell instructions. See [Technical signal methods](docs/signal-methods.md).

The MA5/MA10 backtest uses only dated closes, enters at the next observed session close and evaluates ten observed sessions later. It is a retrospective descriptive calculation with no transaction costs or claim of predictive skill. See [Backtesting](docs/backtesting.md).

## Verification

Code quality gate:

```bash
npm run verify
```

Equivalent commands:

```bash
npm run test:dev-server
npm run test:supabase-health
npm run test:workflows
npm run test:security-gate
npm run test:api
npm run test:unit
npm run build
```

After generating a current static snapshot, validate the public-demo data state:

```bash
npm run demo:check
```

Or run both code verification and snapshot acceptance:

```bash
npm run verify:demo
```

`verify:demo`, PR CI and every production deployment include snapshot acceptance. They read the committed snapshot without contacting providers; stale/incomplete critical price coverage can fail acceptance. `npm run verify` runs code regression checks and build without the snapshot readiness command. See [CI](docs/pr-ci.md) and [Actions maintenance](docs/actions-maintenance.md).

## Static daily snapshot and Pages deployment

`Refresh daily dashboard snapshot` targets **06:17 Asia/Taipei** daily (**22:17 UTC on the previous day**) and supports manual `all` or `company-coverage` scopes. GitHub may delay schedules. Market prices refresh when the previous snapshot lacks sufficient history through the latest expected NYSE close; complete coverage skips redundant weekend/holiday requests. SEC, EIA, events and company research can refresh daily. The collector uses Node built-ins without installing the frontend dependencies, retains last-known-good data, generates schemaVersion 4 full/compact snapshots and runs snapshot acceptance.

Both snapshot files must agree and pass acceptance before publication. The publisher recovers from concurrent `main` updates by fast-forwarding and regenerating, with at most three attempts and no force-push. The refresh explicitly dispatches Pages with `reason=snapshot`; all deployments still run shared regression checks, acceptance and build. Snapshot deployments skip Lighthouse, application changes run it after publication, and Monday 10:37 Asia/Taipei runs a site audit without deployment. Documentation-only pushes skip deployment. Explicit dispatch is necessary because `GITHUB_TOKEN` snapshot pushes do not start push-triggered workflows.

The gate requires at least 60 sourced daily closes through the expected US market session for every enabled ticker (20 by default). Historical v1 reconstructions are no longer published or required. Optional degraded providers remain visible as warnings and retain their prior evidence in a new mixed-coverage snapshot. A failed critical acceptance check leaves the last published artifacts intact.

The shared company registry covers AI compute/transition (NBIS, CRWV, APLD, IREN, CIFR, CORZ), data-center operators (GDS, VNET, EQIX, DLR, IRM), infrastructure suppliers (AVGO, VRT, ETN, ANET, PWR), generation/energy (GEV, CEG, BE), and diversified cloud (ORCL). Category filters and ticker/name search narrow the company browser without changing the selected research company. Business descriptions link to official sources; categories are business roles, not investment rankings. `TICKERS` can select a supported subset for local ingestion, which is declared as `trackedTickers` in both snapshot artifacts.

The [company research panel](docs/company-research-coverage.md) adds sourced financial records, filing links, official developments and bilingual research questions for every tracked company. Reporting currencies and annual/quarterly/YTD periods remain explicit; missing values and blocked publishers are disclosed.

The audited financial policies recovered 15 previously missing fields. Five debt fields remain not separately reported (CORZ current debt, DLR current/noncurrent debt, ANET current/noncurrent debt), with reasons and SEC references. Publisher checks use exact issuer-bound SEC mirrors when available, seven-day 403 cooldowns, bounded discovery and retained dated evidence. Company research does not require Supabase.

A separate [Supabase database health workflow](docs/supabase-health-check.md) makes three read-only RPC requests daily at approximately 14:43 Asia/Taipei. It reuses the public project configuration, reports failures through GitHub Actions, and provides best-effort activity against free-tier inactivity pauses.

The Gridline Supabase project already has the [watchlist expansion](supabase/migrations/20261008_expand_watchlist.sql) and [health RPC](supabase/migrations/20261008_add_database_health.sql) migrations applied. A separate existing project needs the watchlist migration; fresh projects use [user-preferences.sql](supabase/user-preferences.sql). Both need the health migration for scheduled checks. These preserve preference data and RLS. See the setup guides rather than reapplying migrations as an outstanding release prerequisite.

Deployment runbook: [English](docs/static-snapshot-deployment.en.md) · [繁體中文](docs/static-snapshot-deployment.zh-TW.md).

## Data Health

Open **Data status** or navigate to `#health` to inspect the same committed snapshot used by the public dashboard. It reports:

- generation time / age;
- source health and degradation reasons;
- per-ticker price row count, range and provider;
- retained unique event-record count and source check dates;
- `PRICE DATA AVAILABLE`, `PRICE DATA AVAILABLE · SOURCE GAPS`, or `PRICE COVERAGE INCOMPLETE`.

This is an operational transparency surface, not a claim that every optional provider is currently live.

## Optional Supabase accounts

The React project contains signup, email confirmation/resend, sign-in, session restoration, password recovery/change, preference load/save and sign-out. The public research demo remains usable without Supabase configuration.

To demonstrate live accounts, configure the project, redirects, RLS SQL and browser-safe publishable variables as described in [docs/accounts.en.md](docs/accounts.en.md). No service-role/secret key belongs in the frontend.

## EIA attribution

Where EIA observations appear, Gridline identifies the **U.S. Energy Information Administration (EIA)** as the source and retains observation/retrieval timestamps. Gridline's derived grid-demand comparison is not produced, endorsed or approved by EIA. Keep attribution and time context with any displayed result.

Traditional Chinese README: [README.zh-TW.md](README.zh-TW.md).
