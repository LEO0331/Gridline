# Market context and relative performance

Gridline fetches SPY and QQQ through the existing daily-close price adapters and provenance contracts. They are benchmark instruments, not members of the tracked company universe; SEC and company-research ingestion continues to use only company tickers. Full and compact snapshots preserve benchmark observations, provider, source URL, observation date and retrieval date. Failed ticker refreshes retain last-known-good history with its original dates; retained data is not made current by publishing a new snapshot.

Market Context compares each benchmark's latest eligible close with its 20-observation simple moving average. Eligibility requires the latest expected NYSE session: at or after 4:15 PM New York time on a trading day, that day's close; otherwise the previous trading session. Basket participation is the number of eligible tracked companies whose close exceeds their own MA20 divided by the number with enough current, continuous-source history. Both coverage and the full tracked-company count are shown. This is participation in Gridline's thematic basket, not breadth across the US market. Snapshot refresh and retry include the benchmarks independently of the company universe.

For each company and benchmark, 20- and 60-session comparisons use the most recent 21 or 61 **shared** dated closes in their latest continuous source segments. The endpoints are aligned by date and all rows must identify the same provider. For each aligned window:

```text
stock return = stock close at end / stock close at start - 1
benchmark return = benchmark close at end / benchmark close at start - 1
relative performance = stock return - benchmark return
```

The UI expresses the difference in percentage points, not percent relative to the benchmark and not RSI. Leaders and laggards are the highest and lowest available observed differences, not investment recommendations. Coverage is shown for each benchmark and horizon; missing, stale, insufficient or provider-incompatible data produces an unavailable result with the reason and overlapping-close count. The results retain observation IDs and source links. The 20D/60D labels count overlapping observed intervals, not guaranteed consecutive exchange sessions; missing shared dates can lengthen the period. MA20 participation also resets its history when the identified provider changes, even if the source URL stays the same.

Same-provider data is necessary but does not prove that split and dividend adjustments are consistent. These are price returns, not verified total returns, and provider revisions may change past observations. No intraday data, volume or market-wide breadth is implied. The free demo sources may restrict or revise access; production use requires appropriate market-data rights and validation.
