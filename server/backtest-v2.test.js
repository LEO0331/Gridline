const test = require('node:test');
const assert = require('node:assert/strict');
const { runBacktestV2, BACKTEST_V2_VERSION, priceRows } = require('../src/backtestV2');
const row = (i, value, ticker = 'NBIS', provider = 'Stooq') => ({ id: `${ticker}-${i}`, source: 'prices', type: 'close', ticker, value,
  observedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), sourceUrl: `https://example.com/${ticker}`, providerName: provider });
const fixture = () => [...Array.from({ length: 10 }, (_, i) => row(i, 100)), row(10, 110),
  ...Array.from({ length: 12 }, (_, i) => row(i + 11, 100 + i)),
  ...Array.from({ length: 23 }, (_, i) => row(i, 200 + i, 'SPY'))];

test('long-only signal fills next close, exits after holding period and accounts for costs', () => {
  const result = runBacktestV2({ ticker: 'NBIS', holdingSessions: 3, transactionCostBps: 10, slippageBps: 5 }, fixture().filter(r => Date.parse(r.observedAt) <= Date.parse(row(14, 0).observedAt)));
  assert.equal(result.backtestVersion, BACKTEST_V2_VERSION);
  assert.equal(result.trades.length, 1);
  const trade = result.trades[0];
  assert.equal(trade.signalAt, row(10, 110).observedAt);
  assert.equal(trade.entryAt, row(11, 100).observedAt);
  assert.equal(trade.exitAt, row(14, 103).observedAt);
  const net = (103 * 0.9995 * 0.999) / (100 * 1.0005 * 1.001) - 1;
  assert.ok(Math.abs(trade.netReturn - net) < 1e-10);
  assert.ok(Math.abs(result.metrics.portfolioReturn - net) < 1e-10);
  assert.ok(result.metrics.maxDrawdown < 0);
  assert.ok(Math.abs(result.benchmark.value - 14 / 200) < 1e-10);
  assert.equal(result.metrics.averageHoldingSessions, 3);
  assert.equal(result.validation.inSample.end, row(9, 0).observedAt);
  assert.equal(result.validation.outOfSample.start, row(10, 0).observedAt);
  assert.ok(result.sensitivity[0].portfolioReturn > result.sensitivity[2].portfolioReturn);
});

test('pending entry and open trade are not counted as completed', () => {
  const data = fixture().filter(r => r.ticker === 'NBIS');
  const pending = runBacktestV2({ ticker: 'NBIS' }, data.slice(0, 11));
  assert.equal(pending.pending[0].status, 'pending-entry');
  assert.equal(pending.metrics.completedTrades, 0);
  const open = runBacktestV2({ ticker: 'NBIS' }, data.slice(0, 12));
  assert.equal(open.pending[0].status, 'open');
  assert.equal(open.metrics.completedTrades, 0);
  assert.ok(open.metrics.portfolioReturn < 0);
});

test('breakout signals use only past closes and provider discontinuity resets history', () => {
  const rows = [...Array.from({ length: 20 }, (_, i) => row(i, 100)), row(20, 110), row(21, 111), row(22, 112)];
  const result = runBacktestV2({ ticker: 'NBIS', method: 'momentum-breakout', holdingSessions: 1, transactionCostBps: 0, slippageBps: 0 }, rows);
  assert.equal(result.trades[0].signalAt, row(20, 110).observedAt);
  assert.equal(result.trades[0].entryAt, row(21, 111).observedAt);
  const changedFuture = rows.map((item, i) => i > 20 ? { ...item, value: item.value * 2 } : item);
  assert.equal(runBacktestV2({ ticker: 'NBIS', method: 'momentum-breakout', holdingSessions: 1 }, changedFuture).trades[0].signalAt, result.trades[0].signalAt);
  const changedProvider = rows.map((item, i) => i > 19 ? { ...item, sourceUrl: 'https://other.example.com/prices', providerName: 'Other' } : item);
  assert.equal(runBacktestV2({ ticker: 'NBIS', method: 'momentum-breakout' }, changedProvider).coverage.priceObservations, 3);
});

