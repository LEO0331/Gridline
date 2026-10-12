# Persistent historical storage

The production-style API profile uses the SQLite database at `data/gridline.sqlite` (Node.js 22 `node:sqlite`). The database directory remains git-ignored.

Tables:

- `observations` — immutable normalized external records keyed by deterministic observation ID;
- `source_health` — latest provider health state;
- `score_snapshots` — point-in-time, methodology-versioned price signals (legacy v1 rows are filtered from public API views);
- `scenario_runs` — persisted user assumption worksheets;
- `backtest_runs` — persisted price-only retrospective tests;
- `schema_migrations` — storage schema version.

The store uses WAL mode and indexes observations by source/time and ticker/type/time. Re-ingesting an identical observation is idempotent; a new historical timestamp produces a new record rather than replacing prior history. Empty/degraded ingestion does not erase previously persisted observations.

## Static public-demo artifact

GitHub Pages does not expose this SQLite file. The scheduled exporter instead commits `public/data/dashboard-snapshot.json` as a portable read-only artifact.

The current schema-v4 snapshot includes:

- normalized observations and source health, including per-ticker financial-field classifications, publisher verification states, cooldowns and discovery cursors;
- current versioned MA5/MA10 signals with null unsupported score fields;
- `companyHistory` with v2 recorded signals only;
- `backtestCoverage`;
- `demoReadiness` and `snapshotChanges` summaries.

Successful non-news sources replace corresponding rows, per ticker where supported. Failed tickers retain last-known-good observations. Events and company research always merge/deduplicate accepted history so incremental cursors do not erase earlier discoveries. Source health preserves last-success times and discovery state through failed refreshes. The daily workflow runs `npm run demo:check` before committing an updated public snapshot, so a structurally incomplete demo-critical artifact is not intentionally published.

The exporter also creates `public/data/dashboard-overview.json`, a compact runtime projection for the UI. Both artifacts are generated and validated together; the publisher safely regenerates against the latest remote snapshot when a concurrent push occurs. See [demo hardening](demo-hardening.md) and [Actions operation](actions-maintenance.md).

Supabase is separate from both research profiles: it holds optional accounts and user preferences plus a constant-response health RPC. It is not the storage backend for market, SEC, events or research observations, and new research coverage does not require a Supabase migration.

The separately dated `public/data/event-review.json` records a scoped manual check of curated event sources. The frontend merges it with the market snapshot without changing the latter's generation time; newer automated event checks take precedence. Historical v1 score and reconstruction rows are omitted from new exports.

In a long-running API deployment, SQLite is the source of persistent operational/research history. In the GitHub Pages profile, the committed schema-v4 JSON is the public presentation artifact. The storage interface remains intentionally narrow so SQLite can later be replaced by Postgres without changing scoring, scenario, backtest or HTTP domain contracts.
