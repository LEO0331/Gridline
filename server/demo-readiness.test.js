const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDemoReadiness, DEFAULT_TICKERS } = require('./demo-readiness');
const { latestExpectedPriceSession, easternParts, isNyseTradingDay } = require('./us-market-calendar');

const DAY_MS = 24 * 60 * 60 * 1000;

test('invalid declared universes cannot bypass price readiness or crash the evaluator', () => {
  for (const trackedTickers of [[], {}, 'NBIS', ['UNKNOWN'], ['NBIS', 'NBIS']]) {
    const result = evaluateDemoReadiness({ ...readySnapshot(), trackedTickers });
    assert.equal(result.ready, false);
    assert.ok(result.checks.some(item => item.id === 'tracked-universe' && !item.ok));
  }
});

function priceRows(ticker, end = new Date(), count = 70) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end.getTime() - (count - 1 - index) * DAY_MS);
    return {
      id: `${ticker}-${index}`,
      source: 'prices',
      type: 'close',
      ticker,
      value: 100 + index,
      observedAt: date.toISOString(),
      provenance: { provider: 'Fixture market data', originUrl: 'https://example.com/prices' },
    };
  });
}

function readySnapshot() {
  const generatedAt = new Date();
  const lastClose = new Date(`${latestExpectedPriceSession(generatedAt)}T00:00:00Z`);
  const tickers = DEFAULT_TICKERS;
  return {
    schemaVersion: 4,
    generatedAt: generatedAt.toISOString(),
    observations: [...tickers.flatMap(ticker => priceRows(ticker, lastClose)), ...['SPY', 'QQQ'].flatMap(ticker => benchmarkPrices(ticker, lastClose))],
    companyHistory: [{ ticker: 'NBIS', observedAt: generatedAt.toISOString(), origin: 'recorded' }],
    backtestCoverage: { recorded: 1, reconstructed: 0 },
    methodologies: { companyScore: 'gridline-price-signal-v2.0.0' },
    sourceHealth: { prices: { status: 'ok', recordCount: 280 } },
  };
}

