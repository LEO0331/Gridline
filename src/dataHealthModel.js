import { companies, trackedCompanies } from './companyRegistry';
const TRACKED_TICKERS = companies.map(company => company.ticker);
const SOURCE_ORDER = ['prices', 'events', 'sec', 'eia'];
const DAY_MS = 24 * 60 * 60 * 1000;

const validDate = value => Number.isFinite(Date.parse(value));
const secureUrl = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

export function buildDataHealth(snapshot = {}, now = new Date()) {
  const observations = Array.isArray(snapshot.observations) ? snapshot.observations : [];
  const health = snapshot.sourceHealth || {};
  const generatedTime = validDate(snapshot.generatedAt) ? Date.parse(snapshot.generatedAt) : null;
  const nowTime = now instanceof Date ? now.getTime() : Date.parse(now);
  const ageHours = generatedTime === null || !Number.isFinite(nowTime) ? null : Math.max(0, (nowTime - generatedTime) / 3600000);

  const priceCoverage = trackedCompanies(snapshot).map(({ ticker }) => {
    const byDay = new Map(observations
      .filter(item => item.source === 'prices' && item.type === 'close' && item.ticker === ticker && validDate(item.observedAt) && Number.isFinite(Number(item.value)) && Number(item.value) > 0 && secureUrl(item.provenance?.originUrl || item.sourceUrl))
      .map(item => [item.observedAt.slice(0, 10), item]));
    const rows = [...byDay.values()].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    const first = rows[0] || null;
    const last = rows[rows.length - 1] || null;
    const stalenessDays = last && Number.isFinite(nowTime) ? Math.max(0, (nowTime - Date.parse(last.observedAt)) / DAY_MS) : null;
    const providers = [...new Set(rows.map(item => item.provenance?.provider || item.providerName).filter(Boolean))];
    return {
      ticker,
      count: rows.length,
      firstAt: first?.observedAt || null,
      lastAt: last?.observedAt || null,
      stalenessDays: stalenessDays === null ? null : Math.round(stalenessDays * 10) / 10,
      provider: providers.join(' / ') || null,
      ready: rows.length >= 60 && stalenessDays !== null && stalenessDays <= 10,
    };
  });

  const sources = [...SOURCE_ORDER, ...(health['company-research'] ? ['company-research'] : [])].map(source => {
    const state = health[source] || {};
    const rows = observations.filter(item => item.source === source);
    const outcome = (snapshot.outcomes || []).find(item => item.source === source);
    return {
      source,
      status: state.status || outcome?.status || (rows.length ? 'retained' : 'unavailable'),
      recordCount: Number.isFinite(Number(state.recordCount)) ? Number(state.recordCount) : rows.length,
      lastSuccessAt: state.lastSuccessAt || null,
      checkedAt: state.checkedAt || null,
      message: state.message || outcome?.message || null,
      coverage: state.coverage || null,
      attempts: outcome?.attempts || null,
    };
  });

  const reconstructed = Number(snapshot.backtestCoverage?.reconstructed || 0);
  const recorded = Number(snapshot.backtestCoverage?.recorded || 0);
  const blockers = [];
  if (snapshot.trackedTickers !== undefined && (!Array.isArray(snapshot.trackedTickers) || !snapshot.trackedTickers.length || new Set(snapshot.trackedTickers).size !== snapshot.trackedTickers.length || snapshot.trackedTickers.some(ticker => !TRACKED_TICKERS.includes(ticker)))) blockers.push('trackedUniverse');
  if (Number(snapshot.schemaVersion) < 4) blockers.push('schema');
  if (!snapshot.backtestCoverage) blockers.push('backtestCoverage');
  if (!snapshot.methodologies?.companyScore) blockers.push('methodology');
  if (priceCoverage.some(item => !item.ready)) blockers.push('prices');

  return {
    state: blockers.length ? 'attention' : sources.some(item => ['degraded', 'partial'].includes(item.status)) ? 'ready-with-warnings' : 'ready',
    blockers,
    schemaVersion: snapshot.schemaVersion ?? null,
    generatedAt: snapshot.generatedAt || null,
    ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    freshness: snapshot.freshness || 'unknown',
    methodologyVersion: snapshot.methodologies?.companyScore || null,
    sources,
    priceCoverage,
    backtest: {
      start: snapshot.backtestCoverage?.start || null,
      end: snapshot.backtestCoverage?.end || null,
      recorded,
      reconstructed,
      quality: snapshot.backtestCoverage?.reconstructionQuality || (reconstructed ? 'partial' : 'recorded-only'),
    },
  };
}

export { TRACKED_TICKERS, SOURCE_ORDER };
