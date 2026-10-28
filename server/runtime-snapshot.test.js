const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRICE_ROWS_PER_TICKER,
  RUNTIME_PROFILE,
  buildRuntimeSnapshot,
} = require('./runtime-snapshot');

const hour = (day, hourValue) => `2026-09-${String(day).padStart(2, '0')}T${String(hourValue).padStart(2, '0')}:00:00.000Z`;

function price(ticker, index) {
  const day = new Date(Date.UTC(2026, 0, 1 + index));
  return {
    id: `${ticker}-${index}`,
    source: 'prices',
    type: 'close',
    value: 100 + index,
    observedAt: day.toISOString(),
    retrievedAt: '2026-09-24T00:00:00.000Z',
    ticker,
    providerName: 'Fixture',
    sourceUrl: `https://example.com/${ticker}`,
    observationId: `duplicate-${index}`,
    provenance: {
      provider: 'Fixture',
      originUrl: `https://example.com/${ticker}`,
      lineage: ['large-duplicate-field'],
    },
  };
}

function eia(day, hourValue) {
  return {
    source: 'eia',
    type: 'rtoDemandActual',
    value: 1000 + hourValue,
    observedAt: hour(day, hourValue),
    retrievedAt: '2026-09-24T00:00:00.000Z',
    region: 'PJM',
    dataType: 'D',
    unit: 'megawatthours',
    sourceUrl: 'https://api.eia.gov/example',
    provenance: { originUrl: 'https://api.eia.gov/example', lineage: ['duplicate'] },
  };
}

test('runtime snapshot keeps enough price history for 90-session charts plus indicator warmup', () => {
  const observations = [
    ...Array.from({ length: 150 }, (_, index) => price('NBIS', index)),
    ...Array.from({ length: 150 }, (_, index) => price('ORCL', index)),
  ];
  const runtime = buildRuntimeSnapshot({
    schemaVersion: 4,
    generatedAt: '2026-09-24T00:00:00.000Z',
    sourceHealth: {},
    observations,
  });

  assert.equal(runtime.runtimeProfile, RUNTIME_PROFILE);
  const nbis = runtime.observations.filter(row => row.source === 'prices' && row.ticker === 'NBIS');
  assert.equal(nbis.length, PRICE_ROWS_PER_TICKER);
  assert.equal(nbis[0].id, 'NBIS-30');
  assert.equal(nbis.at(-1).id, 'NBIS-149');
  assert.equal(nbis[0].provenance, undefined);
  assert.equal(nbis[0].observationId, undefined);
  assert.equal(nbis[0].providerName, 'Fixture');
  assert.equal(nbis[0].sourceUrl, 'https://example.com/NBIS');
});

test('runtime snapshot keeps only the latest complete PJM day and comparable day one week earlier', () => {
  const observations = [];
  for (const day of [10, 11, 16, 17, 23]) {
    for (let h = 0; h < 24; h += 1) observations.push(eia(day, h));
  }
  const runtime = buildRuntimeSnapshot({
    generatedAt: '2026-09-24T00:00:00.000Z',
    observations,
  });

  const eiaRows = runtime.observations.filter(row => row.source === 'eia');
  assert.equal(eiaRows.length, 48);
  assert.deepEqual([...new Set(eiaRows.map(row => row.observedAt.slice(0, 10)))], [
    '2026-09-16',
    '2026-09-23',
  ]);
  assert.equal(eiaRows[0].provenance, undefined);
  assert.equal(eiaRows[0].sourceUrl, 'https://api.eia.gov/example');
});

test('runtime snapshot retains customer-facing SEC and event fields but omits full-snapshot-only payloads', () => {
  const runtime = buildRuntimeSnapshot({
    schemaVersion: 4,
    generatedAt: '2026-09-24T00:00:00.000Z',
    freshness: 'fresh',
    sourceHealth: { prices: { status: 'ok' } },
    outcomes: [{ large: 'full-only' }],
    scores: [{ large: 'full-only' }],
    companyHistory: [{ large: 'full-only' }],
    backtestCoverage: { recorded: 2, reconstructed: 0 },
    methodologies: { companyScore: 'gridline-price-signal-v2.0.0' },
    snapshotChanges: { available: true, changes: [] },
    demoReadiness: { status: 'ready' },
    observations: [
      {
        id: 'sec-1', source: 'sec', type: 'revenue', value: 123, observedAt: '2026-09-01T00:00:00Z',
        ticker: 'NBIS', unit: 'USD', periodStart: '2026-04-01', periodEnd: '2026-06-30',
        filedAt: '2026-08-01', form: '10-Q', sourceUrl: 'https://www.sec.gov/example',
        provenance: { lineage: ['duplicate'] },
      },
      {
        id: 'event-1', source: 'events', type: 'infrastructureEvent', retrievedAt: '2026-09-24T00:00:00Z',
        value: { title: 'Verified record', category: 'GRID', publishedAt: '2026-09-23T00:00:00Z', url: 'https://example.com/event' },
        provenance: { lineage: ['duplicate'] },
      },
    ],
  });

  assert.equal(runtime.outcomes, undefined);
  assert.equal(runtime.scores, undefined);
  assert.equal(runtime.companyHistory, undefined);
  assert.deepEqual(runtime.backtestCoverage, { recorded: 2, reconstructed: 0 });
  assert.deepEqual(runtime.methodologies, { companyScore: 'gridline-price-signal-v2.0.0' });
  assert.equal(runtime.snapshotChanges.available, true);
  assert.equal(runtime.demoReadiness.status, 'ready');

  const sec = runtime.observations.find(row => row.source === 'sec');
  assert.equal(sec.periodEnd, '2026-06-30');
  assert.equal(sec.provenance, undefined);

  const event = runtime.observations.find(row => row.source === 'events');
  assert.equal(event.value.title, 'Verified record');
  assert.equal(event.provenance, undefined);
});

 test('compact prices preserve benchmark provenance and retrieval time', () => {
  const snapshot = buildRuntimeSnapshot({ trackedTickers: ['NBIS'], benchmarkTickers: ['SPY', 'QQQ'], observations: [{ id: 'spy-1', source: 'prices', type: 'close', ticker: 'SPY', value: 500, observedAt: '2026-10-01T00:00:00Z', retrievedAt: '2026-10-02T00:00:00Z', providerName: 'Stooq', sourceUrl: 'https://example.com/SPY' }] });
  assert.deepEqual(snapshot.trackedTickers, ['NBIS']);
  assert.deepEqual(snapshot.benchmarkTickers, ['SPY', 'QQQ']);
  assert.equal(snapshot.observations[0].retrievedAt, '2026-10-02T00:00:00Z');
  assert.equal(snapshot.observations[0].providerName, 'Stooq');
 });
