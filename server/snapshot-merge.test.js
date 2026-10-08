const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeSnapshotObservations, mergeSnapshotHealth } = require('./snapshot-merge');

const observation = (id, source, date, value) => ({ id, source, type: 'close', ticker: source === 'prices' ? 'NBIS' : undefined, observedAt: `${date}T00:00:00.000Z`, value });

test('partial ticker refresh replaces healthy ticker while retaining failed ticker', () => {
  const old = [observation('old-n', 'prices', '2026-09-14', 100), { ...observation('old-a', 'prices', '2026-09-14', 90), ticker: 'AVGO' }];
  const fresh = [observation('new-n', 'prices', '2026-09-15', 101)];
  const merged = mergeSnapshotObservations(old, fresh, [{ source: 'prices', status: 'partial', tickerOutcomes: [{ ticker: 'NBIS', status: 'ok' }, { ticker: 'AVGO', status: 'degraded' }] }]);
  assert.deepEqual(merged.map(row => row.id).sort(), ['new-n', 'old-a']);
});

test('partial ticker health preserves failed ticker success date', () => {
  const prior = '2026-09-14T22:00:00Z';
  const health = mergeSnapshotHealth({ prices: { lastSuccessAt: prior, tickers: { AVGO: { status: 'ok', lastSuccessAt: prior } } } }, { prices: { status: 'partial', tickers: { AVGO: { status: 'degraded', message: 'timeout' }, NBIS: { status: 'ok', lastSuccessAt: '2026-09-15T22:00:00Z' } } } });
  assert.equal(health.prices.tickers.AVGO.lastSuccessAt, prior);
  assert.equal(health.prices.lastSuccessAt, prior);
});

test('degraded price refresh retains last-known-good static price history', () => {
  const previous = [
    observation('price-old', 'prices', '2026-09-14', 100),
    { id: 'eia-old', source: 'eia', type: 'rtoLoad', observedAt: '2026-09-14T00:00:00.000Z', value: 50 },
  ];
  const fresh = [{ id: 'eia-new', source: 'eia', type: 'rtoLoad', observedAt: '2026-09-15T00:00:00.000Z', value: 55 }];
  const outcomes = [
    { source: 'prices', status: 'degraded', message: 'zero rows' },
    { source: 'eia', status: 'ok', recordCount: 1 },
  ];
  const merged = mergeSnapshotObservations(previous, fresh, outcomes);
  assert.equal(merged.some(item => item.id === 'price-old'), true);
  assert.equal(merged.some(item => item.id === 'eia-old'), false);
  assert.equal(merged.some(item => item.id === 'eia-new'), true);
});

test('successful price refresh replaces old static price source records', () => {
  const previous = [observation('price-old', 'prices', '2026-09-14', 100)];
  const fresh = [observation('price-new', 'prices', '2026-09-15', 101)];
  const merged = mergeSnapshotObservations(previous, fresh, [{ source: 'prices', status: 'ok', recordCount: 1 }]);
  assert.deepEqual(merged.map(item => item.id), ['price-new']);
});

test('merge deduplicates retained and persistent observations by stable identity', () => {
  const row = observation('same', 'prices', '2026-09-14', 100);
  const merged = mergeSnapshotObservations([row], [row], [{ source: 'prices', status: 'degraded' }]);
  assert.equal(merged.length, 1);
});

test('successful event refresh preserves older event versions for the archive', () => {
  const previous = [{ id: 'event-old', source: 'events', type: 'infrastructureEvent', observedAt: '2026-07-01T00:00:00Z', value: { title: 'Earlier record' } }];
  const fresh = [{ id: 'event-new', source: 'events', type: 'infrastructureEvent', observedAt: '2026-09-20T00:00:00Z', value: { title: 'New record' } }];
  const merged = mergeSnapshotObservations(previous, fresh, [{ source: 'events', status: 'ok', recordCount: 1 }]);
  assert.deepEqual(merged.map(item => item.id), ['event-old', 'event-new']);
});