function benchmarkPrices(ticker, end, count = 70) {
  const rows = [];
  const day = new Date(end);
  while (rows.length < count) {
    if (isNyseTradingDay(easternParts(new Date(`${day.toISOString().slice(0, 10)}T17:00:00Z`)))) rows.unshift(...priceRows(ticker, day, 1));
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return rows;
}

test('demo readiness passes a schema-v4 snapshot with recent price coverage', () => {
  const result = evaluateDemoReadiness(readySnapshot());
  assert.equal(result.ready, true);
  assert.equal(result.blockerCount, 0);
  assert.equal(result.priceCoverage.NBIS.count, 70);
});

test('demo readiness blocks the old zero-row price failure mode', () => {
  const snapshot = readySnapshot();
  snapshot.observations = [];
  snapshot.sourceHealth.prices = { status: 'ok', recordCount: 0 };
  const result = evaluateDemoReadiness(snapshot);
  assert.equal(result.ready, false);
  assert.ok(result.checks.some(item => item.id === 'healthy-source-prices' && !item.ok));
  assert.ok(result.checks.some(item => item.id === 'prices-NBIS' && !item.ok));
});

test('demo readiness blocks legacy curated scores and unreferenced prices', () => {
  const snapshot = readySnapshot();
  snapshot.scores = [{ methodologyVersion: 'gridline-company-v1.0.0', fundamentals: 83, emotion: 50, exposure: 92, gap: 'Positive', confidence: 86 }];
  assert.equal(evaluateDemoReadiness(snapshot).ready, false);
  snapshot.scores = [];
  snapshot.observations.forEach(row => { row.provenance.originUrl = null; });
  assert.equal(evaluateDemoReadiness(snapshot).ready, false);
});

test('an empty verified event feed does not block a snapshot', () => {
  const snapshot = readySnapshot();
  snapshot.sourceHealth.events = { status: 'ok', recordCount: 0 };
  const result = evaluateDemoReadiness(snapshot);
  assert.equal(result.ready, true);
  assert.ok(result.checks.some(item => item.id === 'healthy-source-events' && item.ok));
});

test('optional degraded sources are visible warnings rather than demo blockers', () => {
  const snapshot = readySnapshot();
  snapshot.sourceHealth.pjm = { status: 'degraded', message: 'PJM_API_KEY is not configured.' };
  const result = evaluateDemoReadiness(snapshot);
  assert.equal(result.ready, true);
  assert.equal(result.warningCount, 1);
});

test('schema is required for the finished demo gate', () => {
  const snapshot = readySnapshot();
  snapshot.schemaVersion = 3;
  snapshot.backtestCoverage.reconstructed = 0;
  const result = evaluateDemoReadiness(snapshot);
  assert.equal(result.ready, false);
  assert.ok(result.checks.some(item => item.id === 'schema-v4' && !item.ok));
  assert.ok(!result.checks.some(item => item.id === 'reconstructed-history'));
});
test('partial event coverage is disclosed as a warning', () => {
  const snapshot = readySnapshot();
  snapshot.sourceHealth.events = { status: 'partial', recordCount: 1, coverage: { feedStatus: 'unavailable' } };
  const result = evaluateDemoReadiness(snapshot, { now: snapshot.generatedAt });
  assert.equal(result.ready, true);
  assert.ok(result.checks.some(item => item.id === 'degraded-source-events' && !item.ok));
});

test('verified price history is sufficient without reconstructed score history', () => {
  const snapshot = readySnapshot();
  snapshot.companyHistory = [];
  snapshot.backtestCoverage = { recorded: 0, reconstructed: 0 };
  const result = evaluateDemoReadiness(snapshot);
  assert.equal(result.ready, true);
  assert.ok(!result.checks.some(item => item.id === 'reconstructed-history'));
});

test('readiness blocks a missing Friday close on Sunday ET and reports the expected session', () => {
  const snapshot = readySnapshot();
  snapshot.generatedAt = '2026-10-05T01:01:12Z';
  snapshot.observations = priceRows('NBIS', new Date('2026-10-01T00:00:00Z'));
  const result = evaluateDemoReadiness(snapshot, { tickers: ['NBIS'] });
  assert.equal(result.ready, false);
  assert.equal(result.priceCoverage.NBIS.expectedSession, '2026-10-02');
  snapshot.observations = priceRows('NBIS', new Date('2026-10-02T00:00:00Z'));
  assert.equal(evaluateDemoReadiness(snapshot, { tickers: ['NBIS'] }).ready, true);
});

test('readiness requires today only after the publication cutoff and rejects future rows as coverage', () => {
  const snapshot = readySnapshot();
  snapshot.generatedAt = '2026-10-05T20:14:59Z';
  snapshot.observations = priceRows('NBIS', new Date('2026-10-02T00:00:00Z'));
  assert.equal(evaluateDemoReadiness(snapshot, { tickers: ['NBIS'] }).ready, true);
  snapshot.generatedAt = '2026-10-05T20:15:00Z';
  assert.equal(evaluateDemoReadiness(snapshot, { tickers: ['NBIS'] }).ready, false);
  snapshot.observations.push(...priceRows('NBIS', new Date('2026-10-06T00:00:00Z'), 1));
  assert.equal(evaluateDemoReadiness(snapshot, { tickers: ['NBIS'] }).ready, false);
});

test('missing benchmarks warn without blocking the tracked company universe', () => {
  const snapshot = readySnapshot();
  snapshot.observations = snapshot.observations.filter(row => !['SPY', 'QQQ'].includes(row.ticker));
  const result = evaluateDemoReadiness(snapshot);
  assert.equal(result.ready, true);
  assert.equal(Object.keys(result.priceCoverage).length, 20);
  assert.deepEqual(result.benchmarkCoverage.map(row => [row.ticker, row.count, row.ready]), [['SPY', 0, false], ['QQQ', 0, false]]);
  assert.equal(result.checks.filter(row => row.id.startsWith('benchmark-') && row.severity === 'warning' && !row.ok).length, 2);
});

test('benchmark readiness requires current continuous provider history and 61 closes', () => {
  const snapshot = readySnapshot();
  const rows = snapshot.observations.filter(row => row.ticker === 'SPY');
  assert.equal(evaluateDemoReadiness(snapshot).benchmarkCoverage[0].ready, true);
  rows.slice(-10).forEach(row => { row.provenance = { provider: 'Changed provider', originUrl: 'https://example.com/new-prices' }; });
  let coverage = evaluateDemoReadiness(snapshot).benchmarkCoverage[0];
  assert.equal(coverage.count, 70);
  assert.equal(coverage.continuousCount, 10);
  assert.equal(coverage.ready, false);
  assert.ok(coverage.reasons.includes('continuity'));
  snapshot.observations = snapshot.observations.filter(row => row !== rows.at(-1));
  coverage = evaluateDemoReadiness(snapshot).benchmarkCoverage[0];
  assert.equal(coverage.current, false);
  assert.ok(coverage.reasons.includes('stale'));
  assert.equal(evaluateDemoReadiness(snapshot).ready, true);
});

test('benchmark duplicate revisions use the latest known retrieval and exclude future or non-session observations', () => {
  const snapshot = readySnapshot();
  const spy = snapshot.observations.filter(row => row.ticker === 'SPY').at(-1);
  spy.retrievedAt = snapshot.generatedAt;
  snapshot.observations.push({ ...spy, retrievedAt: new Date(Date.parse(snapshot.generatedAt) - 1000).toISOString(), provenance: { provider: 'Old revision', originUrl: 'https://example.com/old' } });
  snapshot.observations.push({ ...spy, retrievedAt: new Date(Date.parse(snapshot.generatedAt) + DAY_MS).toISOString(), provenance: { provider: 'Future revision', originUrl: 'https://example.com/future' } });
  snapshot.observations.push({ ...spy, observedAt: new Date(Date.parse(snapshot.generatedAt) + DAY_MS).toISOString() });
  const weekend = new Date(snapshot.generatedAt);
  while (weekend.getUTCDay() !== 6) weekend.setUTCDate(weekend.getUTCDate() - 1);
  snapshot.observations.push({ ...spy, observedAt: `${weekend.toISOString().slice(0, 10)}T00:00:00Z` });
  const coverage = evaluateDemoReadiness(snapshot).benchmarkCoverage[0];
  assert.equal(coverage.provider, 'Fixture market data');
  assert.equal(coverage.continuousCount, 70);
});
