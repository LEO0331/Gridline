const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDemoReadiness } = require('./demo-readiness');
const { latestExpectedPriceSession } = require('./us-market-calendar');

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const tickers = ['NBIS', 'CRWV', 'ORCL', 'AVGO'];
  return {
    schemaVersion: 4,
    generatedAt: generatedAt.toISOString(),
    observations: tickers.flatMap(ticker => priceRows(ticker, lastClose)),
    companyHistory: [{ ticker: 'NBIS', observedAt: generatedAt.toISOString(), origin: 'recorded' }],
    backtestCoverage: { recorded: 1, reconstructed: 0 },
    methodologies: { companyScore: 'gridline-price-signal-v2.0.0' },
    sourceHealth: { prices: { status: 'ok', recordCount: 280 } },
  };
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
