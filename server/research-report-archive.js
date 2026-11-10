const { createHash } = require('node:crypto');
const { latestExpectedPriceSession, easternParts, isNyseTradingDay } = require('./us-market-calendar');
const { latestPrices, eventMap } = require('./snapshot-changes');
const companyUniverse = require('../src/data/companyExposure.json');
const {
  EMPTY_RESEARCH_ARCHIVE, MAX_REPORT_EDITIONS, REPORT_METRICS, BENCHMARKS, HEALTH_KEYS, TREND_STATES, COMPANY_VERIFICATION,
  date, instant, byCutoff, secureUrl, secUrl, validDevelopment, validFinancial, validFinancialGap, validMarket, validChange,
  summarizeChanges, validateResearchArchive,
} = require('../src/researchReportArchive');

const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const sourceUrl = row => row.sourceUrl || row.provenance?.originUrl;
const iso = value => new Date(value).toISOString();
const byLatest = (a, b, field) => Date.parse(b[field]) - Date.parse(a[field]) || a.id.localeCompare(b.id);
const knownTickers = companyUniverse.map(({ ticker }) => ticker);
const developmentFields = ['title', 'titleZh', 'summary', 'summaryZh', 'source', 'publishedAt', 'reviewedAt', 'verificationStatus',
  'originalSourceUrl', 'region', 'category'];
const financialFields = ['id', 'ticker', 'type', 'value', 'unit', 'periodStart', 'periodEnd', 'periodKind', 'filedAt', 'retrievedAt',
  'form', 'fiscalYear', 'fiscalPeriod', 'taxonomy', 'factTag', 'classification', 'conceptLabel', 'conceptLabelZh', 'extractionMethod'];
const changeFields = ['id', 'type', 'ticker', 'before', 'after', 'observedAt', 'provider', 'sourceUrl', 'beforeAvailable',
  'afterAvailable', 'methodologyVersion', 'title', 'category', 'region', 'publishedAt', 'source', 'checkedAt'];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

const serialized = value => JSON.stringify(stable(value));
function editionId(content) {
  const digest = createHash('sha256').update(serialized(content)).digest('hex').slice(0, 24);
  return `${content.session}-${digest}`;
}

function retainedPriceRows(snapshot, tickers, cutoff, session) {
  const eligibleDates = new Map();
  const rows = (snapshot.observations || []).filter(row => {
    if (row?.source !== 'prices' || row.type !== 'close' || !byCutoff(row.observedAt, cutoff) ||
      !byCutoff(row.retrievedAt, cutoff) || Date.parse(row.retrievedAt) < Date.parse(row.observedAt)) return false;
    const day = row.observedAt.slice(0, 10);
    if (!date(day) || day > session || typeof row.id !== 'string' || !row.id.trim() ||
      !secureUrl(sourceUrl(row)) || !(row.providerName || row.provenance?.provider)) return false;
    if (!eligibleDates.has(day)) eligibleDates.set(day, isNyseTradingDay(easternParts(new Date(`${day}T17:00:00Z`))));
    return eligibleDates.get(day);
  });
  const eligibleIds = new Map(rows.map(row => [row.id, row]));
  const latest = latestPrices({ generatedAt: snapshot.generatedAt, observations: rows }, tickers);
  const scores = new Map((snapshot.scores || []).map(score => [score?.ticker, score]));
  return tickers.flatMap(ticker => {
    const row = latest.get(ticker);
    if (!row) return [];
    const score = scores.get(ticker);
    const signal = score?.marketSignal;
    // A recorded trend is evidence only if the selected close and all cited
    // input observations were available at the snapshot's source cutoff.
    const recorded = signal?.available === true && TREND_STATES.includes(signal.trend) &&
      byCutoff(score.asOf, cutoff) && typeof score.methodologyVersion === 'string' && score.methodologyVersion.trim() &&
      signal.observedAt === row.observedAt && signal.sourceUrl === sourceUrl(row) &&
      Array.isArray(signal.lineage) && signal.lineage.includes(row.id) && signal.lineage.every(id => {
        const input = eligibleIds.get(id);
        return input?.ticker === ticker && sourceUrl(input) === sourceUrl(row);
      });
    const evidence = {
      id: row.id, ticker, close: Number(row.value), currency: row.currency || null,
      observedAt: row.observedAt, retrievedAt: row.retrievedAt, sourceUrl: sourceUrl(row), provider: row.providerName || row.provenance?.provider,
      trend: recorded ? signal.trend : null, methodologyVersion: recorded ? score.methodologyVersion : null,
      ...(recorded ? { signalObservationIds: signal.lineage } : {}),
    };
    return validMarket(evidence, cutoff) ? [evidence] : [];
  });
}

