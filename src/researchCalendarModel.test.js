import {
  addCalendarDays, calendarCoverage, calendarDate, calendarPeriod, calendarWeekday, catalystStatus,
  filterCatalysts, projectCatalysts, shiftCalendarPeriod, upcomingCatalysts, validateCatalysts,
} from './researchCalendarModel';
import registry from './data/researchCatalysts.json';

const now = '2026-11-10T17:00:00Z';
const event = (overrides = {}) => ({
  id: 'bls-fixture',
  category: 'macro',
  title: 'Test release',
  titleZh: '測試發布',
  precision: 'date',
  start: '2026-11-12',
  timeZone: 'America/New_York',
  sourceUrl: 'https://www.bls.gov/schedule/test-fixture',
  publisher: 'Bureau of Labor Statistics',
  reviewedAt: '2026-11-10',
  status: 'scheduled',
  ...overrides,
});

const earnings = event({
  id: 'nbis-fixture',
  category: 'earnings',
  precision: 'timestamp',
  start: '2026-11-12T08:00:00-05:00',
  sourceUrl: 'https://nebius.com/test-fixture',
  publisher: 'Nebius',
  tickers: ['NBIS'],
  themeIds: ['neocloud'],
});

test('the checked-in calendar contains admissible records with unique IDs', () => {
  expect(registry.length).toBeGreaterThan(0);
  expect(validateCatalysts(registry)).toEqual({ events: registry, rejected: [] });
});

test('accepts date-only, exact timestamps, multi-day and explicit status records', () => {
  const records = [
    event(),
    earnings,
    event({ id: 'date-range', end: '2026-11-13', status: 'tentative' }),
    event({ id: 'timed-range', precision: 'timestamp', start: '2026-11-12T21:00:00-05:00', end: '2026-11-13T07:00:00-05:00' }),
    event({ id: 'revised', status: 'rescheduled', previousStart: '2026-11-11' }),
    event({ id: 'canceled', status: 'canceled', sourceUnavailable: true }),
  ];
  expect(validateCatalysts(records)).toEqual({ events: records, rejected: [] });
});

test.each([
  ['source protocol', { sourceUrl: 'http://www.bls.gov/schedule' }, 'invalid-source'],
  ['lookalike source host', { sourceUrl: 'https://www.bls.gov.example.com/schedule' }, 'invalid-source'],
  ['unapproved source host', { sourceUrl: 'https://example.com/bls' }, 'invalid-source'],
  ['URL credentials', { sourceUrl: 'https://fake@www.bls.gov/schedule' }, 'invalid-source'],
  ['source category', { sourceUrl: 'https://nebius.com/calendar' }, 'invalid-source'],
  ['timezone', { timeZone: 'America/Not_A_Zone' }, 'invalid-time-zone'],
  ['category', { category: 'market' }, 'invalid-category'],
  ['ticker', { tickers: ['FAKE'] }, 'invalid-ticker'],
  ['theme', { themeIds: ['unknown'] }, 'invalid-theme'],
  ['review date', { reviewedAt: '2026-02-29' }, 'missing-provenance'],
  ['publisher', { publisher: ' ' }, 'missing-provenance'],
  ['malformed date', { start: '2026-11-31' }, 'invalid-date'],
  ['quarter target', { start: '2026-Q4' }, 'invalid-date'],
  ['timestamp without offset', { precision: 'timestamp', start: '2026-11-12T08:30:00' }, 'invalid-date'],
  ['timestamp with unknown offset', { precision: 'timestamp', start: '2026-11-12T08:30:00-00:00' }, 'invalid-date'],
  ['range with mismatched precision', { end: '2026-11-13T08:00:00Z' }, 'invalid-date'],
  ['reversed range', { end: '2026-11-11' }, 'invalid-range'],
  ['same rescheduled start', { status: 'rescheduled', previousStart: '2026-11-12' }, 'invalid-previous-start'],
  ['completed without separate evidence', { status: 'completed' }, 'missing-outcome'],
])('rejects an invalid %s', (_, overrides, reason) => {
  expect(validateCatalysts([event(overrides)])).toEqual({
    events: [], rejected: [{ id: 'bls-fixture', reason }],
  });
});

