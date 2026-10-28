# Documentation index

Reviewed against the repository implementation on **2026-10-12**. Guides describe the current 20-company application and six repository workflow files. Dated verification and security reports retain their original evidence dates; a documentation update is not a new financial-source review or security audit.

## Setup and operations

| Topic | Guide |
| --- | --- |
| Project overview and local development | [English](../README.md) · [繁體中文](../README.zh-TW.md) |
| Environment template | [.env.example](../.env.example) |
| Optional accounts and preferences | [English](accounts.en.md) · [繁體中文](accounts.zh-TW.md) |
| Research API and ingestion configuration | [English](api-ingestion.md) · [繁體中文](api-ingestion.zh-TW.md) |
| Static snapshots and Pages deployment | [English](static-snapshot-deployment.en.md) · [繁體中文](static-snapshot-deployment.zh-TW.md) |
| Demo acceptance and data freshness | [English](demo-readiness.en.md) · [繁體中文](demo-readiness.zh-TW.md) |
| v3 production, dependency and research review | [Hardening evidence and manual checks](v3-hardening.md) |
| Shared quality gate and blocking dependency audit | [CI](pr-ci.md) |
| Workflow schedules, publishing recovery and live verification | [Actions maintenance](actions-maintenance.md) |
| Independent daily Supabase heartbeat | [Health check](supabase-health-check.md) |
| Dependency patches and unresolved advisories | [Dependency maintenance](dependency-maintenance.md) |
| Exact temporary advisory acceptance and expiry | [Security policy](security-exception-policy.md) |
| Runtime/bundle/dependency-path exposure evidence | [Exposure verification](dependency-exposure.md) |

## Research coverage and evidence

| Topic | Guide |
| --- | --- |
| Expansion to 20 tracked companies | [Company coverage](data-center-expansion.md) |
| Financial definitions, legitimate gaps and issuer news | [Company research](company-research-coverage.md) |
| Active sources and remaining connector work | [Data-source plan](data-source-plan.md) |
| Bounded primary-source infrastructure discovery | [Event discovery](event-discovery.md) |
| Publisher activation and pause decisions | [Source decisions](event-source-decisions.md) |
| Observation identity, source lineage and dates | [Data provenance](data-provenance.md) |
| Three reviewed company/facility/grid records | [Relationship register](relationship-evidence.md) |
| Regional evidence boundaries | [Infrastructure regions](infrastructure-region-focus.md) |

## Methods, persistence and user experience

| Topic | Guide |
| --- | --- |
| Sourced market-signal methodology | [English](scoring-methodology.md) · [繁體中文](scoring-methodology.zh-TW.md) |
| Independent research evidence views | [Signal lenses](signal-lenses.md) |
| Moving-average, RSI, breakout and Bollinger methods | [English](signal-methods.md) · [繁體中文](signal-methods.zh-TW.md) |
| Benchmark and thematic-basket context | [English](market-context.md) · [繁體中文](market-context.zh-TW.md) |
| Observed price lookback and source continuity | [Price lookback](exposure-lookback.md) |
| Retrospective price-only method check and v2 simulation | [English](backtesting.md) · [繁體中文](backtesting.zh-TW.md) |
| Bounded user assumptions | [Scenario analysis](scenario-analysis.md) |
| Material changes between committed snapshots | [Snapshot changes](snapshot-changes.md) |
| Local API SQLite history | [Persistent storage](persistent-storage.md) |
| Snapshot states, keyboard behavior and responsive checks | [Demo hardening](demo-hardening.md) |
| Historical security review and current limitations | [Security review](security-review.md) |

For live source status, use **Data status / 資料狀態** in the application or its `#health` route. Historical test counts, payload sizes and source checks describe their stated snapshot/run rather than promising current publisher access.
