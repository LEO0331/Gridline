# Market signal methodology (v2)

Gridline currently publishes a **descriptive price trend**, not a company fundamental score, valuation target, confidence percentage, or investment recommendation. The previous v1 values for fundamentals, data-center exposure, market emotion, and expectations gap were based partly on curated numerical inputs. New snapshots set those fields to `null`; old v1 and reconstructed company-history records are excluded from the public export and API views.

The default universe is all 20 companies in `src/data/companyExposure.json`. Company-specific SEC facts and official research now appear alongside the trend, but do not change this formula or reinstate v1 numerical scores. The frontend also offers separately calculated RSI and Bollinger methods; see [technical signal methods](signal-methods.md).

## Inputs and formula

For each tracked ticker, take the latest ten **distinct trading dates** with positive daily closing prices at or before the snapshot cutoff. All ten records must identify the same provider URL. Otherwise the trend is unavailable.

- `MA5 = sum(last 5 closes) / 5`
- `MA10 = sum(last 10 closes) / 10`
- `spreadPct = (MA5 / MA10 - 1) × 100`
- `above` when `latest close > MA5 > MA10`
- `below` when `latest close < MA5 < MA10`
- `mixed` in other complete cases

The output stores the ten observation IDs, observed close date, provider URL, formula, and methodology version `gridline-price-signal-v2.0.0`. Missing dates, invalid prices, or a missing/mixed provider reference produce an unavailable signal. The market-price provider is a demo feed and can revise history or restrict direct browser access.

This ordering describes past prices. It does not estimate fair value, future return, physical power delivery, or the probability of an investment outcome. The separate MA5/MA10 backtest is retrospective and has its own limitations in [Backtesting](backtesting.md).
