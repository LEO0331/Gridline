# Technical signal methods

Gridline keeps technical indicators behind a common, descriptive signal contract. The signal engine does **not** emit buy/sell recommendations. It reports what a method observed, the evidence window used, method-specific values, dated state changes, data requirements, and interpretation limits.

The Overview now exposes all four methods through the technical-signal explorer. The selected method drives the Market signals research lens, the “About this signal” drawer, and the price chart's dated state-change markers. The lightweight SVG chart renders the same normalized provider-continuous closing-price history, while the marker layer maps method events onto matching visible dates without duplicating indicator calculations.

## Registry

The same registry applies to all 20 tracked companies. It is independent of SEC financial-field coverage and does not require Supabase. Recorded server MA5/MA10 snapshots use `above`/`below`/`mixed`; the frontend common contract uses `upward`/`downward`/`mixed`. RSI, Bollinger and breakout states are calculated from runtime prices and are not server-recorded score versions.

Frontend entry point:

`src/signals/registry.js`

Available methods:

| Method ID | Family | Conventional parameters | Descriptive states |
| --- | --- | --- | --- |
| `trend-moving-average` | Trend | 5 / 10 closing-price averages | `upward`, `downward`, `mixed` |
| `momentum-rsi` | Momentum | 14-period Wilder RSI; reference levels 30 / 70 | `lower-reference-range`, `middle-range`, `upper-reference-range` |
| `momentum-breakout` | Momentum | 20 preceding closes; 20-session setup life; 95% invalidation | `watch`, `breakout`, `pullback`, `reconfirmed`, `invalidated` |
| `volatility-bollinger` | Volatility | 20-period mean; ±2 population standard deviations | `below-lower-band`, `within-bands`, `above-upper-band` |

These parameters are conventional defaults used to demonstrate distinct technical-analysis theories. They are explicit configuration, not optimized parameters and not claims that one method predicts returns.

## Common result contract

Every method returns the same top-level structure:

```js
{
  id,
  family,
  observedAt,
  state,
  value,
  events,
  evidence,
  requirements,
  limitations
}
```

- `state` is descriptive rather than prescriptive.
- `value` contains the method-specific calculated values and parameters.
- `events` contains dated state/crossover changes that are mapped onto matching visible price-chart observations.
- `evidence` identifies the provider segment and observation IDs supporting the result.
- `requirements` states the minimum observation count and whether the current data satisfies it.
- `limitations` provides method boundaries for the customer-facing explainer.

## Data handling

Price observations are normalized before method evaluation:

1. Only positive, dated `prices / close` observations for the selected ticker are accepted.
2. Snapshot evaluation respects `generatedAt`; observations after that cutoff are excluded.
3. Duplicate exchange dates are collapsed, preferring the most recently retrieved record.
4. Source URLs must be HTTPS to support an auditable signal result.
5. Indicator calculations use the latest contiguous provider segment. A provider change cannot be bridged to manufacture a complete calculation window.
6. If the latest source segment is shorter than the method requirement, the method returns `state: "unavailable"`.

This keeps technical calculations consistent with Gridline's existing provenance and fail-closed approach.

## Method notes

### Trend / moving averages

The current dashboard behavior is preserved. It calculates short and long simple moving averages from recent closing prices. The descriptive state is:

- `upward` when the latest close is above the short average and the short average is above the long average;
- `downward` for the reverse ordering;
- `mixed` otherwise.

The event stream records crossings between the short and long averages. When those dates are visible in the selected chart range, they appear as neutral state-change markers.

### Momentum / RSI

Gridline uses a 14-period Relative Strength Index with Wilder smoothing. The first value requires 15 closing prices because RSI is based on 14 price changes.

Reference ranges are deliberately named rather than interpreted as automatic reversal calls:

- below 30: `lower-reference-range`;
- 30–70: `middle-range`;
- above 70: `upper-reference-range`.

The commonly used 30/70 levels are conventions, not guaranteed turning points.

### Momentum / breakout and continuation

The method needs at least 21 consecutive-provider closes. On each observation, it compares the current close with the highest close of the preceding 20 observations (the current close is excluded). A strictly higher close creates a `breakout` setup; without an active setup the state is `watch`. A close below the breakout close moves the setup to `pullback`; after a pullback, a close strictly above the original breakout close moves it to `reconfirmed`. A close below 95% of the original reference close invalidates the setup. A setup also becomes `invalidated` at age 20 observations, with expiration taking precedence. On the following observation it returns to watch or starts a new qualifying setup. Equal prices do not satisfy strict comparisons. The parameters are bounded research conventions, not fitted forecasts.

Events contain the original reference window, breakout date and close, supporting observation IDs, provider and source URL. Each historical transition uses only prices through its date. The current snapshot may nevertheless contain later provider revisions: Gridline does not possess an archival point-in-time price database. Split and dividend adjustments are not verified, and daily closes do not supply intraday highs/lows, volume, VWAP, or executable fills.

### Volatility / Bollinger Bands

Gridline uses a 20-period simple mean with upper and lower bands at two population standard deviations from the mean.

The state only reports the latest price location relative to those bands. A price outside a band is not treated as a prediction of reversal or continuation.

## UI use

The customer-facing explainer consumes the registry without embedding indicator logic in components:

```text
sourced price observations
          ↓
     signal registry
  ┌───────┼─────────┐
  ↓       ↓         ↓
 trend   RSI / breakout   Bollinger
  └───────┼─────────┘
          ↓
 common signal result
     ┌────┼───────────┐
     ↓    ↓           ↓
 explainer price chart chart markers
   (live)    (live)       (live)
```

This separation keeps calculation, evidence, explanation, and presentation independently testable.