function developments(snapshot, trackedTickers, cutoff) {
  const candidates = (snapshot.observations || []).flatMap(row => {
    if (row?.source !== 'company-research' || row.type !== 'companyDevelopment' ||
      !trackedTickers.includes(row.ticker) || row.value?.ticker !== row.ticker ||
      !COMPANY_VERIFICATION.includes(row.value.verificationStatus)) return [];
    const item = {
      id: row.id, ticker: row.ticker, sourceUrl: row.value.url, retrievedAt: row.retrievedAt,
      ...pick(row.value, developmentFields),
    };
    return validDevelopment(item, cutoff) ? [item] : [];
  }).sort((a, b) => byLatest(a, b, 'retrievedAt'));
  const bySource = new Map();
  for (const item of candidates) {
    const key = `${item.ticker}/${item.originalSourceUrl || item.sourceUrl}`;
    if (!bySource.has(key)) bySource.set(key, item);
  }
  const byPublication = [...bySource.values()].sort((a, b) => byLatest(a, b, 'publishedAt'));
  return trackedTickers.flatMap(ticker => byPublication.filter(item => item.ticker === ticker).slice(0, 2));
}

function infrastructure(snapshot, cutoff) {
  const observations = (snapshot.observations || []).filter(row => row?.source === 'events' &&
    row.type === 'infrastructureEvent' && byCutoff(row.value?.publishedAt, cutoff) && byCutoff(row.retrievedAt, cutoff));
  return [...eventMap({ observations }).values()].flatMap(item => {
    const result = { id: item.observationId, sourceUrl: item.url, retrievedAt: item.retrievedAt, ...pick(item, developmentFields) };
    return validDevelopment(result, cutoff) ? [result] : [];
  }).sort((a, b) => byLatest(a, b, 'publishedAt'));
}

function financials(snapshot, trackedTickers, cutoff) {
  const candidates = (snapshot.observations || []).flatMap(row => {
    if (row?.source !== 'sec' || !trackedTickers.includes(row.ticker) || !REPORT_METRICS.includes(row.type) ||
      !byCutoff(row.observedAt, cutoff)) return [];
    const result = { ...pick(row, financialFields), sourceUrl: sourceUrl(row) };
    if (!validFinancial(result, cutoff)) return [];
    if (cutoff - Date.parse(result.periodEnd) > 400 * 86_400_000) result.classification = 'stale-data';
    if (byCutoff(row.auditReviewedAt, cutoff)) result.auditReviewedAt = row.auditReviewedAt;
    return [result];
  }).sort((a, b) => Date.parse(b.periodEnd) - Date.parse(a.periodEnd) ||
    String(b.periodStart || '').localeCompare(String(a.periodStart || '')) || byLatest(a, b, 'filedAt'));
  return trackedTickers.flatMap(ticker => REPORT_METRICS.flatMap(type => {
    const item = candidates.find(candidate => candidate.ticker === ticker && candidate.type === type);
    return item ? [item] : [];
  }));
}

function financialGaps(snapshot, report, cutoff) {
  const present = new Set(report.financials.map(item => `${item.ticker}/${item.type}`));
  return report.trackedTickers.flatMap(ticker => {
    const state = snapshot.sourceHealth?.sec?.tickers?.[ticker];
    return REPORT_METRICS.flatMap(type => {
      const coverage = state?.factCoverage?.[type];
      if (coverage?.available !== false || present.has(`${ticker}/${type}`)) return [];
      const item = { ticker, type, checkedAt: state.checkedAt,
        ...pick(coverage, ['classification', 'conceptLabel', 'conceptLabelZh', 'reason', 'reasonZh']) };
      if (byCutoff(coverage.auditReviewedAt, cutoff) && secUrl(coverage.auditSourceUrl)) {
        item.reviewedAt = coverage.auditReviewedAt;
        item.sourceUrl = coverage.auditSourceUrl;
      } else if (secUrl(coverage.sourceUrl)) item.sourceUrl = coverage.sourceUrl;
      return validFinancialGap(item, cutoff) ? [item] : [];
    });
  });
}

