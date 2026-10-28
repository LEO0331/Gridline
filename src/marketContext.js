import { normalizePriceObservations, latestSourceSegment } from './signals/series';
import { observationRecency } from './freshness';

const recent = (row, now) => row && observationRecency(row.observedAt, now).status === 'current';
const series = (snapshot, ticker) => latestSourceSegment(normalizePriceObservations(snapshot?.observations || [], ticker, snapshot?.generatedAt));

// Align shared sessions and require a common provider; the providers have different or
// undocumented adjustment conventions, so cross-provider returns are not comparable.
export function relativePerformance(stock, benchmark, sessions, now) {
  const benchmarkByDate = new Map(benchmark.map(row => [row.date, row]));
  const a = stock.filter(row => benchmarkByDate.has(row.date)).slice(-(sessions + 1));
  const b = a.map(row => benchmarkByDate.get(row.date));
  if (a.length !== sessions + 1 || b.length !== sessions + 1 || !recent(a[a.length - 1], now) || !recent(b[b.length - 1], now)) return null;
  if (!a[0].provider || a[0].provider !== b[0].provider || a.some((row, i) => row.date !== b[i].date || row.provider !== a[0].provider || b[i].provider !== b[0].provider)) return null;
  const stockReturn = a[a.length - 1].value / a[0].value - 1;
  const benchmarkReturn = b[b.length - 1].value / b[0].value - 1;
  return { percentagePoints: (stockReturn - benchmarkReturn) * 100, stockReturn, benchmarkReturn, start: a[0].date, end: a[a.length - 1].date, provider: a[0].provider, stockSourceUrl: a[0].sourceUrl, benchmarkSourceUrl: b[0].sourceUrl, observationIds: [...a.map(row => row.id), ...b.map(row => row.id)].filter(Boolean) };
}

export function marketContext(snapshot, tickers, now = new Date().toISOString()) {
  const benchmarks = ['SPY', 'QQQ'].map(ticker => {
    const rows = series(snapshot, ticker);
    const latest = rows[rows.length - 1];
    const window = rows.slice(-20);
    const current = recent(latest, now);
    const mean = window.length === 20 ? window.reduce((sum, row) => sum + row.value, 0) / 20 : null;
    return { ticker, rows, latest, current, trend: current && mean !== null ? (latest.value > mean ? 'above' : latest.value < mean ? 'below' : 'equal') : 'unavailable' };
  });
  const companies = tickers.map(ticker => {
    const rows = series(snapshot, ticker);
    const latest = rows[rows.length - 1];
    const window = rows.slice(-20);
    const eligible = recent(latest, now) && window.length === 20;
    return { ticker, latest, above: eligible ? latest.value > window.reduce((sum, row) => sum + row.value, 0) / 20 : null,
      comparisons: Object.fromEntries(benchmarks.map(benchmark => [benchmark.ticker, Object.fromEntries([20, 60].map(n => [n, relativePerformance(rows, benchmark.rows, n, now)]))])) };
  });
  const covered = companies.filter(company => company.above !== null);
  return { benchmarks, companies, coverage: covered.length, above: covered.filter(company => company.above).length, total: tickers.length, participation: covered.length ? covered.filter(company => company.above).length / covered.length * 100 : null };
}
