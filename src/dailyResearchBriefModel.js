import { companyDevelopments } from './companyResearchModel';
import { SOURCE_ORDER } from './dataHealthModel';
import { CURRENT_EVENT_DAYS, infrastructureEvents } from './eventModel';
import { marketContext } from './marketContext';
import { summarizeSnapshot } from './snapshotMeta';
import { easternParts, isNyseTradingDay, latestExpectedPriceSession } from './us-market-calendar';

const time = value => Date.parse(value || '');
const dateOnly = value => Number.isFinite(time(value)) ? new Date(time(value)).toISOString().slice(0, 10) : null;

function snapshotComparison(diff, ticker, clock) {
  if (!diff?.available || !Array.isArray(diff.changes) || !(time(diff.from) <= time(diff.to))) return null;

  const byType = type => diff.changes.filter(change => change.type === type);
  const selectedFirst = changes => changes.find(change => change.ticker === ticker) || changes[0] || null;
  const prices = byType('price');
  const price = selectedFirst(prices);
  const signals = byType('signal');
  const event = diff.changes.find(change => ['event-added', 'event-updated'].includes(change.type) &&
    change.title && change.sourceUrl && time(change.publishedAt) <= clock.getTime()) || null;

  return {
    from: diff.from,
    to: diff.to,
    count: diff.changes.length,
    price: price && { ...price, valueUnchanged: price.before === price.after },
    signal: selectedFirst(signals),
    event,
    health: byType('source-health')[0] || null,
  };
}

function eligibleMarketRows(market, expectedSession) {
  const knownDates = new Map();
  const eligible = date => {
    if (!date || !expectedSession || date > expectedSession) return false;
    if (!knownDates.has(date)) knownDates.set(date, isNyseTradingDay(easternParts(new Date(`${date}T17:00:00Z`))));
    return knownDates.get(date);
  };
  return [...market.benchmarks, ...market.companies].map(item => {
    const latest = eligible(item.latest?.date) ? item.latest : item.rows?.slice().reverse().find(row => eligible(row.date));
    return { ticker: item.ticker, latest, current: latest?.date === expectedSession, trend: latest === item.latest ? item.trend : 'unavailable' };
  });
}

export function buildDailyResearchBrief(snapshot = {}, {
  ticker, tickers = [], developmentTickers = [], language = 'en', now = new Date(), context,
} = {}) {
  const clock = new Date(now);
  const expectedSession = Number.isFinite(clock.getTime()) ? latestExpectedPriceSession(clock) : null;
  const market = context || marketContext(snapshot, tickers, clock);
  const instruments = eligibleMarketRows(market, expectedSession);
  const latestObservedSession = instruments.reduce((latest, item) => {
    const date = item.latest?.date;
    return date && (!latest || date > latest) ? date : latest;
  }, null);
  const comparison = snapshotComparison(snapshot.snapshotChanges, ticker, clock);
  const developments = companyDevelopments(snapshot, ticker, clock);
  const disclosure = developments[0] || developmentTickers.filter(symbol => symbol !== ticker && tickers.includes(symbol))
    .flatMap(symbol => companyDevelopments(snapshot, symbol, clock))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.ticker.localeCompare(b.ticker))[0] || null;
  const event = comparison?.event ? {
    ...comparison.event,
    url: comparison.event.sourceUrl,
    archived: clock.getTime() - time(comparison.event.publishedAt) >= CURRENT_EVENT_DAYS * 86400000,
  } : infrastructureEvents(snapshot, clock)[0] || null;
  const selectedSignal = comparison?.signal?.ticker === ticker ? comparison.signal : null;
  const questions = [];
  if (selectedSignal?.beforeAvailable && selectedSignal.afterAvailable && selectedSignal.before && selectedSignal.after &&
    selectedSignal.before !== selectedSignal.after && dateOnly(selectedSignal.observedAt)) {
    questions.push({ type: 'trend', ticker, date: dateOnly(selectedSignal.observedAt), url: selectedSignal.sourceUrl });
  }
  if (comparison?.event) questions.push({ type: 'event', date: dateOnly(comparison.event.publishedAt), url: comparison.event.sourceUrl });
  if (disclosure && (disclosure.archived || disclosure.verificationStatus === 'retained-reviewed')) {
    questions.push({ type: 'disclosure', ticker: disclosure.ticker, date: dateOnly(disclosure.publishedAt), url: disclosure.url });
  }

  const sourceGaps = [...SOURCE_ORDER, 'company-research'].map(source => ({
    source,
    status: snapshot.sourceHealth?.[source]?.status || snapshot.outcomes?.find(item => item.source === source)?.status || 'unavailable',
  })).filter(({ status }) => status !== 'ok');

  return {
    market,
    benchmarks: instruments.slice(0, market.benchmarks.length),
    expectedSession,
    latestObservedSession,
    missingMarket: instruments.filter(item => !item.latest).map(item => item.ticker),
    staleMarket: instruments.filter(item => item.latest && item.latest.date < expectedSession).map(item => item.ticker),
    selectedMarket: market.companies.find(item => item.ticker === ticker) || null,
    comparison,
    disclosure,
    selectedDisclosureAvailable: Boolean(developments.length),
    event,
    questions,
    sourceGaps,
    snapshotMeta: summarizeSnapshot(snapshot, language, undefined, clock),
  };
}