function sourceHealth(snapshot, cutoff) {
  return Object.fromEntries(HEALTH_KEYS.flatMap(key => {
    const entry = snapshot.sourceHealth?.[key];
    if (typeof entry?.status !== 'string' || !entry.status.trim() ||
      [entry.checkedAt, entry.lastSuccessAt].some(value => value != null && !byCutoff(value, cutoff))) return [];
    return [[key, {
      status: entry.status, checkedAt: entry.checkedAt || null, lastSuccessAt: entry.lastSuccessAt || null,
      recordCount: Number.isSafeInteger(entry.recordCount) && entry.recordCount >= 0 ? entry.recordCount : null,
    }]];
  }));
}

function snapshotDiff(diff, report, events, cutoff) {
  if (diff?.version !== 'snapshot-diff-v1' || !instant(diff.to) || Date.parse(diff.to) !== cutoff ||
    !instant(diff.from) || Date.parse(diff.from) >= cutoff || diff.available !== true || !Array.isArray(diff.changes)) return null;
  const eventLinks = new Set(events.map(item => item.sourceUrl));
  const market = new Map(report.market.map(item => [item.ticker, item]));
  const ids = new Set();
  const changes = diff.changes.flatMap(row => {
    if (!validChange(row, cutoff) || ids.has(row.id)) return [];
    const quote = market.get(row.ticker);
    if (row.type === 'price' && !(quote?.close === row.after && quote.observedAt === row.observedAt && quote.sourceUrl === row.sourceUrl)) return [];
    if (row.type === 'signal' && row.afterAvailable && !(quote?.trend === row.after && quote.observedAt === row.observedAt)) return [];
    if (row.type.startsWith('event-') && !eventLinks.has(row.sourceUrl)) return [];
    if (row.type === 'source-health' && (report.sourceHealth[row.source]?.status || null) !== row.after) return [];
    ids.add(row.id);
    return [pick(row, changeFields)];
  }).slice(0, 80);
  const omitted = diff.changes.length - changes.length;
  return { version: diff.version, available: true, reason: null, from: diff.from, to: diff.to, changes,
    summary: summarizeChanges(changes), ...(omitted > 0 ? { omitted } : {}) };
}

function researchQuestions(report) {
  const questions = [];
  const event = report.changes?.changes.find(item => ['event-added', 'event-updated'].includes(item.type));
  if (event) questions.push({
    en: 'Has the reported infrastructure development been followed by a documented decision or milestone?',
    zh: '這項已發布的基礎設施進展，之後是否有具文件佐證的決策或里程碑？',
    supportEn: 'This official record was added or updated between the two snapshot publications.',
    supportZh: '這筆官方紀錄在兩次快照發布之間新增或更新。', sourceUrl: event.sourceUrl, date: event.publishedAt,
  });
  const signal = report.changes?.changes.find(item => item.type === 'signal' && item.beforeAvailable &&
    item.afterAvailable && item.before !== item.after);
  if (signal) questions.push({
    ticker: signal.ticker, en: 'Does this recorded trend transition persist in the next eligible observation?',
    zh: '這項已記錄的趨勢轉變，是否延續到下一筆合格的觀察？',
    supportEn: 'The recorded states differed between the two snapshot publications.',
    supportZh: '兩次快照發布記錄的趨勢狀態不同。', sourceUrl: signal.sourceUrl, date: signal.observedAt,
  });
  const disclosure = [...report.developments].sort((a, b) => byLatest(a, b, 'publishedAt'))
    .find(item => Date.parse(report.generatedAt) - Date.parse(item.publishedAt) >= 30 * 86_400_000);
  const gap = report.financialGaps.find(item => item.sourceUrl && item.reason && item.reasonZh);
  if (gap) questions.push({
    ticker: gap.ticker, en: 'Does a more recent official filing separately report this financial field?',
    zh: '較新的官方申報文件是否單獨揭露此財務欄位？',
    supportEn: gap.reason, supportZh: gap.reasonZh, sourceUrl: gap.sourceUrl, date: gap.reviewedAt || gap.checkedAt,
  });
  else if (disclosure) questions.push({
    ticker: disclosure.ticker, en: 'Is there a more recent official update to this retained disclosure?',
    zh: '這筆保留的揭露，是否已有較新的官方更新？',
    supportEn: 'The publication date predates the snapshot by at least 30 days.',
    supportZh: '發布日期至少早於快照 30 天。', sourceUrl: disclosure.originalSourceUrl || disclosure.sourceUrl, date: disclosure.publishedAt,
  });
  return questions;
}

