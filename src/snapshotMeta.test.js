import { loadDashboardSnapshot, summarizeSnapshot } from './snapshotMeta';

test('snapshot summary uses generatedAt and real provider health', () => {
  const result = summarizeSnapshot({
    generatedAt: '2026-09-17T22:05:00.000Z', freshness: 'partial',
    sourceHealth: { prices: { status: 'ok' }, eia: { status: 'ok' }, sec: { status: 'degraded' } },
    observations: [{ source: 'prices', type: 'close', observedAt: '2026-09-17T00:00:00.000Z' }],
  }, 'en', 'UTC');
  expect(result.generatedLabel).toContain('SEP 17, 2026');
  expect(result.generatedLabel).toContain('UTC');
  expect(result.healthySources).toBe(2);
  expect(result.totalSources).toBe(3);
  expect(result.latestMarketDate).toBe('2026-09-17T00:00:00.000Z');
});

test('snapshot summary excludes inactive research connectors from source totals', () => {
  const result = summarizeSnapshot({
    generatedAt: '2026-09-17T22:05:00.000Z',
    sourceHealth: { prices: { status: 'ok' }, eia: { status: 'ok' }, pjm: { status: 'degraded' }, ferc: { status: 'degraded' }, 'company-ir': { status: 'degraded' } },
  });
  expect(result.healthySources).toBe(2);
  expect(result.totalSources).toBe(2);
});

test('manual event review keeps the market snapshot date and records its own check time', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ generatedAt: '2026-09-22T23:56:00Z', observations: [], sourceHealth: {} }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ checkedAt: '2026-09-23T07:45:00Z', sourceHealth: { events: { status: 'partial', checkedAt: '2026-09-23T07:45:00Z' } }, observations: [{ id: 'event-1', source: 'events', type: 'infrastructureEvent' }] }) });
  try {
    const result = await loadDashboardSnapshot();
    expect(global.fetch.mock.calls[0][0]).toContain('/data/dashboard-overview.json');
    expect(result.generatedAt).toBe('2026-09-22T23:56:00Z');
    expect(result.sourceHealth.events.checkedAt).toBe('2026-09-23T07:45:00Z');
    expect(result.observations).toHaveLength(1);
  } finally { global.fetch = originalFetch; }
});

test('dashboard loader falls back to the full snapshot when the compact runtime file is unavailable', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ generatedAt: '2026-09-24T00:04:00Z', observations: [{ id: 'fallback' }], sourceHealth: {} }) })
    .mockResolvedValueOnce({ ok: false });
  try {
    const result = await loadDashboardSnapshot();
    expect(global.fetch.mock.calls[0][0]).toContain('/data/dashboard-overview.json');
    expect(global.fetch.mock.calls[1][0]).toContain('/data/dashboard-snapshot.json');
    expect(result.observations.map(item => item.id)).toEqual(['fallback']);
  } finally { global.fetch = originalFetch; }
});

test('a newer automated event check supersedes older manual-review records', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ generatedAt: '2026-09-24T00:04:00Z', sourceHealth: { events: { status: 'ok', checkedAt: '2026-09-24T00:04:00Z', recordCount: 1 } }, observations: [{ id: 'automated', source: 'events', type: 'infrastructureEvent' }] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ checkedAt: '2026-09-23T08:25:00Z', sourceHealth: { events: { status: 'partial', checkedAt: '2026-09-23T08:25:00Z' } }, observations: [{ id: 'manual-rejected', source: 'events', type: 'infrastructureEvent' }] }) });
  try {
    const result = await loadDashboardSnapshot();
    expect(result.sourceHealth.events.status).toBe('ok');
    expect(result.observations.map(item => item.id)).toEqual(['automated']);
  } finally { global.fetch = originalFetch; }
});

test('old last-known-good snapshot is not still shown as live after failed refreshes', () => {
  const summary = summarizeSnapshot({
    generatedAt: '2026-10-01T12:00:00Z',
    freshness: 'fresh',
    observations: [{ source: 'prices', type: 'close', observedAt: '2026-09-30T00:00:00Z' }],
  }, 'en', 'UTC', new Date('2026-10-07T12:00:00Z'));
  expect(summary.retainedSnapshot).toBe(true);
  expect(summary.freshness).toBe('stale');
  expect(summary.latestMarketDate).toBe('2026-09-30T00:00:00Z');
});
