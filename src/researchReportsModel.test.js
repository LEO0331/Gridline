import { buildWeeklyReview, recordedDuringWeek, reportMatchesTheme, reportPeriods } from './researchReportsModel';

function edition(session, suffix = 'original', fields = {}) {
  return {
    id: `${session}-${suffix}`, session, generatedAt: `${session}T22:00:00Z`, trackedTickers: ['NBIS'],
    market: [], developments: [], infrastructure: [], financials: [], questions: [], sourceHealth: {}, changes: null,
    ...fields,
  };
}

const archive = (...editions) => ({ schemaVersion: 1, trimmedEditions: 0, editions });

test('Thanksgiving week has four expected sessions, latest revisions count once, and a complete week is identifiable', () => {
  const friday = edition('2026-11-27');
  const revised = edition('2026-11-27', 'revised', { generatedAt: '2026-11-28T02:00:00Z' });
  const retained = archive(edition('2026-11-23'), edition('2026-11-24'), edition('2026-11-25'), friday, revised);
  expect(reportPeriods(retained).weeks).toEqual(['2026-11-23']);
  const result = buildWeeklyReview(retained, '2026-11-28', new Date('2026-11-29T20:00:00Z'));
  expect(result.sessions).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27']);
  expect(result.coveredSessions).toEqual(result.sessions);
  expect(result.complete).toBe(true);
  expect(result.daily[0].id).toBe(revised.id);
  expect(result.daily).toHaveLength(4);
});

test('partial elapsed coverage and pending sessions remain separate and two distinct days are required', () => {
  const oneDay = archive(edition('2026-11-23'), edition('2026-11-23', 'revision'));
  const insufficient = buildWeeklyReview(oneDay, '2026-11-23', new Date('2026-11-25T18:00:00Z'));
  expect(insufficient).toMatchObject({
    sufficient: false, complete: false, coveredSessions: ['2026-11-23'],
    elapsedMissing: ['2026-11-24'], pending: ['2026-11-25', '2026-11-27'],
  });
  const partial = buildWeeklyReview(archive(...oneDay.editions, edition('2026-11-25')), '2026-11-23', new Date('2026-11-30T13:00:00Z'));
  expect(partial).toMatchObject({ sufficient: true, complete: false, elapsedMissing: ['2026-11-24', '2026-11-27'], pending: [] });
});

test('a year boundary uses the NYSE holiday calendar and timestamps use New York across daylight saving', () => {
  const review = buildWeeklyReview(archive(edition('2026-12-31')), '2027-01-02', new Date('2027-01-03T16:00:00Z'));
  expect(review.start).toBe('2026-12-28');
  expect(review.end).toBe('2027-01-03');
  expect(review.sessions).not.toContain('2027-01-01');
  const summer = buildWeeklyReview(archive(), '2026-07-06', new Date('2026-07-12T20:00:00Z'));
  expect(recordedDuringWeek('2026-07-13T03:59:00Z', summer)).toBe(true);
  expect(recordedDuringWeek('2026-07-13T04:00:00Z', summer)).toBe(false);
  expect(recordedDuringWeek('2026-07-06T00:00:00.000Z', summer)).toBe(true);
  expect(recordedDuringWeek('2026-11-30T04:59:00Z', { start: '2026-11-23', end: '2026-11-29' })).toBe(true);
  expect(recordedDuringWeek('2026-11-30T05:00:00Z', { start: '2026-11-23', end: '2026-11-29' })).toBe(false);
});

test('weekly evidence deduplicates official developments and recorded transitions without inventing financial comparisons', () => {
  const company = { ticker: 'NBIS', title: 'Retained evidence', sourceUrl: 'https://nebius.com/fixture', publishedAt: '2026-11-10' };
  const updated = { ...company, title: 'Updated evidence text' };
  const sourceChange = { type: 'source-health', source: 'prices', before: 'ok', after: 'degraded', checkedAt: '2026-11-23T21:00:00Z' };
  const financials = [{ ticker: 'NBIS', type: 'capex', sourceUrl: 'https://www.sec.gov/fixture', value: 100, unit: 'USD' }];
  const first = edition('2026-11-23', 'first', { developments: [company], financials, changes: { available: true, changes: [sourceChange] } });
  const second = edition('2026-11-24', 'second', { developments: [updated], financials, changes: { available: true, changes: [sourceChange] } });
  const result = buildWeeklyReview(archive(first, second), '2026-11-23', new Date('2026-11-29T18:00:00Z'));
  expect(result.developments).toHaveLength(1);
  expect(result.developments[0]).toMatchObject({ ...updated, firstRetainedAt: first.generatedAt, editionAt: second.generatedAt });
  expect(recordedDuringWeek(result.developments[0].publishedAt, result)).toBe(false);
  expect(result.sourceChanges).toHaveLength(1);
  expect(result.financials).toHaveLength(1);
  expect(result.themes.find(theme => theme.id === 'hardware')).toMatchObject({ coveredTickers: [], developments: [], financials: [] });
  expect(result).not.toHaveProperty('returns');
  expect(result).not.toHaveProperty('financialComparison');
  expect(reportMatchesTheme({ ticker: 'ORCL' }, 'neocloud')).toBe(false);
  expect(reportMatchesTheme({ themeId: 'power' }, 'power')).toBe(true);
});