function buildResearchEdition(snapshot) {
  if (!instant(snapshot?.generatedAt)) throw new Error('Research reports require a valid snapshot publication timestamp.');
  const cutoff = Date.parse(snapshot.generatedAt);
  const session = latestExpectedPriceSession(new Date(cutoff));
  const trackedTickers = knownTickers.filter(ticker => (snapshot.trackedTickers || knownTickers).includes(ticker));
  const market = retainedPriceRows(snapshot, [...trackedTickers, ...BENCHMARKS], cutoff, session);
  if (!market.some(row => trackedTickers.includes(row.ticker) && row.observedAt.slice(0, 10) === session)) return null;
  const events = infrastructure(snapshot, cutoff);
  const report = {
    session, generatedAt: iso(cutoff), freshness: snapshot.freshness || 'unknown', trackedTickers, market,
    developments: developments(snapshot, trackedTickers, cutoff), infrastructure: events.slice(0, 12),
    financials: financials(snapshot, trackedTickers, cutoff), sourceHealth: sourceHealth(snapshot, cutoff),
  };
  report.financialGaps = financialGaps(snapshot, report, cutoff);
  report.changes = snapshotDiff(snapshot.snapshotChanges, report, events, cutoff);
  report.questions = researchQuestions(report);
  return { id: editionId(report), ...report };
}

function materialMarket(rows) {
  return rows.map(row => pick(row, ['ticker', 'close', 'currency', 'observedAt', 'sourceUrl', 'provider', 'trend', 'methodologyVersion']));
}

function currentMarket(report) {
  return materialMarket(report.market.filter(row => row.observedAt.slice(0, 10) === report.session));
}

function materialReport(report) {
  const omitTiming = items => items.map(({ retrievedAt, ...item }) => item);
  return serialized({
    session: report.session, freshness: report.freshness, trackedTickers: report.trackedTickers, market: materialMarket(report.market),
    developments: omitTiming(report.developments), infrastructure: omitTiming(report.infrastructure), financials: omitTiming(report.financials),
    financialGaps: (report.financialGaps || []).map(({ checkedAt, ...item }) => item),
    sourceHealth: Object.fromEntries(Object.entries(report.sourceHealth).map(([key, value]) => [key, value.status])),
  });
}

function verifyEditionIds(archive) {
  validateResearchArchive(archive);
  for (const { id, ...content } of archive.editions) {
    if (editionId(content) !== id) throw new Error('Research archive contains a report whose edition identity does not match its evidence.');
  }
}

function validateArchiveAgainstSnapshot(archive, snapshot) {
  verifyEditionIds(archive);
  if (!instant(snapshot?.generatedAt)) throw new Error('Research archive requires a valid snapshot publication timestamp.');
  const latest = archive.editions.at(-1);
  if (!latest) return archive;
  const latestTime = Date.parse(latest.generatedAt);
  const snapshotTime = Date.parse(snapshot.generatedAt);
  if (latestTime > snapshotTime) throw new Error('Research archive is newer than the snapshot.');
  if (latestTime === snapshotTime && latest.id !== buildResearchEdition(snapshot)?.id) {
    throw new Error('Research archive does not match its source snapshot.');
  }
  return archive;
}

function updateResearchArchive(archive = EMPTY_RESEARCH_ARCHIVE, snapshot, previousSnapshot) {
  validateArchiveAgainstSnapshot(archive, previousSnapshot || snapshot);
  const report = buildResearchEdition(snapshot);
  if (!report) return archive;
  const latest = archive.editions.at(-1);
  if (latest?.id === report.id) return archive;
  if (latest && Date.parse(report.generatedAt) <= Date.parse(latest.generatedAt)) {
    throw new Error('Research report would replace or predate an existing edition.');
  }
  const previousTime = Date.parse(previousSnapshot?.generatedAt);
  if (Number.isFinite(previousTime) && Date.parse(report.generatedAt) <= previousTime) return archive;
  if (latest?.session === report.session) {
    if (materialReport(latest) === materialReport(report)) return archive;
  } else if (previousSnapshot) {
    const prior = buildResearchEdition(previousSnapshot);
    if (prior?.session === report.session && serialized(currentMarket(prior)) === serialized(currentMarket(report))) return archive;
  }
  const next = [...archive.editions, report];
  const trimmed = Math.max(0, next.length - MAX_REPORT_EDITIONS);
  return validateResearchArchive({ schemaVersion: 1, trimmedEditions: archive.trimmedEditions + trimmed, editions: next.slice(trimmed) });
}

module.exports = { buildResearchEdition, updateResearchArchive, validateResearchArchive, validateArchiveAgainstSnapshot };
