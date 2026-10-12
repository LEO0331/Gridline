# Company research and SEC coverage

All 20 tracked companies use the same selected-company research panel. It displays reported revenue and diluted EPS, available capital expenditure/debt facts, report periods, filing dates, original SEC links, dated official company developments, and bilingual research focus and verification questions.

The SEC adapter accepts reported currencies without conversion, distinguishes quarters, annual periods, YTD disclosures and balance-sheet instants, and compares only compatible prior periods with explicit matching taxonomy/tag metadata. The compact snapshot retains that comparison metadata. Current half-year disclosures are not replaced with older annual facts and do not become quarterly growth claims.

VNET needs a narrow exception: its standard CompanyFacts revenue series stops at 2019. Its current 20-F reports consolidated revenue using `vnet:HostingAndRelatedServicesRevenue`. The fallback reads that audited tag from the original annual filing, checks the issuer entity, duration, reporting unit and scale, and excludes segment/related-party contexts, nil values and conflicting totals. GDS and VNET use RMB reporting units when those units are supplied by the filing. No FX conversion is performed.

`src/data/companyResearch.json` contains one reviewed official-source profile for each tracked company. `server/company-research.js` revalidates those configured URLs with title, publication-date and passage checks. When publisher access is limited, the curated primary-source review remains dated and available; a failed automated check is not presented as a fresh successful verification. The latest dated release stays visible even if it is older than 30 days. The source register is curated, rather than an assertion that every company announcement is collected.

Explicit facility/grid records were added for CIFR's Apollo ERCOT studied-load development and CEG's Crane/PJM power-supply agreement. Their descriptions distinguish development plans from operating capacity and do not infer company load attribution from geography. Other companies continue to show a relationship gap where direct evidence is missing.

## Refresh and diagnostics

The daily snapshot workflow refreshes SEC and company research alongside the existing sources. A manual `company-coverage` scope refreshes those two sources independently of prices and grid data. The manual `Audit SEC issuer fact tags` workflow helps inspect current primary-source periods and issuer extension tags before changing mappings. It uses the existing SEC contact configuration and does not read account data.

Blocked corporate publishers produce partial source coverage with retained dated evidence. Missing supported XBRL debt or capex fields remain unavailable; they are not zero values. The company panel uses the same availability rules for the original four and the added 16 companies.

## Financial definitions and publisher fallback

`server/financial-policy.js` records issuer-specific definitions and audited SEC filing links. Each field carries its tag, extraction method, period, native currency and classification: verified standard tag, verified issuer extension, reported zero, stale data, not separately reported, or unavailable. Only an explicit reported numeric zero is classified as zero. Values older than 400 days are not emitted as fresh facts; retained historical values display a stale label.

The reviewed policies address these previously missing fields:

| Company | Fields | Definition or remaining limitation |
| --- | --- | --- |
| ORCL | Current and noncurrent debt | Notes payable and other borrowings; latest noncurrent tag is `LongTermNotesAndLoans`. |
| APLD | Capex, current and noncurrent debt | Productive-asset cash expenditure; reported notes payable. |
| CORZ | Current debt | Not separately reported in the reviewed June 2026 balance sheet. |
| VNET | Noncurrent debt | Issuer extension `vnet:LongTermBorrowingsNonCurrent`, extracted from the annual inline filing in CNY. |
| EQIX | Capex and long-term debt | Other PP&E expenditure excludes real estate acquisitions; reported long-term debt includes current maturities and must not be summed with current debt. |
| DLR | Capex, current and noncurrent debt | Real estate development expenditure is not total PP&E capex. Debt is reported by instrument without a consolidated current/noncurrent split. |
| ETN | Current and noncurrent debt | Includes finance lease obligations. |
| ANET | Current and noncurrent debt | Borrowings not separately reported; investment debt securities are assets, not company borrowings. |
| PWR | Noncurrent debt | Includes finance lease obligations. |
| GEV | Capex, current and noncurrent debt | Productive-asset expenditure; debt includes finance lease obligations. |

Company news uses bounded official newsroom/feed discovery and recent issuer 8-K/6-K exhibits. A curated release can be verified through an SEC mirror only when its issuer, accession, headline, publication date and supporting passage match. Newly discovered filing announcements carry their own publication evidence and issuer identity. Excerpts are short, attributed and retained in their original language; an English excerpt is not represented as a Chinese translation.

