import { marketContext, relativePerformance } from './marketContext';
import { normalizePriceObservations } from './signals/series';

const dates = Array.from({ length: 61 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString());
const rows = (ticker, multiplier = 1, provider = 'Stooq') => dates.map((observedAt, i) => ({ id: `${ticker}-${i}`, source: 'prices', type: 'close', ticker, observedAt, retrievedAt: '2026-03-03T00:00:00Z', value: 100 + i * multiplier, providerName: provider, sourceUrl: `https://example.com/${ticker}` }));
const now = '2026-03-03T00:00:00Z';
const normalized = (values, ticker) => normalizePriceObservations(values, ticker, now);

test('compares aligned sessions in percentage points with supporting evidence', () => {
  const stock = normalized(rows('A', 2), 'A');
  const benchmark = normalized(rows('SPY'), 'SPY');
  const result = relativePerformance(stock, benchmark, 60, now);
  expect(result.percentagePoints).toBeCloseTo(60);
  expect(result.start).toBe('2026-01-01');
  expect(result.end).toBe('2026-03-02');
  expect(result.observationIds).toHaveLength(122);
  expect(result.provider).toBe('Stooq');
});

test('rejects missing sessions, provider changes, mismatched basis and stale endpoints', () => {
  const a = normalized(rows('A'), 'A');
  const b = normalized(rows('SPY'), 'SPY');
  expect(relativePerformance(a.slice(1), b, 60, now)).toBeNull();
  expect(relativePerformance(a, b.filter((_, i) => i !== 10), 20, now)).not.toBeNull();
  expect(relativePerformance(a, b.filter((_, i) => i !== 50), 20, now).start).toBe('2026-02-09');
  expect(relativePerformance(a, normalized(rows('SPY', 1, 'Yahoo Finance'), 'SPY'), 20, now)).toBeNull();
  expect(relativePerformance(a, b, 20, '2026-04-01T00:00:00Z')).toBeNull();
  const changed = rows('A'); changed[50].sourceUrl = 'https://other.example/A';
  const snapshot = { generatedAt: now, observations: [...changed, ...rows('SPY')] };
  expect(marketContext(snapshot, ['A'], now).companies[0].comparisons.SPY[20]).toBeNull();
});

test('participation counts covered companies and excludes insufficient or stale data', () => {
  const snapshot = { generatedAt: now, observations: [...rows('A', 1), ...rows('B', -0.5), ...rows('SPY')] };
  const result = marketContext(snapshot, ['A', 'B', 'C'], now);
  expect(result.coverage).toBe(2);
  expect(result.above).toBe(1);
  expect(result.participation).toBe(50);
  expect(result.benchmarks[1].trend).toBe('unavailable');
});

test('requires the expected NYSE close while respecting weekends and holidays', () => {
  const snapshot = { generatedAt: now, observations: [...rows('A'), ...rows('SPY')] };
  expect(marketContext(snapshot, ['A'], '2026-03-04T00:00:00Z').coverage).toBe(0);
  const fridayRows = [...rows('A'), ...rows('SPY')].filter(row => row.observedAt.slice(0, 10) <= '2026-02-27');
  const weekend = { generatedAt: '2026-03-01T12:00:00Z', observations: fridayRows };
  expect(marketContext(weekend, ['A'], '2026-03-01T12:00:00Z').coverage).toBe(1);
  expect(marketContext(weekend, ['A'], '2026-03-03T00:00:00Z').coverage).toBe(0);
  const holidayRows = Array.from({ length: 61 }, (_, i) => new Date(Date.UTC(2026, 4, 3 + i)).toISOString()).flatMap((observedAt, i) => ['A', 'SPY'].map(ticker => ({ id: `${ticker}-${i}`, source: 'prices', type: 'close', ticker, observedAt, value: 100 + i, providerName: 'Stooq', sourceUrl: `https://example.com/${ticker}` })));
  expect(marketContext({ generatedAt: '2026-07-04T12:00:00Z', observations: holidayRows }, ['A'], '2026-07-04T12:00:00Z').coverage).toBe(1);
});
