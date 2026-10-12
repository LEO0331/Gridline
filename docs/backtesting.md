# Retrospective MA5/MA10 backtest

The backtest uses sourced daily closing prices only. It does not use the retired company fundamental/exposure scores or reconstructed v1 history.

The backend version is `price-ma5-ma10-retrospective-v1`, with a fixed ten-session horizon across the supported 20-symbol universe. `POST /api/backtest` rejects `horizonDays` and horizons other than ten sessions; `GET /api/backtest/runs` filters saved runs to this version. The static full snapshot supplies public retrospective coverage; the Pages UI does not need a running API or Supabase.

For each ticker, sort positive closes by distinct trading date and require an HTTPS provider dataset URL. The test uses only rows from the most recent provider dataset, avoiding an unexplained mix of vendors. At each close after ten observations, calculate MA5 and MA10 using only prices available through that date. A bullish signal occurs when MA5 crosses from at or below MA10 to above it; a bearish signal occurs on the reverse crossing. Entry uses the **next observed session close**. Exit uses the close ten observed sessions after entry. Outcomes without both closes stay pending and do not enter performance statistics.

Directional return is `(exit / entry - 1)` for bullish signals and its negative for bearish signals. Hit rate is the share of completed signals with positive directional return. Average directional return is the arithmetic mean over completed signals. Each row shows its signal averages, entry and exit dates/prices, and source dataset URL. The reported sample size is the number of completed signals.

This is a retrospective calculation over later-retrieved historical prices. It is not a recorded live strategy. Closes are not executable entry quotes; trading costs, slippage, dividends, corporate actions, revised data, and overlapping outcomes are not modeled. Descriptive hit rate and average return do not establish predictive skill or suitability for an investor.
