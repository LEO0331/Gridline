import { buildDailyResearchBrief } from './dailyResearchBriefModel';

const now = '2026-10-20T22:00:00Z';
const opts = { now, ticker: 'NBIS', tickers: ['NBIS', 'AVGO'] };
const close = (ticker, day, value = 100) => ({
  id: `${ticker}-${day}`, source: 'prices', type: 'close', ticker, value,
  observedAt: `${day}T00:00:00Z`, retrievedAt: `${day}T21:00:00Z`,
  providerName: 'Fixture', sourceUrl: `https://example.com/${ticker}`,
});
const history = (ticker, rate) => Array.from({ length: 29 }, (_, i) => new Date(Date.UTC(2026, 8, 22 + i)))
  .filter(date => date.getUTCDay() > 0 && date.getUTCDay() < 6)
  .map((date, i) => close(ticker, date.toISOString().slice(0, 10), 100 + i * rate));
const snapshot = (observations = [], extra = {}) => ({ generatedAt: now, observations, ...extra });
const diff = changes => ({ available: true, from: '2026-10-19T22:00:00Z', to: now, changes });

test('reuses current basket, benchmark and relative-performance calculations', () => {
  const result = buildDailyResearchBrief(snapshot([
    ...history('NBIS', 2), ...history('SPY', 1), ...history('QQQ', -1),
  ]), opts);
  expect(result).toMatchObject({ expectedSession: '2026-10-20', latestObservedSession: '2026-10-20', missingMarket: ['AVGO'], staleMarket: [] });
  expect(result.market).toMatchObject({ above: 1, coverage: 1, total: 2 });
  expect(result.benchmarks.map(item => item.trend)).toEqual(['above', 'below']);
  expect(result.selectedMarket.comparisons.SPY[20]).toMatchObject({ end: '2026-10-20', provider: 'Fixture' });
});

test('retains the dated close when the expected session was not ingested', () => {
  const result = buildDailyResearchBrief(snapshot([close('NBIS', '2026-10-19')]), opts);
  expect(result).toMatchObject({ expectedSession: '2026-10-20', latestObservedSession: '2026-10-19', staleMarket: ['NBIS'], missingMarket: ['SPY', 'QQQ', 'AVGO'] });
  expect(result.market.participation).toBeNull();
});

test.each([
  ['on a weekend', '2026-10-17T22:00:00Z', '2026-10-16', '2026-10-16', '2026-10-17'],
  ['on a holiday', '2026-11-26T22:00:00Z', '2026-11-25', '2026-11-25', '2026-11-26'],
  ['before the close', '2026-10-20T19:45:00Z', '2026-10-19', '2026-10-19', '2026-10-20'],
  ['after a weekend', '2026-10-19T22:00:00Z', '2026-10-19', '2026-10-16', '2026-10-18'],
])('uses the calendar to find the latest eligible close %s', (_, clock, expected, observed, excluded) => {
  const observations = ['SPY', 'NBIS'].flatMap(ticker => [close(ticker, observed), { ...close(ticker, excluded), retrievedAt: clock }]);
  const result = buildDailyResearchBrief({ generatedAt: clock, observations }, { ...opts, now: clock });
  expect(result.expectedSession).toBe(expected);
  expect(result.latestObservedSession).toBe(observed);
  expect(result.benchmarks[0].latest.date).toBe(observed);
  expect(result.missingMarket).toEqual(['QQQ', 'AVGO']);
});

test('distinguishes a missing comparison from an available comparison with no material changes', () => {
  expect(buildDailyResearchBrief(snapshot(), opts).comparison).toBeNull();
  expect(buildDailyResearchBrief(snapshot([], { snapshotChanges: diff([]) }), opts).comparison)
    .toMatchObject({ from: diff([]).from, to: now, count: 0, price: null, signal: null, event: null, health: null });
});

test('prioritizes selected ticker changes, separates the observation update, and grounds questions in recorded changes', () => {
  const snapshotChanges = diff([
    { type: 'price', ticker: 'AVGO', before: 100, after: 110, observedAt: '2026-10-20' },
    { type: 'price', ticker: 'NBIS', before: 100, after: 100, observedAt: '2026-10-20' },
    { type: 'signal', ticker: 'NBIS', before: 'above', after: 'below', beforeAvailable: true, afterAvailable: true, observedAt: '2026-10-20', sourceUrl: 'https://example.com/NBIS' },
    { type: 'event-added', title: 'Dated grid record', category: 'GRID', publishedAt: '2026-10-15', sourceUrl: 'https://example.com/grid' },
    { type: 'source-health', source: 'events', before: 'ok', after: 'partial' },
  ]);
  const result = buildDailyResearchBrief(snapshot([], { snapshotChanges }), opts);
  expect(result.comparison.price).toMatchObject({ ticker: 'NBIS', valueUnchanged: true });
  expect(result.comparison.signal).toMatchObject({ ticker: 'NBIS', before: 'above', after: 'below' });
  expect(result.comparison.health).toMatchObject({ source: 'events', after: 'partial' });
  expect(result.event).toMatchObject({ type: 'event-added', url: 'https://example.com/grid', publishedAt: '2026-10-15' });
  expect(result.questions).toEqual([
    { type: 'trend', ticker: 'NBIS', date: '2026-10-20', url: 'https://example.com/NBIS' },
    { type: 'event', date: '2026-10-15', url: 'https://example.com/grid' },
    expect.objectContaining({ type: 'disclosure', ticker: 'NBIS' }),
  ]);
  expect(buildDailyResearchBrief(snapshot([], { snapshotChanges }), { ...opts, ticker: 'AVGO' }).comparison.price.valueUnchanged).toBe(false);
});

test('reports partial and degraded sources independently of a retained snapshot and current evidence', () => {
  const result = buildDailyResearchBrief(snapshot([close('NBIS', '2026-10-20')], {
    freshness: 'fresh', sourceHealth: { events: { status: 'partial' }, 'company-research': { status: 'degraded' }, prices: { status: 'ok' } },
  }), { ...opts, now: '2026-10-27T22:00:00Z' });
  expect(result.snapshotMeta).toMatchObject({ freshness: 'stale', retainedSnapshot: true, publicationFreshness: 'fresh' });
  expect(result.sourceGaps).toEqual(expect.arrayContaining([
    { source: 'events', status: 'partial' }, { source: 'company-research', status: 'degraded' },
  ]));
  expect(result.staleMarket).toContain('NBIS');
  expect(result.disclosure).toMatchObject({ archived: true, verificationStatus: 'retained-reviewed' });
});

test('uses a dated thematic fallback when selected data is missing and leaves questions empty without evidence', () => {
  const missingCompany = { ...opts, ticker: 'MISSING' };
  const noEvidence = buildDailyResearchBrief(snapshot([], {
    snapshotChanges: diff([{ type: 'signal', ticker: 'MISSING', beforeAvailable: false, afterAvailable: true, after: 'above', observedAt: '2026-10-20' }]),
  }), missingCompany);
  expect(noEvidence).toMatchObject({ selectedMarket: null, disclosure: null, selectedDisclosureAvailable: false, questions: [] });
  const fallback = buildDailyResearchBrief(snapshot(), { ...missingCompany, developmentTickers: ['NBIS'] });
  expect(fallback).toMatchObject({ selectedDisclosureAvailable: false, disclosure: { ticker: 'NBIS' } });
});
