import { buildDataHealth } from './dataHealthModel';
import { companies } from './companyRegistry';
import { latestExpectedPriceSession, easternParts, isNyseTradingDay } from './us-market-calendar';

const makePrices = (ticker, count = 70) => Array.from({ length: count }, (_, index) => ({
  source: 'prices',
  type: 'close',
  ticker,
  value: 100 + index,
  observedAt: new Date(Date.UTC(2026, 6, 8 + index)).toISOString(),
  provenance: { provider: 'Fixture', originUrl: 'https://example.com/prices' },
}));
const benchmarkPrices = ticker => {
  const rows = [];
  const day = new Date(`${latestExpectedPriceSession(new Date('2026-09-16T12:00:00Z'))}T17:00:00Z`);
  while (rows.length < 70) {
    if (isNyseTradingDay(easternParts(day))) rows.unshift({ source: 'prices', type: 'close', ticker, value: 100, observedAt: `${day.toISOString().slice(0, 10)}T00:00:00Z`, sourceUrl: 'https://example.com/prices', providerName: 'Fixture' });
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return rows;
};

const readySnapshot = () => ({
  schemaVersion: 4,
  generatedAt: '2026-09-16T00:00:00.000Z',
  freshness: 'partial',
  methodologies: { companyScore: 'gridline-price-signal-v2.0.0' },
  backtestCoverage: { start: null, end: null, recorded: 0, reconstructed: 0, reconstructionQuality: 'recorded-only' },
  observations: [...companies.flatMap(({ ticker }) => makePrices(ticker)), ...['SPY', 'QQQ'].flatMap(benchmarkPrices)],
  sourceHealth: {
    prices: { status: 'ok', recordCount: 280, lastSuccessAt: '2026-09-16T00:00:00.000Z' },
    eia: { status: 'ok', recordCount: 24 },
    pjm: { status: 'degraded', message: 'PJM_API_KEY is not configured.' },
  },
  outcomes: [],
});

test('data health reports only sources used by the dashboard', () => {
  const result = buildDataHealth(readySnapshot(), new Date('2026-09-16T12:00:00.000Z'));
  expect(result.state).toBe('ready');
  expect(result.sources.map(item => item.source)).toEqual(['prices', 'events', 'sec', 'eia']);
  expect(result.blockers).toEqual([]);
  expect(result.priceCoverage.every(item => item.ready)).toBe(true);
  expect(result.backtest.reconstructed).toBe(0);
});

test('committed compact dashboard supports the same Data Status readiness checks', () => {
  const compact = require('../public/data/dashboard-overview.json');
  const result = buildDataHealth(compact, new Date(compact.generatedAt));
  expect(result.blockers).toEqual([]);
  expect(result.priceCoverage.every(item => item.ready)).toBe(true);
});

test('data health makes missing price coverage visible as attention', () => {
  const snapshot = readySnapshot();
  snapshot.observations = snapshot.observations.filter(item => item.ticker !== 'AVGO');
  const result = buildDataHealth(snapshot, new Date('2026-09-16T12:00:00.000Z'));
  expect(result.state).toBe('attention');
  expect(result.blockers).toContain('prices');
  expect(result.priceCoverage.find(item => item.ticker === 'AVGO').count).toBe(0);
});

test('invalid enabled universes remain visible as attention', () => {
  for (const trackedTickers of [[], {}, ['UNKNOWN'], ['NBIS', 'NBIS']]) {
    expect(buildDataHealth({ ...readySnapshot(), trackedTickers }).blockers).toContain('trackedUniverse');
  }
});

test('old schema without declared coverage is explicitly not demo-ready', () => {
  const snapshot = readySnapshot();
  snapshot.schemaVersion = 3;
  snapshot.backtestCoverage = null;
  const result = buildDataHealth(snapshot, new Date('2026-09-16T12:00:00.000Z'));
  expect(result.state).toBe('attention');
  expect(result.blockers).toContain('schema');
  expect(result.blockers).toContain('backtestCoverage');
});

test('Data Status flags retained snapshots older than 96 hours', () => {
  const result = buildDataHealth(readySnapshot(), new Date('2026-09-21T12:00:00Z'));
  expect(result.blockers).toContain('snapshotStale');
  expect(result.state).toBe('attention');
});

test('benchmark gaps warn without changing company readiness or company counts', () => {
  const snapshot = readySnapshot();
  snapshot.observations = snapshot.observations.filter(row => row.ticker !== 'SPY');
  const result = buildDataHealth(snapshot, new Date('2026-09-16T12:00:00Z'));
  expect(result.state).toBe('ready-with-warnings');
  expect(result.blockers).toEqual([]);
  expect(result.priceCoverage).toHaveLength(20);
  expect(result.benchmarkCoverage.find(row => row.ticker === 'SPY').reasons).toEqual(['missing']);
});
