# Ingestion API

Run the API with `npm run api`, or run the API and React UI together with `npm run dev`. The API listens on `http://localhost:8787` by default. Copy `.env.example` to a local environment file or export its values before running provider ingestion.

The API binds to `127.0.0.1` by default. If it is deliberately exposed on a network, set `HOST`, restrict `ALLOWED_ORIGINS`, and configure a long random `API_WRITE_TOKEN`. All state-changing POST endpoints require `Authorization: Bearer <token>` outside loopback and are rate limited. Do not place this token in the static React build. Public observation and score queries are paginated and bounded.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Per-source status, latest success and degradation reason. |
| `GET /api/observations?ticker=ORCL&type=close` | Normalized historical observations. |
| `GET /api/provenance?observationId=...` | Provenance for one normalized observation. |
| `GET /api/scores?ticker=NBIS` | Current-version price-signal snapshots; legacy curated scores are excluded. |
| `POST /api/ingest?source=prices` | Refresh one adapter. Sources: `sec`, `eia`, `pjm`, `ferc`, `company-ir`, `prices`. |
| `POST /api/ingest/all` | Refresh all adapters independently; unavailable credentials degrade only that source. |
| `POST /api/scenario` | Run/persist one scenario analysis. |
| `POST /api/backtest` | Run/persist one point-in-time backtest. |

## Storage model

Gridline keeps two deployment profiles:

- **API / production-style profile:** raw responses are archived under `data/bronze`; normalized observations, source health, versioned score snapshots, scenario runs and backtest runs are persisted in SQLite/WAL. Observation identity is deterministic, so ingesting the same source row again is idempotent and does not erase prior history.
- **GitHub Pages demo profile:** the scheduled exporter writes `public/data/dashboard-snapshot.json`. Successful sources replace their prior static-source records; degraded sources retain last-known-good observations.

`data/` is intentionally ignored by Git. The committed static snapshot is a portable public-demo artifact, not the API database.

## Provider requirements

- **SEC EDGAR:** public API, server-side only. `SEC_USER_AGENT` is mandatory and must identify the caller. Filing availability time must be preserved separately from the filing period.
- **EIA:** API key required. The starter connector reads PJM hourly RTO regional data.
- **PJM Data Miner 2:** a PJM account/API subscription key is required. The starter connector reads `gen_by_fuel`; comply with PJM terms before redistribution.
- **Data.FERC.gov:** API key required. The starter connector validates/snapshots the dataset catalog; choose and configure a specific production dataset before treating FERC as a live indicator.
- **Company IR:** configure only official RSS/Atom URLs in `COMPANY_IR_FEEDS`. Raw source material is retained for later parser/version upgrades.
- **Prices:** Stooq is attempted first for the public demo. If the response is empty, stale, undersized or otherwise unusable, Gridline falls back per ticker to the Yahoo Finance chart endpoint. Each configured ticker must have at least 60 usable daily closes through the latest expected NYSE session before the `prices` source can be healthy. The current session is required at or after 4:15 PM New York time; earlier checks, weekends and holidays expect the previous trading session. Unfinished and future session rows are excluded. The snapshot acceptance gate uses the same session check. For a finance-company production deployment, replace demo feeds with an approved/licensed market-data provider.

The actual provider and origin URL used for each price observation are carried in provenance metadata.

## Fail-closed ingestion

An HTTP `200` does not imply a healthy data refresh. After adapter execution, normalized price, SEC and grid observations must contain usable records. Empty results are marked `degraded`. The event adapter may validly return zero verified events; it records a dated check and retains prior event history.

Event health records the configured check scope, candidate and accepted counts, excluded candidate reasons, and whether the PJM feed was available. If any candidate is excluded or the feed fails but curated records pass, the check is `partial`, including checks where all candidates are excluded. A checked feed with no matching candidates remains `ok`. Accepted records from a partial check are published; excluded candidates are not published as newly verified events. The Events page exposes these exceptions and links for audit, while previously accepted events keep their own last-verification dates. A configured-source check is not a claim to cover every U.S. infrastructure event.

For the static snapshot, a degraded source retains last-known-good data. For the SQLite profile, immutable historical observations remain present. This is particularly important for price history because 30D/90D lookbacks and point-in-time backtests depend on continuity.

No missing response is converted to zero.

## Demo acceptance

After generating a static snapshot, run:

```bash
npm run demo:check
```

The gate checks schema-v4 metadata, complete/recent market-price coverage for all tracked tickers, and non-zero semantics for healthy non-event sources. Historical v1 reconstruction is no longer required or published. The scheduled snapshot workflow runs this gate before committing an updated public snapshot.

Use `#health` / **Research Lab → Data health** to inspect the same committed snapshot from the UI.

## EIA attribution and integrity

When an EIA-derived observation is displayed, identify the U.S. Energy Information Administration (EIA) as its source and link to EIA Open Data. Keep the raw EIA observation, observation period, and retrieval time separate from Gridline-derived metrics. Do not use the EIA logo or language that implies EIA endorsement of the dashboard, scores, or investment conclusions.

EIA data is scoped to Gridline’s research and decision-support use only. Do not send it to unrelated products or services, and do not remove its attribution or time context when presenting it.

## Scheduling

With `SCHEDULE_ENABLED=true`, the local API scheduler checks once per minute and runs once daily at or after **4:15 PM America/New_York**. The GitHub Pages snapshot workflow runs daily at `22:17 UTC` (after the regular U.S. close in both daylight and standard time) and supports manual dispatch. SEC, EIA and event sources may refresh every day; market prices are fetched only on a published NYSE trading session. The 2026–2028 holiday dates come from the [NYSE calendar](https://www.nyse.com/trade/hours-calendars) and require review when new dates or exceptional closures are announced. Outside the published years, price ingestion relies on the provider's dated-row validation rather than silently suppressing updates. The dashboard's event-check freshness uses the New York calendar date.

For a demo, this is deliberately a low-frequency model rather than continuous polling. Production provider licensing, SLAs, historical-vintage availability and redistribution rights remain deployment responsibilities outside this repository's demo configuration.
