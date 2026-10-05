const test = require('node:test');
const assert = require('node:assert/strict');
const { refreshWithRetry, shouldRefreshPrices } = require('./export-static-snapshot');

function priceSnapshot(tickers, latestDay, count = 60) {
  const observations = tickers.flatMap(ticker => Array.from({ length: count }, (_, index) => {
    const day = new Date(`${latestDay}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - index);
    return { source: 'prices', type: 'close', ticker, value: 100, observedAt: day.toISOString(), sourceUrl: 'https://example.com/prices' };
  }));
  return { observations };
}

test('snapshot exporter catches up a missing Friday close during the weekend', () => {
  assert.equal(shouldRefreshPrices(priceSnapshot(['ORCL'], '2026-10-01'), ['ORCL'], new Date('2026-10-04T22:00:00Z')), true);
});

test('snapshot exporter skips weekend price fetching once every ticker is current', () => {
  assert.equal(shouldRefreshPrices(priceSnapshot(['ORCL', 'AVGO'], '2026-10-02'), ['ORCL', 'AVGO'], new Date('2026-10-04T22:00:00Z')), false);
});

test('snapshot exporter uses the latest completed session during an NYSE holiday', () => {
  const now = new Date('2026-09-07T22:00:00Z');
  assert.equal(shouldRefreshPrices(priceSnapshot(['ORCL'], '2026-09-04'), ['ORCL'], now), false);
  assert.equal(shouldRefreshPrices(priceSnapshot(['ORCL'], '2026-09-03'), ['ORCL'], now), true);
});

test('snapshot exporter catches up missing tickers and undersized or invalid history on nontrading days', () => {
  const now = new Date('2026-10-04T22:00:00Z');
  assert.equal(shouldRefreshPrices(priceSnapshot(['ORCL'], '2026-10-02'), ['ORCL', 'AVGO'], now), true);
  assert.equal(shouldRefreshPrices(priceSnapshot(['ORCL'], '2026-10-02', 59), ['ORCL'], now), true);
  const invalid = priceSnapshot(['ORCL'], '2026-10-02');
  invalid.observations[1].sourceUrl = null;
  assert.equal(shouldRefreshPrices(invalid, ['ORCL'], now), true);
});

test('snapshot exporter does not count duplicates or unfinished closes toward weekend coverage', () => {
  const now = new Date('2026-10-04T22:00:00Z');
  const snapshot = priceSnapshot(['ORCL'], '2026-10-02', 59);
  snapshot.observations.push({ ...snapshot.observations[0] });
  snapshot.observations.push({ ...snapshot.observations[0], observedAt: '2026-10-05T00:00:00Z' });
  assert.equal(shouldRefreshPrices(snapshot, ['ORCL'], now), true);
});

test('snapshot exporter preserves daily trading-day price refreshes even with current history', () => {
  assert.equal(shouldRefreshPrices(priceSnapshot(['ORCL'], '2026-10-02'), ['ORCL'], new Date('2026-10-05T12:00:00Z')), true);
});

test('snapshot exporter does not repeat bounded event checks after partial access or complete denial', async () => {
  for (const status of ['partial', 'degraded']) {
    let calls = 0;
    const result = await refreshWithRetry({ ingest: async () => {
      calls += 1;
      return { source: 'events', status, coverage: { sources: { ERCOT: { discoveryStatus: 'unavailable' } } } };
    } }, 'events');
    assert.equal(calls, 1);
    assert.equal(result.attempts, 1);
    assert.equal(result.status, status);
  }
});

test('snapshot exporter still retries other degraded providers', async () => {
  let calls = 0;
  const result = await refreshWithRetry({ ingest: async () => ({ source: 'prices', status: ++calls === 1 ? 'degraded' : 'ok' }) }, 'prices');
  assert.equal(calls, 2);
  assert.equal(result.status, 'ok');
  assert.equal(result.attempts, 2);
});
