# Snapshot changes

Gridline records a compact, deterministic diff between the newly generated static dashboard snapshot and the immediately preceding committed snapshot.

The comparison covers the configured 20-symbol universe and is included in both full and compact runtime exports. Financial facts and company announcements have their own evidence/coverage panels; they are not additional diff categories in `snapshot-diff-v1`.

The goal is not to diff every JSON field. The public dashboard only surfaces changes that can alter a researcher's interpretation of the current snapshot:

- latest dated closing price for a tracked ticker;
- recorded short-term trend signal availability/state;
- newly verified, materially updated, or newly archived infrastructure event records;
- source-health status changes.

The generated object is stored inside `dashboard-snapshot.json` as `snapshotChanges`:

```js
{
  version: 'snapshot-diff-v1',
  available: true,
  from: '2026-09-23T22:00:00.000Z',
  to: '2026-09-24T22:00:00.000Z',
  summary: {
    total: 4,
    price: 1,
    signal: 1,
    event: 1,
    sourceHealth: 1
  },
  changes: [
    {
      type: 'price',
      ticker: 'NBIS',
      before: 229.4,
      after: 236.12,
      observedAt: '...',
      sourceUrl: 'https://...'
    }
  ]
}
```

## Generation flow

```text
previous committed snapshot
          │
          ├──────────────┐
          │              │
provider refresh     retained history
          │              │
          └──────┬───────┘
                 ▼
          current snapshot
                 │
                 ▼
      buildSnapshotChanges()
                 │
                 ▼
      snapshotChanges payload
                 │
                 ▼
       dashboard-snapshot.json
```

The comparison runs before the new snapshot is written, so the baseline is the preceding committed static snapshot. On a concurrent remote update, the publishing workflow retrieves that newer baseline and regenerates rather than rebasing a stale generated diff; see [Actions operation](actions-maintenance.md).

## Change rules

### Price

For each configured ticker, Gridline compares the latest valid dated close in the previous and current snapshots. A new trading date counts as an update even when the numerical close is unchanged, because the current observation date has advanced.

Duplicate observations on the same date prefer the most recently retrieved record.

### Recorded trend signal

The static snapshot already contains the versioned recorded market signal produced by the server scoring methodology. The diff compares its availability and descriptive state (`above`, `below`, `mixed`) for each tracked ticker.

This snapshot diff does not independently recalculate RSI or Bollinger states. Those remain frontend analysis methods calculated from the sourced price history. Keeping the recorded snapshot comparison tied to the server's versioned signal avoids a second implementation of the indicator logic.

### Verified events

Infrastructure events are compared by their HTTPS record URL. The latest retrieved version of a URL is used.

Gridline emits:

- `event-added` when a verified URL was not present in the previous snapshot;
- `event-updated` when customer-facing event fields change;
- `event-archived` when an existing event crosses the dashboard's 30-day archive threshold between snapshot times.

### Source health

A change is emitted when a source's status changes, for example:

```text
events: partial → ok
prices: ok → degraded
```

A degraded refresh can therefore be visible even when last-known-good observations are retained.

## Fail-closed behavior

If there is no valid immediately preceding snapshot timestamp, `snapshotChanges.available` is `false` with reason `previous-snapshot-unavailable`.

The UI displays that state explicitly rather than pretending the current snapshot has zero changes. Once a later refresh has a valid prior baseline, normal comparison begins automatically.

## UI behavior

The Overview shows **Changes since previous snapshot** below the price chart.

The card:

- shows the previous and current snapshot dates;
- summarizes counts by price, trend signal, verified event, and source-health changes;
- prioritizes the currently selected company;
- links back to the supporting source when the change has one;
- collapses long change lists by default;
- uses the same English / Traditional Chinese presentation as the rest of the dashboard.

This feature is an audit/history aid. It is not a trading alert or a prediction.