test('degraded health retains prior last-success timestamp and reports retained row count', () => {
  const observations = [
    observation('p1', 'prices', '2026-09-14', 100),
    observation('p2', 'prices', '2026-09-15', 101),
  ];
  const health = mergeSnapshotHealth(
    { prices: { status: 'ok', lastSuccessAt: '2026-09-15T22:00:00.000Z', recordCount: 2 } },
    { prices: { status: 'degraded', checkedAt: '2026-09-16T22:00:00.000Z', message: 'upstream unavailable' } },
    observations,
  );
  assert.equal(health.prices.status, 'degraded');
  assert.equal(health.prices.lastSuccessAt, '2026-09-15T22:00:00.000Z');
  assert.equal(health.prices.retainedRecordCount, 2);
  assert.equal(health.prices.message, 'upstream unavailable');
});

test('healthy refresh uses current health metadata without retained marker', () => {
  const health = mergeSnapshotHealth(
    { eia: { status: 'degraded', lastSuccessAt: '2026-09-14T22:00:00.000Z', retainedRecordCount: 24, qualityReviewedAt: '2026-09-15T00:00:00Z' } },
    { eia: { status: 'ok', lastSuccessAt: '2026-09-16T22:00:00.000Z', recordCount: 24 } },
    [],
  );
  assert.equal(health.eia.status, 'ok');
  assert.equal(health.eia.lastSuccessAt, '2026-09-16T22:00:00.000Z');
  assert.equal(health.eia.retainedRecordCount, undefined);
  assert.equal(health.eia.qualityReviewedAt, undefined);
});

test('failed event refresh does not present a previous candidate check as the current coverage', () => {
  const health = mergeSnapshotHealth(
    { events: { status: 'ok', coverage: { acceptedCount: 3, excludedCount: 1 }, lastSuccessAt: '2026-09-28T22:00:00Z' } },
    { events: { status: 'degraded', checkedAt: '2026-09-29T22:00:00Z', message: 'feed unavailable' } },
    [],
  );
  assert.equal(health.events.coverage, null);
  assert.equal(health.events.lastSuccessAt, '2026-09-28T22:00:00Z');
});

test('partial event refresh publishes accepted records and current coverage while preserving the archive', () => {
  const previous = [{ id: 'event-old', source: 'events', observedAt: '2026-09-17T00:00:00Z' }];
  const fresh = [{ id: 'event-new', source: 'events', observedAt: '2026-10-02T00:00:00Z' }];
  const observations = mergeSnapshotObservations(previous, fresh, [{ source: 'events', status: 'partial', recordCount: 1 }]);
  const health = mergeSnapshotHealth(
    { events: { status: 'ok', recordCount: 6, lastSuccessAt: '2026-10-01T22:17:00Z' } },
    { events: { status: 'partial', recordCount: 1, lastSuccessAt: '2026-10-02T22:17:00Z', coverage: { feedStatus: 'checked', acceptedCount: 1, excludedCount: 2 } } },
    observations,
  );
  assert.deepEqual(observations.map(row => row.id), ['event-old', 'event-new']);
  assert.equal(health.events.status, 'partial');
  assert.equal(health.events.recordCount, 1);
  assert.equal(health.events.coverage.excludedCount, 2);
  assert.equal(health.events.lastSuccessAt, '2026-10-02T22:17:00Z');
});

test('provider failure keeps its last successful check without copying old coverage counts', () => {
  const health = mergeSnapshotHealth(
    { events: { coverage: { sources: { ERCOT: { lastSuccessAt: '2026-10-01T00:00:00Z', acceptedCount: 3 } } } } },
    { events: { status: 'partial', coverage: { sources: { ERCOT: { discoveryStatus: 'unavailable', verificationStatus: 'degraded', acceptedCount: 0 } } } } },
  );
  assert.equal(health.events.coverage.sources.ERCOT.lastSuccessAt, '2026-10-01T00:00:00Z');
  assert.equal(health.events.coverage.sources.ERCOT.acceptedCount, 0);
});
