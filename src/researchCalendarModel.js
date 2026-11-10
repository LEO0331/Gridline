import { companies } from './companyRegistry';
import { RESEARCH_THEMES } from './researchThemes';

export const CALENDAR_CATEGORIES = ['earnings', 'macro', 'infrastructure', 'company'];
export const DEFAULT_CALENDAR_TIME_ZONE = 'America/New_York';
export const CALENDAR_TIME_ZONES = [DEFAULT_CALENDAR_TIME_ZONE, 'Asia/Taipei'];
export const CALENDAR_REVIEW_DAYS = 30;

const DAY_MS = 86_400_000;
const SCHEDULE_STATUSES = ['scheduled', 'tentative', 'rescheduled', 'canceled', 'completed'];
const trackedTickers = new Set(companies.map(company => company.ticker));
const themeIds = new Set(RESEARCH_THEMES.map(theme => theme.id));
const sourceHosts = {
  'federalreserve.gov': ['macro'],
  'bls.gov': ['macro'],
  'bea.gov': ['macro'],
  'nebius.com': ['earnings', 'company'],
  'investors.broadcom.com': ['earnings', 'company'],
  'investors.coreweave.com': ['earnings', 'company'],
  'pjm.com': ['infrastructure'],
};

const dateValue = date => Date.parse(`${date}T00:00:00Z`);
const isoDate = date => date.toISOString().slice(0, 10);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const stamp = dateValue(value);
  return Number.isFinite(stamp) && isoDate(new Date(stamp)) === value;
}

function validTimestamp(value) {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.exec(value);
  return Boolean(match && validDate(match[1]) && !value.endsWith('-00:00') && Number.isFinite(Date.parse(value)));
}

const dateFormatters = new Map();

function dateFormatter(timeZone) {
  if (!dateFormatters.has(timeZone)) {
    dateFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }));
  }
  return dateFormatters.get(timeZone);
}

function validTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(timeZone)) return false;
  try {
    return Boolean(dateFormatter(timeZone));
  } catch {
    return false;
  }
}

function officialSource(value, category) {
  if (typeof value !== 'string' || !value.startsWith('https://') || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    const categories = sourceHosts[url.hostname.replace(/^www\./, '')];
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && Boolean(categories?.includes(category));
  } catch {
    return false;
  }
}

const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const supportedList = (value, supported) => value === undefined || (
  Array.isArray(value) && value.every(item => supported.has(item)) && new Set(value).size === value.length
);

function eventIssue(event) {
  if (!event || typeof event.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)) return 'invalid-id';
  if (!CALENDAR_CATEGORIES.includes(event.category)) return 'invalid-category';
  if (![event.title, event.titleZh].every(nonempty)) return 'missing-title';
  if (!SCHEDULE_STATUSES.includes(event.status)) return 'invalid-status';
  if (!validTimeZone(event.timeZone)) return 'invalid-time-zone';
  if (!officialSource(event.sourceUrl, event.category)) return 'invalid-source';
  if (!nonempty(event.publisher) || !validDate(event.reviewedAt)) return 'missing-provenance';
  if (event.sourceUnavailable !== undefined && typeof event.sourceUnavailable !== 'boolean') return 'invalid-source-status';
  if ([event.note, event.noteZh, event.region].some(value => value !== undefined && !nonempty(value))) return 'invalid-description';
  if (!supportedList(event.tickers, trackedTickers) || (event.category === 'earnings' && !event.tickers?.length)) return 'invalid-ticker';
  if (!supportedList(event.themeIds, themeIds)) return 'invalid-theme';

  if (!['date', 'timestamp'].includes(event.precision)) return 'invalid-precision';
  const valid = event.precision === 'date' ? validDate : validTimestamp;
  if (!valid(event.start) || (event.end !== undefined && !valid(event.end))) return 'invalid-date';
  if (event.end && Date.parse(event.end) < Date.parse(event.start)) return 'invalid-range';
  if (event.previousStart !== undefined && (event.status !== 'rescheduled' || !valid(event.previousStart) ||
    Date.parse(event.previousStart) === Date.parse(event.start))) return 'invalid-previous-start';
  if (event.status === 'completed' && (!officialSource(event.outcomeUrl, event.category) ||
    event.outcomeUrl === event.sourceUrl || !validDate(event.outcomeReviewedAt) ||
    event.outcomeReviewedAt < (event.precision === 'date' ? event.end || event.start : calendarDate(event.end || event.start, event.timeZone)))) return 'missing-outcome';
  return null;
}