test('rejects all instances of a duplicate stable identity', () => {
  const result = validateCatalysts([event(), event({ start: '2026-11-15', status: 'rescheduled' }), earnings]);
  expect(result.events).toEqual([earnings]);
  expect(result.rejected).toEqual(Array(2).fill({ id: 'bls-fixture', reason: 'duplicate-id' }));
});

test('uses Monday weeks across year boundaries and keeps the weekday on navigation', () => {
  const range = calendarPeriod('2027-01-01', 'week');
  expect(range).toMatchObject({ start: '2026-12-28', end: '2027-01-03' });
  expect(range.days).toHaveLength(7);
  expect(calendarWeekday(range.start)).toBe(1);
  expect(calendarPeriod('2027-01-01', 'agenda')).toEqual(range);
  expect(shiftCalendarPeriod('2026-12-30', 'week', 1)).toBe('2027-01-06');
  expect(shiftCalendarPeriod('2027-01-06', 'agenda', -1)).toBe('2026-12-30');
});

test('positions months and clamps the selected day across months and leap years', () => {
  const leap = calendarPeriod('2028-02-19', 'month');
  expect(leap).toMatchObject({ start: '2028-02-01', end: '2028-02-29' });
  expect(leap.days).toHaveLength(29);
  expect(calendarWeekday(leap.start)).toBe(2);
  expect(shiftCalendarPeriod('2028-01-31', 'month', 1)).toBe('2028-02-29');
  expect(shiftCalendarPeriod('2027-03-31', 'month', -1)).toBe('2027-02-28');
  expect(shiftCalendarPeriod('2026-12-31', 'month', 1)).toBe('2027-01-31');
});

test('projects Eastern timestamps through DST and Taipei midnight without moving date-only ranges', () => {
  const records = [
    event({ id: 'winter-time', precision: 'timestamp', start: '2026-03-07T11:30:00-05:00' }),
    event({ id: 'summer-time', precision: 'timestamp', start: '2026-03-09T11:30:00-04:00' }),
    event({ id: 'date-only', start: '2026-03-07', end: '2026-03-09' }),
  ];
  const byId = (timeZone) => Object.fromEntries(projectCatalysts(records, timeZone).map(item => [item.id, [item.startDate, item.endDate]]));
  expect(byId('America/New_York')).toEqual({
    'winter-time': ['2026-03-07', '2026-03-07'], 'summer-time': ['2026-03-09', '2026-03-09'],
    'date-only': ['2026-03-07', '2026-03-09'],
  });
  expect(byId('Asia/Taipei')).toEqual({
    'winter-time': ['2026-03-08', '2026-03-08'], 'summer-time': ['2026-03-09', '2026-03-09'],
    'date-only': ['2026-03-07', '2026-03-09'],
  });
  expect(calendarDate('2026-11-10T03:00:00Z')).toBe('2026-11-09');
  expect(addCalendarDays('2026-11-01', 1)).toBe('2026-11-02');
});

test('sorts date-only and timed events predictably, with stable simultaneous ordering', () => {
  const records = [
    event({ id: 'same-b', precision: 'timestamp', start: '2026-11-12T13:00:00Z' }),
    event({ id: 'same-a', precision: 'timestamp', start: '2026-11-12T08:00:00-05:00' }),
    event({ id: 'earlier-time', precision: 'timestamp', start: '2026-11-12T12:30:00Z' }),
    event({ id: 'date-only' }),
  ];
  expect(projectCatalysts(records).map(item => item.id)).toEqual(['date-only', 'earlier-time', 'same-a', 'same-b']);
});

