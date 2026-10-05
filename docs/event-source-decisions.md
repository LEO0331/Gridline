# Event-source decisions

This log records changes to the **active candidate list**, separate from the historical event observations and source-check history. Removing a candidate stops future checks of that URL; it does not erase past snapshots.

## October 5, 2026 — pause unavailable discovery sources, retain history

At the user's request, new discovery requests to PJM, ERCOT and Oracle investor news are paused following DNS/access failures. Loudoun County News and Oracle's corporate newsroom remain active. Previously verified records remain in Current/Archive according to publication date, with their own last-verification dates. Paused endpoints are excluded from future provider health reports and are not retried or counted as current failures. This change affects event discovery only; EIA PJM demand and SEC company disclosures remain separate data sources.

## October 5, 2026 — add independent official discovery

Daily discovery now includes Loudoun County News RSS with a listing fallback, ERCOT news releases with market notices as fallback, and both Oracle investor news and the corporate newsroom, alongside PJM RSS. The two curated Loudoun candidates remain active and take precedence over discovered duplicates. The retired Oracle earnings candidate remains retired; general earnings headlines do not qualify for the infrastructure event lane.

Local access checks reached Loudoun and Oracle corporate news, received 403 from ERCOT and Oracle investor news, and encountered a PJM DNS failure. These failures are disclosed per provider rather than treating another provider's success as complete coverage. [Discovery rules and runner verification](event-discovery.md) document the bounds and diagnostic workflow.

## September 29, 2026 — retire Oracle Q1 IR page from Events

- **URL:** `https://investor.oracle.com/investor-news/news-details/2026/Oracle-Announces-Q1-Results-Driven-by-Triple-Digit-Growth-in-Cloud-Infrastructure-Revenues/default.aspx`
- **Observed check:** the September 29 source check received `403 Forbidden` and excluded this candidate. The [snapshot commit](https://github.com/LEO0331/Gridline/commit/facf0f3) retains that exclusion in `sourceHealth.events.coverage`.
- **Decision:** remove this exact URL from `server/event-candidates.json`. It cannot pass the accessible-page rule, and quarterly results belong in the company-disclosure research lane rather than the project-decision event lane.
- **Continuing evidence:** SEC filing facts remain available in Company disclosures. The separately sourced Oracle–Abilene–ERCOT relationship remains in the [relationship register](relationship-evidence.md).
- **Scope:** this retires one URL, not all Oracle announcements. The Events page describes only configured sources and does not claim complete coverage of Oracle or U.S. infrastructure news.

The dated `public/data/event-review.json` is an older manual review and is left intact as a record of what was accessible at that time; newer automated source checks take precedence in the live dashboard.
