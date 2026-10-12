# Company research and SEC coverage

All 20 tracked companies use the same selected-company research panel. It displays reported revenue and diluted EPS, available capital expenditure/debt facts, report periods, filing dates, original SEC links, dated official company developments, and bilingual research focus and verification questions.

The SEC adapter accepts reported currencies without conversion, distinguishes quarters, annual periods, YTD disclosures and balance-sheet instants, and compares only compatible prior periods with explicit matching taxonomy/tag metadata. The compact snapshot retains that comparison metadata. Current half-year disclosures are not replaced with older annual facts and do not become quarterly growth claims.

VNET needs a narrow exception: its standard CompanyFacts revenue series stops at 2019. Its current 20-F reports consolidated revenue using `vnet:HostingAndRelatedServicesRevenue`. The fallback reads that audited tag from the original annual filing, checks the issuer entity, duration, reporting unit and scale, and excludes segment/related-party contexts, nil values and conflicting totals. GDS and VNET use RMB reporting units when those units are supplied by the filing. No FX conversion is performed.

`src/data/companyResearch.json` contains one reviewed official-source profile for each tracked company. `server/company-research.js` revalidates those configured URLs with title, publication-date and passage checks. When publisher access is limited, the curated primary-source review remains dated and available; a failed automated check is not presented as a fresh successful verification. The latest dated release stays visible even if it is older than 30 days. The source register is curated, rather than an assertion that every company announcement is collected.

Explicit facility/grid records were added for CIFR's Apollo ERCOT studied-load development and CEG's Crane/PJM power-supply agreement. Their descriptions distinguish development plans from operating capacity and do not infer company load attribution from geography. Other companies continue to show a relationship gap where direct evidence is missing.

## Refresh and diagnostics

The daily snapshot workflow refreshes SEC and company research alongside the existing sources. A manual `company-coverage` scope refreshes those two sources independently of prices and grid data. The manual `Audit SEC issuer fact tags` workflow helps inspect current primary-source periods and issuer extension tags before changing mappings. It uses the existing SEC contact configuration and does not read account data.

Blocked corporate publishers produce partial source coverage with retained dated evidence. Missing supported XBRL debt or capex fields remain unavailable; they are not zero values. The company panel uses the same availability rules for the original four and the added 16 companies.

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