test('combines category, ticker, theme and overlap without duplicating ranges', () => {
  const records = projectCatalysts([
    event({ start: '2026-11-11', end: '2026-11-15' }),
    earnings,
    event({ id: 'pjm-fixture', category: 'infrastructure', sourceUrl: 'https://www.pjm.com/test-fixture', themeIds: ['power'] }),
  ]);
  expect(filterCatalysts(records)).toEqual(records);
  expect(filterCatalysts(records, { start: '2026-11-14', end: '2026-11-15' }).map(item => item.id)).toEqual(['bls-fixture']);
  expect(filterCatalysts(records, { ticker: 'NBIS' }).map(item => item.id)).toEqual(['nbis-fixture']);
  expect(filterCatalysts(records, { theme: 'power' }).map(item => item.id)).toEqual(['pjm-fixture']);
  expect(filterCatalysts(records, { category: 'macro' }).map(item => item.id)).toEqual(['bls-fixture']);
  expect(filterCatalysts(records, { category: 'earnings', ticker: 'NBIS', theme: 'neocloud' })).toHaveLength(1);
  expect(filterCatalysts(records, { category: 'macro', ticker: 'NBIS' })).toEqual([]);
});

test('uses seven civil days including today and excludes elapsed, canceled and unavailable events', () => {
  const records = projectCatalysts([
    event({ id: 'past', start: '2026-11-09' }),
    event({ id: 'past-today', precision: 'timestamp', start: '2026-11-10T09:00:00-05:00' }),
    event({ id: 'today', start: '2026-11-10' }),
    event({ id: 'ongoing', start: '2026-11-09', end: '2026-11-11' }),
    event({ id: 'unavailable', sourceUnavailable: true }),
    event({ id: 'canceled', status: 'canceled' }),
    event({ id: 'seventh', start: '2026-11-16', status: 'tentative' }),
    event({ id: 'eighth', start: '2026-11-17' }),
  ]);
  expect(upcomingCatalysts(records, { now }).map(item => item.id)).toEqual(['ongoing', 'today', 'seventh']);
  expect(upcomingCatalysts(records, { now: '2026-12-01T12:00:00Z' })).toEqual([]);
  const projected = projectCatalysts([event({ id: 'taipei-today', precision: 'timestamp', start: '2026-11-10T03:00:00Z' })], 'Asia/Taipei');
  expect(upcomingCatalysts(projected, { now: '2026-11-10T02:59:00Z', timeZone: 'Asia/Taipei' }).map(item => item.id)).toEqual(['taipei-today']);
});

test('separates explicit completion evidence from passage of time and source-local dates', () => {
  const release = event({ start: '2026-11-09' });
  const completed = {
    ...release, status: 'completed',
    outcomeUrl: 'https://www.bls.gov/test-fixture/results', outcomeReviewedAt: '2026-11-10',
  };
  expect(validateCatalysts([completed]).events).toEqual([completed]);
  expect(catalystStatus(completed, { now: '2026-11-08T12:00:00Z' })).toBe('scheduled');
  expect(catalystStatus({ ...completed, outcomeReviewedAt: '2026-11-09' }, { now: '2026-11-09T23:00:00Z' })).toBe('completed');
  expect(catalystStatus(release, { now: '2026-11-10T03:00:00Z' })).toBe('scheduled');
  expect(catalystStatus(release, { now })).toBe('past-unverified');
  expect(catalystStatus(completed, { now })).toBe('completed');
  expect(catalystStatus({ ...release, status: 'canceled' }, { now })).toBe('canceled');
});

test('exposes the original manual review and flags reviews older than thirty calendar days', () => {
  const records = [event({ reviewedAt: '2026-10-01' }), earnings];
  expect(calendarCoverage(records, { now })).toEqual({ latestReview: '2026-11-10', stale: false });
  expect(calendarCoverage(records, { now: '2026-12-10T18:00:00Z' })).toEqual({ latestReview: '2026-11-10', stale: false });
  expect(calendarCoverage(records, { now: '2026-12-11T18:00:00Z' })).toEqual({ latestReview: '2026-11-10', stale: true });
  expect(calendarCoverage([], { now })).toEqual({ latestReview: null, stale: false });
});
