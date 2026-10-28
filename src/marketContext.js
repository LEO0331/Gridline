import { normalizePriceObservations, latestSourceSegment } from './signals/series';
import { latestExpectedPriceSession } from './us-market-calendar';

const recent = (row, now) => {
  const date = new Date(now);
  return Boolean(row && Number.isFinite(date.getTime()) && row.date === latestExpectedPriceSession(date));
};
const series = (snapshot, ticker) => {
  const cutoff = Date.parse(snapshot?.generatedAt || '');
  if (!Number.isFinite(cutoff)) return [];
  // Filter before date deduplication so a later-known revision cannot replace
  // the version available at publication. Unknown retrieval dates remain usable,
  // but their availability by publication cannot be established.
  const available = (snapshot?.observations || []).filter(row => {
    const retrieved = Date.parse(row?.retrievedAt || '');
    return !Number.isFinite(retrieved) || retrieved <= cutoff;
  });
  const rows = latestSourceSegment(normalizePriceObservations(available, ticker, snapshot.generatedAt));
  let start = rows.length - 1;
  while (start > 0 && rows[start - 1].provider === rows[rows.length - 1].provider) start -= 1;
  return rows.slice(Math.max(0, start));
};

// Align shared sessions and require a common provider; the providers have different or
// undocumented adjustment conventions, so cross-provider returns are not comparable.
export function relativePerformanceCoverage(stock, benchmark, sessions, now) {
  const benchmarkByDate = new Map(benchmark.map(row => [row.date, row]));
  const a = stock.filter(row => benchmarkByDate.has(row.date)).slice(-(sessions + 1));
  const b = a.map(row => benchmarkByDate.get(row.date));
  const coverage = { overlappingObservations: a.length, requiredObservations: sessions + 1, comparison: null };
  if (!stock.length || !benchmark.length) return { ...coverage, reason: 'missing-observations' };
  if (a.length !== sessions + 1) return { ...coverage, reason: 'insufficient-overlap' };
  if (!recent(a[a.length - 1], now) || !recent(b[b.length - 1], now)) return { ...coverage, reason: 'stale-endpoint' };
  if (!a[0].provider || a[0].provider !== b[0].provider || a.some((row, i) => row.provider !== a[0].provider || b[i].provider !== b[0].provider)) return { ...coverage, reason: 'incompatible-provider' };
  const stockReturn = a[a.length - 1].value / a[0].value - 1;
  const benchmarkReturn = b[b.length - 1].value / b[0].value - 1;
  return { ...coverage, reason: null, comparison: { percentagePoints: (stockReturn - benchmarkReturn) * 100, stockReturn, benchmarkReturn, start: a[0].date, end: a[a.length - 1].date, provider: a[0].provider, stockSourceUrl: a[0].sourceUrl, benchmarkSourceUrl: b[0].sourceUrl, observationIds: [...a.map(row => row.id), ...b.map(row => row.id)].filter(Boolean) } };
}

export function relativePerformance(stock, benchmark, sessions, now) {
  return relativePerformanceCoverage(stock, benchmark, sessions, now).comparison;
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
    const comparisonCoverage = Object.fromEntries(benchmarks.map(benchmark => [benchmark.ticker,
      Object.fromEntries([20, 60].map(n => [n, relativePerformanceCoverage(rows, benchmark.rows, n, now)]))]));
    return { ticker, latest, above: eligible ? latest.value > window.reduce((sum, row) => sum + row.value, 0) / 20 : null,
      comparisonCoverage,
      comparisons: Object.fromEntries(benchmarks.map(benchmark => [benchmark.ticker, Object.fromEntries([20, 60].map(n => [n, comparisonCoverage[benchmark.ticker][n].comparison]))])) };
  });
  const covered = companies.filter(company => company.above !== null);
  return { benchmarks, companies, coverage: covered.length, above: covered.filter(company => company.above).length, total: tickers.length, participation: covered.length ? covered.filter(company => company.above).length / covered.length * 100 : null };
}
