# Observed price lookback

The price monitor shows daily closes and 30D, 90D or 1Y returns from dated `prices/close` observations. It never falls back to a stored example price. If there is no close near the requested baseline date, the return is unavailable.

A return is `(latest close / baseline close - 1) × 100`. The baseline is the closest observed close within ten calendar days of the target lookback date, measured from the latest observed close. It must precede that latest close, be nonzero and have the same source dataset URL. The monitor displays both dates and the provider dataset URL; a provider may restrict direct browser access. Unsupported or mixed-dataset windows remain unavailable.

MA5 and MA10 use the latest ten distinct dated closes. They describe historical price behavior, not company fundamentals, data-center exposure, fair value or an investment recommendation. Curated score, gap, confidence and percentile fields were removed from this view.

The shared registry supports all 20 tracked companies and configured supported ticker subsets. Failed or incomplete market refreshes retain the preceding verified ticker history and its original timestamps while source health reports the failed attempt. A fresh snapshot generation timestamp does not make retained price dates newer. SEC/company-research-only refreshes preserve market history and grid observations. See [provenance](data-provenance.md) and [Actions maintenance](actions-maintenance.md) for retention and freshness reporting.
