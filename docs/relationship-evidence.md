# Documented company–facility–grid relationships

The register in `src/data/verifiedRelationships.json` contains three manually reviewed primary-source relationships: ORCL, CIFR and CEG. It is a small evidence register, not a complete map of company assets or grid service territories. A record requires a tracked ticker, named facility, region, grid, publication date, review date and an exact HTTPS page from an approved official host. The UI shows the review date; the static register is not rechecked by the daily source job. Announced development and supply agreements remain distinct from operating capacity.

## ORCL · Abilene · ERCOT

- **Primary source:** [Oracle, “Oracle Invests in More Than 1.7 GW of Carbon-Free Electricity to Support AI Growth and Strengthen the Texas Grid”](https://www.oracle.com/news/announcement/oracle-invests-in-more-than-1.7-gw-of-carbon-free-electricity-to-support-ai-growth-and-strengthen-the-texas-grid-2026-08-15/).
- **Published:** September 15, 2026. **Reviewed:** September 29, 2026.
- **Supported relationship:** Oracle identifies its Abilene facility in Texas and says the ERCOT grid powers it.
- **Boundary:** This source does not measure Abilene's actual electricity demand, establish how much of ERCOT load is attributable to Oracle, or explain ORCL's share-price changes. The dashboard's measured EIA load series is for PJM, so its grid-demand card remains unavailable for Texas.

## CIFR · Apollo · ERCOT

- **Primary source:** [Cipher Digital, “Cipher Digital Provides Second Quarter 2026 Business Update”](https://investors.cipherdigital.com/news-releases/news-release-details/cipher-digital-provides-second-quarter-2026-business-update).
- **Published:** August 4, 2026. **Reviewed:** October 8, 2026.
- **Supported relationship:** Apollo is an optioned development site near San Antonio, with up to 900 MW explicitly submitted to ERCOT Batch Zero.
- **Boundary:** A studied-load application is not operating or energized capacity, a completed lease, or measured company electricity demand.

## CEG · Crane Clean Energy Center · PJM

- **Primary source:** [Constellation, “Constellation to Launch Crane Clean Energy Center, Restoring Jobs and Carbon-Free Power to The Grid”](https://www.constellationenergy.com/news/2024/Constellation-to-Launch-Crane-Clean-Energy-Center-Restoring-Jobs-and-Carbon-Free-Power-to-The-Grid.html).
- **Published:** September 20, 2024. **Reviewed:** October 8, 2026.
- **Supported relationship:** A 20-year agreement would match Microsoft data-center consumption in PJM with output from a planned Crane restart.
- **Boundary:** This is a power-supply relationship. The source does not identify a particular Microsoft facility or establish that the restart is operating. The record remains dated to the original announcement; its review date is not a new publication date.

Add another relationship only after reviewing an exact primary page that explicitly names both the company and facility or grid. Record its source and review date, and keep unsupported joins unavailable. Publisher restrictions on subsequent automated company-news checks do not refresh these manual review dates.
