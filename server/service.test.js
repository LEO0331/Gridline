const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createStore } = require('./store');
const { createService } = require('./service');
const adapters = require('./sources');
const { dueAfterClose } = require('./scheduler');
const { parseCsv } = require('./http');

test('CSV adapter returns dated price rows', () => {
  assert.deepEqual(parseCsv('Date,Close\n2026-01-02,12.5\n'), [{ Date: '2026-01-02', Close: '12.5' }]);
});
test('store retains historical observations instead of replacing a source', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-test-')); const store = createStore(directory);
  await store.saveObservations('sec', [{ id: 'sec-1', source: 'sec', value: 1, observedAt: '2026-01-01T00:00:00Z' }]);
  await store.saveObservations('prices', [{ id: 'price-1', source: 'prices', value: 2, observedAt: '2026-01-01T00:00:00Z' }]);
  await store.saveObservations('sec', [{ id: 'sec-2', source: 'sec', value: 3, observedAt: '2026-02-01T00:00:00Z' }]);
  const rows = await store.observations();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(item => item.value).sort((a, b) => a - b), [1, 2, 3]);
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
});
test('service reports supported adapters without configuration', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-source-list-'));
  const service = createService({ dataDir: directory, cacheMinutes: 1 });
  assert.deepEqual(service.sources(), ['sec', 'eia', 'pjm', 'ferc', 'company-ir', 'prices', 'events']);
  service.store.close();
  await fs.rm(directory, { recursive: true, force: true });
});
test('zero-observation provider response is degraded and existing price history remains', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-empty-source-'));
  const original = adapters.prices;
  adapters.prices = async () => ({ payload: { provider: 'test' }, observations: [], message: '0 rows' });
  const service = createService({ dataDir: directory, cacheMinutes: 1 });
  try {
    await service.store.saveObservations('prices', [{ id: 'old-price', source: 'prices', type: 'close', ticker: 'NBIS', value: 100, observedAt: '2026-09-15T00:00:00Z' }]);
    const result = await service.ingest('prices', true);
    const rows = await service.observations({ source: 'prices' });
    assert.equal(result.status, 'degraded');
    assert.match(result.message, /zero usable observations/);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'old-price');
  } finally {
    adapters.prices = original;
    service.store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test('post-close scheduler checks other sources daily and prices on NYSE sessions', () => {
  assert.equal(dueAfterClose(new Date('2026-09-14T20:14:00Z')).due, false);
  assert.equal(dueAfterClose(new Date('2026-09-14T20:15:00Z')).due, true);
  assert.equal(dueAfterClose(new Date('2026-09-13T20:16:00Z')).due, true);
  assert.equal(dueAfterClose(new Date('2026-09-13T20:16:00Z')).marketSession, false);
  assert.equal(dueAfterClose(new Date('2026-07-03T20:16:00Z')).marketSession, false);
  assert.equal(dueAfterClose(new Date('2026-09-14T20:15:00Z')).marketSession, true);
});
test('event check records limited feed coverage and excluded candidates', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-event-coverage-'));
  const original = adapters.events;
  adapters.events = async () => ({
    payload: {}, observations: [{ source: 'events', type: 'infrastructureEvent', observedAt: '2026-09-17T00:00:00Z', value: { title: 'Official project record', url: 'https://example.com/record', category: 'PERMIT', publishedAt: '2026-09-17T00:00:00Z' } }],
    coverage: { scope: 'curated-candidates-only', feedStatus: 'unavailable', candidateCount: 2, acceptedCount: 1, excludedCount: 1, excluded: [{ title: 'Other record', reason: 'record title mismatch' }] },
    message: '1 verified infrastructure event record; PJM feed unavailable',
  });
  const service = createService({ dataDir: directory, cacheMinutes: 1 });
  try {
    const result = await service.ingest('events', true);
    const health = await service.health();
    assert.equal(result.status, 'partial');
    assert.equal(health.events.coverage.excludedCount, 1);
    assert.equal(health.events.coverage.feedStatus, 'unavailable');
  } finally {
    adapters.events = original;
    service.store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test('observation queries apply bounded pagination', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-page-test-')); const store = createStore(directory);
  await store.saveObservations('prices', [
    { id: 'p1', source: 'prices', value: 1, observedAt: '2026-01-01T00:00:00Z' },
    { id: 'p2', source: 'prices', value: 2, observedAt: '2026-01-02T00:00:00Z' },
    { id: 'p3', source: 'prices', value: 3, observedAt: '2026-01-03T00:00:00Z' },
  ]);
  const rows = await store.observations({ limit: 1, offset: 1 });
  assert.deepEqual(rows.map(item => item.value), [2]);
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test('event exclusions report partial health while retaining accepted records', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-event-exclusions-'));
  const original = adapters.events;
  const service = createService({ dataDir: directory, cacheMinutes: 1 });
  try {
    for (const acceptedCount of [1, 0]) {
      adapters.events = async () => ({
        payload: {}, observations: acceptedCount ? [{ source: 'events', type: 'infrastructureEvent', observedAt: '2026-10-02T00:00:00Z', value: { title: 'Verified record' } }] : [],
        coverage: { feedStatus: 'checked', candidateCount: acceptedCount + 1, acceptedCount, excludedCount: 1, excluded: [{ reason: 'record inaccessible: timeout' }] },
        message: `${acceptedCount} verified records; 1 rejected`,
      });
      assert.equal((await service.ingest('events', true)).status, 'partial');
      const health = (await service.health()).events;
      assert.equal(health.status, 'partial');
      assert.equal(health.recordCount, acceptedCount);
      assert.equal(health.coverage.excludedCount, 1);
      assert.ok(health.lastSuccessAt);
    }
    assert.equal((await service.observations({ source: 'events' })).length, 1);
    adapters.events = async () => ({ payload: {}, observations: [], coverage: { feedStatus: 'checked', candidateCount: 0, acceptedCount: 0, excludedCount: 0 }, message: 'No matching events' });
    assert.equal((await service.ingest('events', true)).status, 'ok');
  } finally {
    adapters.events = original;
    service.store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('failed subset retry keeps aggregate partial health and successful recovery counts the full universe', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-retry-health-'));
  const original = adapters.prices;
  const service = createService({ dataDir: directory, cacheMinutes: 60, tickers: ['NBIS', 'AVGO'] });
  const row = ticker => ({ source: 'prices', type: 'close', ticker, value: 100, observedAt: '2026-10-07T00:00:00Z', sourceUrl: 'https://example.com/prices' });
  try {
    adapters.prices = async () => ({ payload: [], observations: [row('NBIS')], tickerOutcomes: [{ ticker: 'NBIS', status: 'ok', recordCount: 1 }, { ticker: 'AVGO', status: 'degraded', recordCount: 0 }] });
    await service.ingest('prices', true);
    adapters.prices = async () => { throw new Error('retry timeout'); };
    assert.equal((await service.ingest('prices', true, { tickers: ['AVGO'] })).status, 'partial');
    let health = (await service.health()).prices;
    assert.equal(health.status, 'partial');
    assert.equal(health.recordCount, 1);
    assert.match(health.message, /1\/2/);
    assert.match(health.message, /retry timeout/);
    adapters.prices = async () => ({ payload: [], observations: [row('AVGO')], tickerOutcomes: [{ ticker: 'AVGO', status: 'ok', recordCount: 1 }], message: '1/1 successful' });
    const result = await service.ingest('prices', true, { tickers: ['AVGO'] });
    health = (await service.health()).prices;
    assert.equal(result.status, 'ok');
    assert.equal(health.recordCount, 2);
    assert.match(health.message, /2\/2/);
    assert.match(result.message, /2\/2/);
  } finally { adapters.prices = original; service.store.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('expanded universe bypasses old cache, partial failure retains dates, and recovery caches every ticker', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-expanded-'));
  const original = adapters.prices;
  const service = createService({ dataDir: directory, cacheMinutes: 60, tickers: ['NBIS', 'AVGO'] });
  const prior = new Date().toISOString();
  let calls = 0;
  try {
    await service.store.recordHealth('prices', { status: 'ok', lastSuccessAt: prior, cacheMinutes: 60, tickers: { NBIS: { status: 'ok', lastSuccessAt: prior } } });
    adapters.prices = async config => {
      calls += 1;
      return { payload: [], observations: config.tickers.filter(ticker => calls !== 1 || ticker === 'NBIS').map(ticker => ({ source: 'prices', type: 'close', ticker, value: 100, observedAt: '2026-10-07T00:00:00Z', sourceUrl: 'https://example.com/prices' })), tickerOutcomes: config.tickers.map(ticker => ({ ticker, status: calls === 1 && ticker === 'AVGO' ? 'degraded' : 'ok' })) };
    };
    assert.equal((await service.ingest('prices')).status, 'partial');
    let health = (await service.health()).prices;
    assert.equal(health.lastSuccessAt, prior);
    assert.equal(health.tickers.AVGO.lastSuccessAt, undefined);
    assert.equal((await service.ingest('prices', true, { tickers: ['AVGO'] })).status, 'ok');
    health = (await service.health()).prices;
    const lastSuccess = health.tickers.NBIS.lastSuccessAt;
    assert.ok(health.tickers.AVGO.lastSuccessAt);
    assert.equal((await service.ingest('prices')).status, 'cached');
    adapters.prices = async () => ({ payload: [], observations: [], tickerOutcomes: ['NBIS', 'AVGO'].map(ticker => ({ ticker, status: 'degraded' })), status: 'degraded' });
    assert.equal((await service.ingest('prices', true)).status, 'degraded');
    assert.equal((await service.health()).prices.tickers.NBIS.lastSuccessAt, lastSuccess);
    assert.equal((await service.observations({ source: 'prices' })).length, 2);
  } finally { adapters.prices = original; service.store.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('complete event discovery degradation preserves diagnostics and prior provider success', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gridline-event-denial-'));
  const original = adapters.events;
  const service = createService({ dataDir: directory, cacheMinutes: 1 });
  try {
    await service.store.recordHealth('events', { status: 'ok', lastSuccessAt: '2026-10-01T00:00:00Z', coverage: { sources: { ERCOT: { lastSuccessAt: '2026-10-01T00:00:00Z' } } } });
    adapters.events = async () => ({ status: 'degraded', payload: {}, observations: [], message: 'All providers unavailable', coverage: { sources: { ERCOT: { discoveryStatus: 'unavailable', verificationStatus: 'degraded', acceptedCount: 0 } } } });
    const result = await service.ingest('events', true);
    assert.equal(result.status, 'degraded');
    const health = (await service.health()).events;
    assert.equal(health.coverage.sources.ERCOT.lastSuccessAt, '2026-10-01T00:00:00Z');
    assert.equal(health.coverage.sources.ERCOT.discoveryStatus, 'unavailable');
    assert.equal(health.lastSuccessAt, '2026-10-01T00:00:00Z');
    assert.equal(health.recordCount, 0);
  } finally {
    adapters.events = original;
    service.store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