test('unmatched benchmark and invalid parameters are explicit', () => {
  const observations = fixture().filter(r => !(r.ticker === 'SPY' && r.id === 'SPY-0'));
  assert.equal(runBacktestV2({ ticker: 'NBIS' }, observations).benchmark, null);
  assert.throws(() => runBacktestV2({ ticker: 'NBIS', holdingSessions: 61 }, observations));
  assert.throws(() => runBacktestV2({ ticker: 'NBIS', transactionCostBps: -1 }, observations));
  const cutoff = runBacktestV2({ ticker: 'NBIS', asOf: row(8, 0).observedAt }, fixture());
  assert.equal(cutoff.coverage.priceObservations, 9);
  assert.equal(cutoff.metrics.portfolioReturn, null);
  assert.equal(cutoff.metrics.maxDrawdown, null);
});

test('reconfirmation during an open position cannot create an overlapping trade', () => {
  const rows = [...Array.from({ length: 20 }, (_, i) => row(i, 100)), row(20, 110), row(21, 108), row(22, 111),
    ...Array.from({ length: 6 }, (_, i) => row(23 + i, 112 + i))];
  const result = runBacktestV2({ ticker: 'NBIS', method: 'momentum-breakout', holdingSessions: 5 }, rows);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].signalAt, row(20, 0).observedAt);
  assert.equal(result.trades[0].exitAt, row(26, 0).observedAt);
  assert.equal(result.pending.length, 0);
});

test('retrieval cutoff excludes future revisions but retains unknown retrieval dates', () => {
  const cutoff = '2026-02-01T00:00:00Z';
  const original = { ...row(0, 100), retrievedAt: '2026-01-30T00:00:00Z' };
  const revision = { ...original, value: 900, retrievedAt: '2026-02-02T00:00:00Z' };
  const unknown = row(1, 101);
  const result = priceRows([original, revision, unknown], 'NBIS', cutoff);
  assert.deepEqual(result.map(item => item.value), [100, 101]);
  const research = runBacktestV2({ ticker: 'NBIS', asOf: cutoff }, [original, revision, unknown]);
  assert.equal(research.coverage.unknownRetrievalDates, 1);
  assert.match(research.warnings.join(' '), /missing retrieval dates/i);
  assert.equal(priceRows([original, revision], 'NBIS', '2026-02-03T00:00:00Z')[0].value, 900);
});

test('sample cautions expose small completed samples without changing the simulation', () => {
  const result = runBacktestV2({ ticker: 'NBIS', holdingSessions: 3 }, fixture());
  assert.equal(result.sampleQuality.status, 'low-sample');
  assert.equal(result.sampleQuality.completedTrades, result.trades.length);
  assert.equal(result.sampleQuality.lowSampleTradeThreshold, 20);
  assert.equal(result.validation.inSample.sampleQuality.periodObservations, 16);
  assert.equal(result.validation.outOfSample.sampleQuality.periodObservations, 7);
  assert.equal(result.validation.outOfSample.sampleQuality.status, 'low-sample');
  const pending = runBacktestV2({ ticker: 'NBIS' }, fixture().filter(r => r.ticker === 'NBIS').slice(0, 12));
  assert.equal(pending.sampleQuality.status, 'no-completed-trades');
});

test('insufficient history does not produce equity curves or a single-date benchmark return', () => {
  const result = runBacktestV2({ ticker: 'NBIS' }, [row(0, 100), row(0, 200, 'SPY')]);
  assert.equal(result.sampleQuality.status, 'insufficient-history');
  assert.equal(result.metrics.portfolioReturn, null);
  assert.equal(result.metrics.maxDrawdown, null);
  assert.deepEqual(result.equity, []);
  assert.equal(result.benchmark, null);
  assert.equal(result.validation.outOfSample.portfolioReturn, null);
  assert.equal(result.validation.outOfSample.benchmark, null);
});
