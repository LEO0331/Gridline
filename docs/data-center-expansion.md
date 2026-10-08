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

## Verification on 2026-10-08

- `npm run verify`: 4 development-server tests, 118 backend tests, and 144 frontend tests passed; production build compiled successfully.
- `npm run demo:check`: zero blockers, full/compact artifacts match.
- All 20 companies have 260 sourced daily closes through the expected completed US market session, 2026-10-07. All 20 current market signals are available.
- Compact runtime artifact after integrating the latest remote records: 813,831 bytes, 68,950 bytes with gzip. Full research artifact: 6,414,560 bytes; it remains separate from the compact overview payload.
- Browser QA: desktop English and 390px Traditional Chinese mobile category/search views; selected company survives empty searches; official description source link; no horizontal overflow or browser console errors. Existing test-console warnings about scrollTo/React act are unrelated to the expansion and do not fail tests.

## Release prerequisites and limitations

The Supabase migration is prepared and its symbol set is checked against the registry. It has not been executed against a remote database: no connected Supabase administrative tool or CLI is available. Apply it before deploying account UI that saves the added symbols. Existing watchlists and security policies are preserved by the migration.

Live price backfill succeeded through the existing Yahoo Finance fallback. The latest remote automated snapshots were integrated before pushing: their updated EIA, issuer and event records are preserved. SEC disclosures cover the original four issuers; the additional issuers are marked unavailable pending a configured SEC refresh (`SEC_USER_AGENT`). Partial SEC/event coverage does not invalidate the verified price coverage. The expansion is committed for the requested push; the remote Supabase migration remains unapplied.
