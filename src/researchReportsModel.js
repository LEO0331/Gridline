import { RESEARCH_THEMES } from './researchThemes';
import { addCalendarDays, calendarDate, calendarPeriod, DEFAULT_CALENDAR_TIME_ZONE } from './researchCalendarModel';
import { easternParts, isNyseTradingDay, latestExpectedPriceSession, NYSE_HOLIDAYS } from './us-market-calendar';

const timestamp = edition => Date.parse(edition.generatedAt);
const newestFirst = (a, b) => b.session.localeCompare(a.session) || timestamp(b) - timestamp(a) || b.id.localeCompare(a.id);
const weekOf = session => calendarPeriod(session, 'week').start;

export function reportPeriods(archive) {
  const editions = [...archive.editions].sort(newestFirst);
  return { editions, weeks: [...new Set(editions.map(edition => weekOf(edition.session)))] };
}

export function reportMatchesTheme(record, themeId) {
  if (themeId === 'all') return true;
  const theme = RESEARCH_THEMES.find(item => item.id === themeId);
  return Boolean(theme && (record.themeId === theme.id || (record.ticker && theme.tickers.includes(record.ticker))));
}

function uniqueLatest(items, identity) {
  const selected = new Map();
  items.forEach(item => {
    const key = identity(item);
    if (!selected.has(key)) selected.set(key, item);
  });
  return [...selected.values()];
}

const withEdition = (editions, key) => editions.flatMap(edition => (edition[key] || []).map(record => ({
  ...record, editionId: edition.id, editionSession: edition.session, editionAt: edition.generatedAt,
})));
const evidenceIdentity = item => `${item.ticker || ''}|${item.originalSourceUrl || item.sourceUrl || item.id}`;
const financialIdentity = item => [item.ticker, item.type, item.sourceUrl, item.periodStart, item.periodEnd, item.filedAt,
  item.taxonomy, item.factTag, item.unit, item.value].join('|');

function firstSeen(items, identity) {
  const earliest = new Map();
  items.forEach(item => {
    const key = identity(item);
    if (!earliest.has(key) || Date.parse(item.editionAt) < Date.parse(earliest.get(key))) earliest.set(key, item.editionAt);
  });
  return uniqueLatest(items, identity).map(item => ({ ...item, firstRetainedAt: earliest.get(identity(item)) }));
}

export function buildWeeklyReview(archive, selectedWeek, now = new Date()) {
  const period = calendarPeriod(selectedWeek, 'week');
  const sessions = period.days.filter(day => isNyseTradingDay(easternParts(new Date(`${day}T17:00:00Z`))));
  const currentSession = latestExpectedPriceSession(new Date(now));
  const editions = reportPeriods(archive).editions.filter(edition => edition.session >= period.start && edition.session <= period.end);
  const daily = uniqueLatest(editions, edition => edition.session);
  const covered = new Set(daily.map(edition => edition.session));
  const elapsedMissing = sessions.filter(session => session <= currentSession && !covered.has(session));
  const pending = sessions.filter(session => session > currentSession && !covered.has(session));
  const changes = editions.flatMap(edition => (edition.changes?.available ? edition.changes.changes : []).map(item => ({
    ...item, editionSession: edition.session, editionAt: edition.generatedAt,
  })));
  const developments = firstSeen(withEdition(editions, 'developments'), evidenceIdentity);
  const financials = firstSeen(withEdition(editions, 'financials'), financialIdentity);
  const financialGaps = uniqueLatest(withEdition(editions, 'financialGaps'),
    item => [item.ticker, item.type, item.classification, item.sourceUrl, item.checkedAt].join('|'));
  const infrastructure = firstSeen(withEdition(editions, 'infrastructure'), evidenceIdentity);
  const questions = uniqueLatest(withEdition(editions, 'questions'), item => [item.ticker, item.en, item.sourceUrl, item.date].join('|'));
  const calendarKnown = period.days.every(day => NYSE_HOLIDAYS[Number(day.slice(0, 4))]);
  const complete = calendarKnown && sessions.every(session => covered.has(session)) && daily.length >= 2;
  return {
    ...period, sessions, daily, coveredSessions: sessions.filter(session => covered.has(session)), elapsedMissing, pending,
    calendarKnown, complete, sufficient: daily.length >= 2,
    themes: RESEARCH_THEMES.map(theme => ({
      ...theme,
      developments: developments.filter(item => reportMatchesTheme(item, theme.id)),
      financials: financials.filter(item => reportMatchesTheme(item, theme.id)),
      financialGaps: financialGaps.filter(item => reportMatchesTheme(item, theme.id)),
      infrastructure: infrastructure.filter(item => reportMatchesTheme(item, theme.id)),
      questions: questions.filter(item => reportMatchesTheme(item, theme.id)).slice(0, 3),
      market: daily.flatMap(edition => edition.market.filter(item => reportMatchesTheme(item, theme.id))
        .map(item => ({ ...item, editionSession: edition.session }))),
      coveredTickers: theme.tickers.filter(ticker => editions.some(edition => edition.trackedTickers.includes(ticker))),
    })),
    developments, financials, financialGaps, infrastructure, questions: questions.slice(0, 3),
    eventChanges: uniqueLatest(changes.filter(item => item.type?.startsWith('event-')),
      item => [item.type, item.sourceUrl || item.eventId || item.id, item.publishedAt, item.title].join('|')),
    sourceChanges: uniqueLatest(changes.filter(item => item.type === 'source-health'),
      item => [item.source, item.before, item.after, item.checkedAt].join('|')),
    marketChanges: uniqueLatest(changes.filter(item => item.type === 'price' || item.type === 'signal'),
      item => [item.type, item.ticker, item.observedAt, item.before, item.after, item.beforeAvailable, item.afterAvailable].join('|')),
  };
}

export function publicationDateMarker(value) {
  return /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value) ? value.slice(0, 10) : value;
}

export function recordedDuringWeek(value, review) {
  if (!value) return false;
  const marked = publicationDateMarker(value);
  const day = marked.length === 10 ? marked : calendarDate(new Date(value), DEFAULT_CALENDAR_TIME_ZONE);
  return day >= review.start && day < addCalendarDays(review.end, 1);
}
