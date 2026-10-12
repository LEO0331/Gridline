# Demo hardening

This pass keeps Gridline lightweight while making the public demo more explicit about data state, recency, keyboard use, and small-screen behavior.

## Snapshot lifecycle

The main dashboard now distinguishes three states before rendering research panels:

- **loading** — the static dashboard snapshot request is still pending;
- **error** — the snapshot request failed and exposes a retry action;
- **ready but empty** — the request succeeded but no customer-facing observations are present.

Research panels are not rendered from an empty placeholder while loading or after a failed request. This avoids a cascade of misleading “unavailable” cards that could otherwise look like real source results.

The Data Status page uses the same principle: readiness calculations are shown only after its snapshot request succeeds.

## Observation recency

Price charts and the technical-signal explainer show recency relative to the snapshot timestamp, not the viewer's wall-clock time.

Examples:

```text
same day as snapshot
2 days before snapshot
23 days before snapshot · beyond demo coverage window
```

The demo coverage boundary reuses the existing 10-day market-price readiness rule from `dataHealthModel.js`. Recency is descriptive metadata; it does not alter the technical indicator calculation.

## Keyboard and screen-reader behavior

The Overview now includes:

- a skip link to the dashboard content;
- `aria-current` on primary navigation;
- exposed selected state on signal lenses, company cards, event filters, and region filters;
- visible focus rings for buttons, links, selects, and the SVG chart;
- keyboard chart inspection with Left / Right / Home / End;
- an `aria-live` chart readout for the active date, close, and signal event;
- signal-explainer modal focus entry, containment, Escape close, and focus restoration;
- accessible region/status semantics for snapshot-change and snapshot-load states.

## Mobile behavior

Primary navigation remains available below desktop widths as a horizontally scrollable row instead of disappearing. Price metrics, signal metadata, snapshot states, and drawer content collapse to narrower layouts without changing the underlying evidence.

## Reduced motion

The snapshot-loading indicator respects `prefers-reduced-motion` and falls back to a static loading mark.

## Bilingual parity

All new loading, retry, recency, accessibility-assistive, and stale-coverage copy is provided in English and Traditional Chinese.


## Runtime snapshot payload

The deployed Overview does not need the complete historical export on first load.

The exporter therefore writes two files:

- `dashboard-snapshot.json` — the full audit/backtest snapshot retained for historical tools and operational inspection;
- `dashboard-overview.json` — a compact runtime projection used by the public dashboard.

The runtime projection keeps 120 dated closes per tracked ticker (enough for the 90-session chart plus technical-indicator warmup), the latest complete PJM demand day and the comparable day one week earlier, current SEC facts with audited concept/classification metadata, verified events, company research announcements, source health including field and publisher coverage, the methodology and backtest-coverage metadata needed by Data Status, snapshot changes and demo-readiness metadata.

It removes duplicated provenance/lineage fields and full-history-only payloads from the critical request. The 2026-10-12 committed artifacts are approximately 7.16 MB full and 1.05 MB compact (decimal bytes), about an 85% reduction before HTTP compression. Sizes change with retained history and company news; compare the generated files rather than treating these measurements as a payload limit.

All 20 tracked companies share this projection. Financial gaps distinguish stale, unavailable and not-separately-reported values from explicit reported zero; partial publisher access retains dated reviewed evidence without a false new verification.

If the compact file is unavailable, the browser loader falls back to `dashboard-snapshot.json` so deployment remains backward compatible.