Publisher 403 responses enter a seven-day cooldown, after which the original URL is reprobed. SEC alternatives remain checked during the cooldown. Snapshot refreshes persist discovery cursors and source checks, and retain older incremental announcements. Failed requests do not advance the filing cursor or invent fresh verification timestamps. Coverage distinguishes original-source verification, official fallback verification, retained reviewed evidence and unavailable evidence; access or discovery errors remain visible as partial coverage.

This changes the scheduled public-data pipeline and company research panel. It requires no Supabase schema migration, authentication change or new application dependency.

## Changed implementation areas

- Financial ingestion and evidence: `server/sources.js`, `server/inline-sec-facts.js`, `server/company-research.js`, `server/provenance.js`, `server/runtime-snapshot.js`, plus their regressions.
- Retention and scheduling: `server/service.js`, `server/snapshot-merge.js`, `server/export-static-snapshot.js`, `server/config.js`, `.github/workflows/daily-snapshot.yml`.
- UI and models: `src/Components/CompanyResearch.*`, `src/companyResearchModel.js`, `src/researchBriefModel.js`, `src/signalLenses.js`, `src/Containers/App.js`, data-health/source summaries.
- Source register: `src/data/companyResearch.json`, `src/data/verifiedRelationships.json`.
- Diagnostics: `scripts/audit-sec-facts.js`, `.github/workflows/sec-fact-audit.yml`.

The GitHub clean-install failure was repaired by regenerating the missing optional `yaml` peer entry with the runner's npm 10 resolver. No new application dependency was added.

## Completion verification (2026-10-12)

- Live SEC refresh: all 20 issuers succeeded, with 140 sourced observations in the final snapshot. Every company passes the published-snapshot regression for available revenue, diluted EPS, filing references and company-specific research.
- VNET's current consolidated annual revenue and RMB EPS were confirmed in its original 2025 20-F; the obsolete 2019 standard revenue series is no longer presented as current.
- All 20 companies have reviewed primary-source profiles. The runner revalidated 12 official company records in the final refresh; remaining automated checks are explicitly partial, retaining dated curated evidence.
- `npm run verify`: 4 development-server tests, 7 health-check tests, 134 backend tests and 158 frontend tests passed (303 total); production build compiled successfully.
- `npm run demo:check`: zero blockers, with disclosed partial event/company-source checks; full and compact artifacts match.
- Desktop and 390px Traditional Chinese mobile checks passed. Latest older releases are visible, missing metrics use readable localized labels, the mobile page fits the viewport, and the browser reported no console errors.
- [Successful focused live refresh](https://github.com/LEO0331/Gridline/actions/runs/38188090479).

## Financial and publisher completion (2026-10-12)

- [Live focused refresh](https://github.com/LEO0331/Gridline/actions/runs/38211115163) succeeded. All 20 SEC issuers refreshed, producing 155 financial/filing observations. All 15 recoverable fields in the table above are now published; the other five are explicitly not separately reported (CORZ current debt, DLR both debt classifications, ANET both debt classifications).
- Oracle's August 31, 2026 balance-sheet facts recovered current borrowings of USD 7.625 billion and noncurrent borrowings of USD 117.712 billion. VNET's noncurrent borrowing extension was recovered in CNY. DLR's development expenditure was recovered from its June 2026 inline filing.
- Oracle, Broadcom and GDS configured releases were verified through matching SEC exhibits. Nine configured releases were verified directly; together with incremental announcements, the refresh admitted 16 observations across 12 companies. The other eight companies retain dated reviewed/previously verified records. Newsroom discovery remains partial where publishers deny access or requests time out; SEC alternatives are not assumed to contain every announcement.
- `npm run verify` passed 4 development-server, 7 health-check, 156 backend and 165 frontend tests (332 total), plus the production build. The new regressions cover issuer-bound direct SEC announcements and failed-discovery cursor retention.
- `npm run demo:check` passed with zero blockers; both remaining warnings disclose partial event/news checks, and compact/full snapshots match. Company prices and account authentication retain their existing behavior.