export function validateCatalysts(records) {
  if (!Array.isArray(records)) return { events: [], rejected: [{ id: null, reason: 'invalid-registry' }] };
  const counts = new Map();
  records.forEach(event => counts.set(event?.id, (counts.get(event?.id) || 0) + 1));
  const events = [];
  const rejected = [];
  for (const event of records) {
    const id = event?.id || null;
    const reason = eventIssue(event) || (counts.get(id) > 1 ? 'duplicate-id' : null);
    if (reason) rejected.push({ id, reason });
    else events.push(event);
  }
  return { events, rejected };
}

export function calendarDate(now = new Date(), timeZone = DEFAULT_CALENDAR_TIME_ZONE) {
  const fields = dateFormatter(timeZone).formatToParts(new Date(now));
  const part = name => fields.find(field => field.type === name).value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

export function addCalendarDays(date, days) {
  return isoDate(new Date(dateValue(date) + days * DAY_MS));
}

export function calendarWeekday(date) {
  return new Date(dateValue(date)).getUTCDay();
}

function monthBoundary(date, offset) {
  const first = new Date(dateValue(`${date.slice(0, 7)}-01`));
  first.setUTCMonth(first.getUTCMonth() + offset);
  return isoDate(first);
}

export function calendarPeriod(date, view) {
  const month = view === 'month';
  const start = month ? monthBoundary(date, 0) : addCalendarDays(date, -((calendarWeekday(date) + 6) % 7));
  const end = month ? addCalendarDays(monthBoundary(date, 1), -1) : addCalendarDays(start, 6);
  const length = (dateValue(end) - dateValue(start)) / DAY_MS + 1;
  return { start, end, days: Array.from({ length }, (_, index) => addCalendarDays(start, index)) };
}

export function shiftCalendarPeriod(date, view, amount) {
  if (view !== 'month') return addCalendarDays(date, amount * 7);
  const start = monthBoundary(date, amount);
  const end = addCalendarDays(monthBoundary(date, amount + 1), -1);
  return addCalendarDays(start, Math.min(Number(date.slice(8)), Number(end.slice(8))) - 1);
}

export function projectCatalysts(events, timeZone = DEFAULT_CALENDAR_TIME_ZONE) {
  return events.map(event => {
    const eventDate = value => event.precision === 'date' ? value : calendarDate(value, timeZone);
    return { ...event, startDate: eventDate(event.start), endDate: eventDate(event.end || event.start) };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate) ||
    (a.precision === b.precision ? (a.precision === 'timestamp' ? Date.parse(a.start) - Date.parse(b.start) : 0)
      : a.precision === 'date' ? -1 : 1) || a.id.localeCompare(b.id));
}

export function filterCatalysts(events, { start, end, category = 'all', theme = 'all', ticker = 'all' } = {}) {
  return events.filter(event => (!start || event.endDate >= start) && (!end || event.startDate <= end) &&
    (category === 'all' || event.category === category) &&
    (theme === 'all' || event.themeIds?.includes(theme)) &&
    (ticker === 'all' || event.tickers?.includes(ticker)));
}

export function catalystStatus(event, { now = new Date() } = {}) {
  if (event.status === 'canceled') return 'canceled';
  const clock = new Date(now);
  const sourceDay = calendarDate(clock, event.timeZone);
  const finalValue = event.end || event.start;
  const dateOnly = event.precision === 'date';
  const elapsed = dateOnly ? sourceDay > finalValue : clock.getTime() > Date.parse(finalValue);
  const reachedEnd = elapsed || (dateOnly && sourceDay === finalValue);
  if (event.status === 'completed' && reachedEnd && sourceDay >= event.outcomeReviewedAt) return 'completed';
  return elapsed ? 'past-unverified' : event.status === 'completed' ? 'scheduled' : event.status;
}

export function upcomingCatalysts(events, { now = new Date(), timeZone = DEFAULT_CALENDAR_TIME_ZONE } = {}) {
  const start = calendarDate(now, timeZone);
  return filterCatalysts(events, { start, end: addCalendarDays(start, 6) })
    .filter(event => !event.sourceUnavailable && ['scheduled', 'tentative', 'rescheduled'].includes(catalystStatus(event, { now })));
}

export function selectThemeCatalysts(events, { themeId, tickers = [], now, timeZone } = {}) {
  return upcomingCatalysts(events, { now, timeZone }).filter(event => event.tickers?.length
    ? event.tickers.some(ticker => tickers.includes(ticker))
    : themeIds.has(themeId) && event.themeIds?.includes(themeId));
}

export function calendarCoverage(events, { now = new Date(), timeZone = DEFAULT_CALENDAR_TIME_ZONE } = {}) {
  const today = calendarDate(now, timeZone);
  const latestReview = events.reduce((latest, event) => !latest || event.reviewedAt > latest ? event.reviewedAt : latest, null);
  return { latestReview, stale: Boolean(latestReview && latestReview < addCalendarDays(today, -CALENDAR_REVIEW_DAYS)) };
}
