# Data-center company coverage

The application now tracks 20 unique companies, adding 16 to the original NBIS, CRWV, ORCL and AVGO universe. Category filters and ticker/name search affect the company browser; the selected research company remains active even when hidden by a filter. Company selection connects the existing brief, signals, chart and snapshot changes. Business descriptions provide official source references in English and Traditional Chinese.

## Changed areas

- Registry: `src/data/companyExposure.json`, `src/companyRegistry.js`, `server/company-universe.js` centralize symbols and business metadata. `server/config.js` validates optional supported `TICKERS` subsets.
- UI: `src/Containers/App.js`, `src/Containers/App.css`, `src/Components/ResearchBrief.js`, `src/Components/Account.js`, `src/BacktestLab.js` add browsing and grouped choices. Loaded subsets synchronize the selected ticker and exclude unrelated company shortcuts.
- Coverage: `src/dataHealthModel.js`, `server/demo-readiness.js`, `server/runtime-snapshot.js` use enabled company metadata and reject invalid readiness universes.
- Refresh: `server/sources.js`, `server/service.js`, `server/snapshot-merge.js`, `server/export-static-snapshot.js` isolate ticker failures, retain last-known-good observations and success dates, retry failed symbols only, and preserve published artifacts when coverage fails.
- Accounts: `supabase/user-preferences.sql` and `supabase/migrations/20261008_expand_watchlist.sql` widen the watchlist constraint without changing existing preferences or RLS.
- Artifacts: `public/data/dashboard-snapshot.json` and `public/data/dashboard-overview.json` include all 20 symbols. Both READMEs and `.env.example` document configuration and migration.
- Regression coverage: company registry/universe tests plus App, Account, research-tool, data-health, readiness, source, service, snapshot-merge and exporter tests.

Duplicated four-symbol lists were replaced with the existing shared JSON registry. No dependencies or signal formulas changed. Region links still require explicit primary-source evidence.

## Historical expansion verification on 2026-10-08

The dates, suite totals and payload sizes below are the original expansion checkpoint. They are not freshness guarantees or current artifact sizes.

- `npm run verify`: 4 development-server tests, 118 backend tests, and 144 frontend tests passed; production build compiled successfully.
- `npm run demo:check`: zero blockers, full/compact artifacts match.
- All 20 companies have 260 sourced daily closes through the expected completed US market session, 2026-10-07. All 20 current market signals are available.
- Compact runtime artifact after integrating the latest remote records: 813,831 bytes, 68,950 bytes with gzip. Full research artifact: 6,414,560 bytes; it remains separate from the compact overview payload.
- Browser QA: desktop English and 390px Traditional Chinese mobile category/search views; selected company survives empty searches; official description source link; no horizontal overflow or browser console errors. Existing test-console warnings about scrollTo/React act are unrelated to the expansion and do not fail tests.

## Release prerequisites and limitations

The Supabase watchlist migration was applied to the Gridline project on 2026-10-08 through the logged-in SQL Editor after restoration completed. All 20 allowed symbols, constraint validation, unchanged RLS/owner-only policy and unchanged saved-preference count were verified. Fresh or separate projects still need to apply the migration before saving added symbols.

Live price backfill succeeded through the existing Yahoo Finance fallback. On 2026-10-12 the configured runner completed SEC coverage for all 20 issuers, including the added 16. The [company research panel](company-research-coverage.md) includes current supported financial facts, filing references and dated official-source profiles; unsupported metrics and blocked automated publisher checks remain explicit. VNET's current extension-tag revenue was verified in its primary annual filing rather than replaced with a stale standard-tag series. Partial research/event coverage does not invalidate verified price coverage. The expansion is committed and pushed, and its Supabase watchlist migration is applied.

The financial-policy follow-up recovered 15 of the 20 previously missing debt/capex fields. The remaining five are explicitly not separately reported, rather than zero. Reporting currencies and issuer definitions remain visible; EQIX's debt total including current maturities must not be added to its current portion. Three documented facility/grid relationships now cover ORCL, CIFR and CEG with distinct operating/development/supply boundaries. Scheduled company research supports issuer-bound SEC mirrors, bounded incremental discovery and retained evidence during publisher restrictions.

The committed October 12 snapshot contains 260 sourced closes per company through the October 9 completed US session and 155 SEC observations. Later Actions maintenance verification passed 356 tests and production build; these are dated evidence, not fixed future counts. [Actions maintenance](actions-maintenance.md) describes current deployment gates, daily refresh summaries and the separate Supabase heartbeat. Public-data financial/news ingestion requires no Supabase migration beyond the already applied watchlist change.
