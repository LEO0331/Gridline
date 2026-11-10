const { easternParts } = require('./us-market-calendar');

const MAX_REPORT_EDITIONS = 60;
const MAX_REPORT_BYTES = 128 * 1024;
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const EMPTY_RESEARCH_ARCHIVE = Object.freeze({ schemaVersion: 1, trimmedEditions: 0, editions: Object.freeze([]) });
const REPORT_METRICS = ['revenue', 'dilutedEps', 'capex', 'currentDebt', 'longTermDebt'];
const BENCHMARKS = ['SPY', 'QQQ'];
const CHANGE_TYPES = ['price', 'signal', 'event-added', 'event-updated', 'event-archived', 'source-health'];
const HEALTH_KEYS = ['prices', 'sec', 'eia', 'events', 'company-research'];
const TREND_STATES = ['above', 'below', 'mixed'];
const COMPANY_VERIFICATION = ['primary-verified', 'official-fallback-verified'];

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const optionalStrings = (value, keys) => keys.every(key => value[key] == null || typeof value[key] === 'string');
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const byCutoff = (value, cutoff) => (date(value) || instant(value)) && Date.parse(value) <= cutoff;
const optionalDate = (value, cutoff) => value == null || byCutoff(value, cutoff);
const uniqueBy = (values, key) => new Set(values.map(key)).size === values.length;
const symbol = value => typeof value === 'string' && /^[A-Z][A-Z0-9.-]{0,9}$/.test(value);
const publicationDay = cutoff => {
  const { year, month, day } = easternParts(new Date(cutoff));
  return `${year}-${month}-${day}`;
};
const secureUrl = value => {
  if (!nonempty(value) || !value.startsWith('https://') || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
};
const secUrl = value => secureUrl(value) && ['www.sec.gov', 'data.sec.gov'].includes(new URL(value).hostname);
const bytes = value => {
  const serialized = JSON.stringify(value);
  // Count UTF-8 bytes in both browser and Node, including non-ASCII evidence.
  let count = 0;
  for (const char of serialized) {
    const code = char.codePointAt(0);
    count += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return count;
};

const validMarket = (row, cutoff) => isObject(row) && symbol(row.ticker) && nonempty(row.id) &&
  Number.isFinite(row.close) && row.close > 0 && (row.currency == null || /^[A-Z]{3}$/.test(row.currency)) &&
  byCutoff(row.observedAt, cutoff) && byCutoff(row.retrievedAt, cutoff) && Date.parse(row.observedAt) <= Date.parse(row.retrievedAt) &&
  secureUrl(row.sourceUrl) && nonempty(row.provider) &&
  (row.trend == null || (TREND_STATES.includes(row.trend) && nonempty(row.methodologyVersion))) &&
  (row.signalObservationIds == null || (Array.isArray(row.signalObservationIds) && row.signalObservationIds.every(nonempty)));
const validDevelopment = (item, cutoff) => isObject(item) && nonempty(item.id) &&
  nonempty(item.title) && nonempty(item.source) && secureUrl(item.sourceUrl) &&
  byCutoff(item.publishedAt, cutoff) && byCutoff(item.retrievedAt, cutoff) && Date.parse(item.publishedAt) <= Date.parse(item.retrievedAt) &&
  optionalDate(item.reviewedAt, cutoff) && (item.originalSourceUrl == null || secureUrl(item.originalSourceUrl)) &&
  optionalStrings(item, ['titleZh', 'summary', 'summaryZh', 'region', 'category', 'verificationStatus']);
const validFinancial = (item, cutoff) => isObject(item) && nonempty(item.id) && symbol(item.ticker) && REPORT_METRICS.includes(item.type) &&
  Number.isFinite(item.value) && /^[A-Z]{3}(?:\/shares)?$/.test(item.unit || '') &&
  date(item.periodEnd) && date(item.filedAt) && item.periodEnd <= item.filedAt &&
  (item.periodStart == null || (date(item.periodStart) && item.periodStart <= item.periodEnd)) &&
  byCutoff(item.filedAt, cutoff) && byCutoff(item.retrievedAt, cutoff) && Date.parse(item.filedAt) <= Date.parse(item.retrievedAt) &&
  secUrl(item.sourceUrl) && optionalDate(item.auditReviewedAt, cutoff) &&
  optionalStrings(item, ['periodKind', 'form', 'fiscalPeriod', 'taxonomy', 'factTag', 'classification',
    'conceptLabel', 'conceptLabelZh', 'extractionMethod']);
const validFinancialGap = (item, cutoff) => isObject(item) && symbol(item.ticker) && REPORT_METRICS.includes(item.type) &&
  ['not-separately-reported', 'unavailable', 'stale-data'].includes(item.classification) &&
  byCutoff(item.checkedAt, cutoff) && optionalDate(item.reviewedAt, cutoff) &&
  (item.sourceUrl == null || secUrl(item.sourceUrl)) && optionalStrings(item, ['reason', 'reasonZh', 'conceptLabel', 'conceptLabelZh']);
const validQuestion = (item, cutoff) => isObject(item) && [item.en, item.zh, item.supportEn, item.supportZh].every(nonempty) &&
  byCutoff(item.date, cutoff) && secureUrl(item.sourceUrl);

function validChange(item, cutoff) {
  if (!isObject(item) || !nonempty(item.id) || !CHANGE_TYPES.includes(item.type) ||
    (item.sourceUrl != null && !secureUrl(item.sourceUrl)) ||
    !optionalStrings(item, ['provider', 'methodologyVersion', 'title', 'category', 'region', 'source'])) return false;
  switch (item.type) {
    case 'price':
      return symbol(item.ticker) && secureUrl(item.sourceUrl) && Number.isFinite(item.after) && item.after > 0 &&
        (item.before == null || Number.isFinite(item.before)) && byCutoff(item.observedAt, cutoff);
    case 'signal':
      return symbol(item.ticker) && typeof item.beforeAvailable === 'boolean' && typeof item.afterAvailable === 'boolean' &&
        (item.beforeAvailable ? TREND_STATES.includes(item.before) : item.before == null) &&
        (item.afterAvailable ? TREND_STATES.includes(item.after) && byCutoff(item.observedAt, cutoff) && secureUrl(item.sourceUrl) : optionalDate(item.observedAt, cutoff));
    case 'source-health':
      return HEALTH_KEYS.includes(item.source) && [item.before, item.after].every(value => value == null || nonempty(value)) &&
        optionalDate(item.checkedAt, cutoff);
    default:
      return nonempty(item.title) && secureUrl(item.sourceUrl) && byCutoff(item.publishedAt, cutoff);
  }
}

const summarizeChanges = changes => ({
  total: changes.length,
  price: changes.filter(item => item.type === 'price').length,
  signal: changes.filter(item => item.type === 'signal').length,
  event: changes.filter(item => item.type.startsWith('event-')).length,
  sourceHealth: changes.filter(item => item.type === 'source-health').length,
});

function validChanges(value, cutoff) {
  if (value === null) return true;
  if (!isObject(value) || value.version !== 'snapshot-diff-v1' || typeof value.available !== 'boolean' ||
    !instant(value.to) || Date.parse(value.to) !== cutoff || !Array.isArray(value.changes) ||
    !value.changes.every(item => validChange(item, cutoff)) || !uniqueBy(value.changes, item => item.id) ||
    !isObject(value.summary) || Object.entries(summarizeChanges(value.changes)).some(([key, count]) => value.summary[key] !== count)) return false;
  if (!value.available) return value.changes.length === 0 && optionalDate(value.from, cutoff) && nonempty(value.reason);
  return instant(value.from) && Date.parse(value.from) < cutoff && (value.omitted == null || (Number.isSafeInteger(value.omitted) && value.omitted > 0));
}

function validSourceHealth(value, cutoff) {
  return isObject(value) && Object.entries(value).every(([key, state]) => HEALTH_KEYS.includes(key) &&
    isObject(state) && nonempty(state.status) && optionalDate(state.checkedAt, cutoff) &&
    optionalDate(state.lastSuccessAt, cutoff) && (state.recordCount == null || (Number.isSafeInteger(state.recordCount) && state.recordCount >= 0)));
}

function validateResearchArchive(archive) {
  if (!isObject(archive) || archive.schemaVersion !== 1 || !Number.isSafeInteger(archive.trimmedEditions) ||
    archive.trimmedEditions < 0 || !Array.isArray(archive.editions) || archive.editions.length > MAX_REPORT_EDITIONS ||
    (!archive.editions.length && archive.trimmedEditions)) throw new Error('Invalid research archive schema or retention metadata.');

  let previousTime = -Infinity;
  let previousSession = '';
  const ids = new Set();
  for (const report of archive.editions) {
    const cutoff = Date.parse(report?.generatedAt);
    if (!isObject(report) || !instant(report.generatedAt) || cutoff <= previousTime ||
      !date(report.session) || report.session < previousSession || report.session > publicationDay(cutoff) ||
      !nonempty(report.id) || !new RegExp(`^${report.session}-[a-f0-9]{24}$`).test(report.id) || ids.has(report.id) ||
      !nonempty(report.freshness) || !Array.isArray(report.trackedTickers) || !report.trackedTickers.length ||
      !report.trackedTickers.every(symbol) || !uniqueBy(report.trackedTickers, item => item) ||
      !Array.isArray(report.market) || !report.market.every(row => validMarket(row, cutoff) && row.observedAt.slice(0, 10) <= report.session &&
        (report.trackedTickers.includes(row.ticker) || BENCHMARKS.includes(row.ticker))) ||
      !uniqueBy(report.market, item => item.ticker) ||
      !report.market.some(row => report.trackedTickers.includes(row.ticker) && row.observedAt.slice(0, 10) === report.session) ||
      !validChanges(report.changes, cutoff) ||
      !Array.isArray(report.developments) || !report.developments.every(item => validDevelopment(item, cutoff) && report.trackedTickers.includes(item.ticker) && COMPANY_VERIFICATION.includes(item.verificationStatus)) ||
      !uniqueBy(report.developments, item => `${item.ticker}/${item.originalSourceUrl || item.sourceUrl}`) ||
      !Array.isArray(report.infrastructure) || !report.infrastructure.every(item => validDevelopment(item, cutoff)) ||
      !uniqueBy(report.infrastructure, item => item.sourceUrl) ||
      !Array.isArray(report.financials) || !report.financials.every(item => validFinancial(item, cutoff) && report.trackedTickers.includes(item.ticker)) ||
      !uniqueBy(report.financials, item => `${item.ticker}/${item.type}`) ||
      (report.financialGaps != null && (!Array.isArray(report.financialGaps) ||
        !report.financialGaps.every(item => validFinancialGap(item, cutoff) && report.trackedTickers.includes(item.ticker)) ||
        !uniqueBy([...report.financials, ...report.financialGaps], item => `${item.ticker}/${item.type}`))) ||
      !Array.isArray(report.questions) || report.questions.length > 3 ||
      !report.questions.every(item => validQuestion(item, cutoff) && (item.ticker == null || report.trackedTickers.includes(item.ticker))) ||
      !validSourceHealth(report.sourceHealth, cutoff) || bytes(report) > MAX_REPORT_BYTES) {
      throw new Error(`Invalid research report edition at index ${ids.size}.`);
    }
    ids.add(report.id);
    previousTime = cutoff;
    previousSession = report.session;
  }
  if (bytes(archive) > MAX_ARCHIVE_BYTES) throw new Error('Research archive exceeds its size limit.');
  return archive;
}

module.exports = {
  EMPTY_RESEARCH_ARCHIVE, MAX_REPORT_EDITIONS, MAX_REPORT_BYTES, MAX_ARCHIVE_BYTES, REPORT_METRICS, BENCHMARKS, HEALTH_KEYS,
  TREND_STATES, COMPANY_VERIFICATION, date, instant, byCutoff, secureUrl, secUrl, validDevelopment, validFinancial, validMarket,
  validFinancialGap, validChange, summarizeChanges, validateResearchArchive,
};
