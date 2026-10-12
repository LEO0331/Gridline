import { companies } from './companyRegistry';
import profiles from './data/companyResearch.json';

const METRICS = [
  ['revenue', 'Revenue', '營收'], ['dilutedEps', 'Diluted EPS', '稀釋每股盈餘'],
  ['capex', 'Capital expenditure', '資本支出'], ['currentDebt', 'Current debt', '流動負債借款'],
  ['longTermDebt', 'Long-term debt', '長期負債借款'],
];
const dayMs = 86400000;
const httpsUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };
const secUrl = value => { try { return httpsUrl(value) && ['www.sec.gov', 'data.sec.gov'].includes(new URL(value).hostname); } catch { return false; } };
const fieldLabels = (id, detail = {}) => {
  const metric = METRICS.find(item => item[0] === id);
  return { id, label: detail.conceptLabel || metric?.[1] || 'Other reported metric', labelZh: detail.conceptLabelZh || metric?.[2] || '其他申報指標', ...detail };
};
function officialDevelopment(snapshot, profile, item) {
  if (!httpsUrl(item.url)) return false;
  if (profile.officialHosts.includes(new URL(item.url).hostname)) return true;
  const knownCik = profile.issuerCik || snapshot.sourceHealth?.sec?.tickers?.[profile.ticker]?.issuerCik;
  if (item.verificationStatus !== 'official-fallback-verified' || !knownCik || String(Number(knownCik)) !== String(Number(item.issuerCik)) || !/^\d{10}-\d{2}-\d{6}$/.test(item.accession || '')) return false;
  const mirror = new URL(item.url);
  const bound = mirror.hostname === 'www.sec.gov' && mirror.pathname.startsWith(`/Archives/edgar/data/${Number(knownCik)}/${item.accession.replace(/-/g, '')}/`);
  if (!bound) return false;
  if (item.sourceKind === 'sec-filing-discovery' && !item.originalSourceUrl) return true;
  return httpsUrl(item.originalSourceUrl) && profile.officialHosts.includes(new URL(item.originalSourceUrl).hostname);
}

export function companyDevelopments(snapshot, ticker, now = new Date()) {
  const profile = profiles.find(item => item.ticker === ticker);
  const cutoff = Math.min(Date.parse(snapshot?.generatedAt || ''), new Date(now).getTime());
  if (!profile || !Number.isFinite(cutoff)) return [];
  const byUrl = new Map();
  if (Date.parse(profile.reviewedAt) <= cutoff) {
    for (const item of profile.sources) {
      if (Date.parse(item.publishedAt) <= cutoff && httpsUrl(item.url) && profile.officialHosts.includes(new URL(item.url).hostname)) {
        byUrl.set(item.url, { ...item, ticker, verificationStatus: 'retained-reviewed', verificationMethod: 'curated-primary-source-review', reviewedAt: profile.reviewedAt, retrievedAt: `${profile.reviewedAt}T00:00:00Z`, archived: new Date(now).getTime() - Date.parse(item.publishedAt) >= 30 * dayMs });
      }
    }
  }
  for (const row of snapshot.observations || []) {
    const item = row.value;
    if (row.source !== 'company-research' || row.type !== 'companyDevelopment' || row.ticker !== ticker || item?.ticker !== ticker ||
      !officialDevelopment(snapshot, profile, item) ||
      !Number.isFinite(Date.parse(item.publishedAt)) || Date.parse(item.publishedAt) > cutoff || !Number.isFinite(Date.parse(row.retrievedAt)) || Date.parse(row.retrievedAt) > cutoff) continue;
    const key = item.originalSourceUrl || item.url;
    const prior = byUrl.get(key);
    if (!prior || row.retrievedAt >= prior.retrievedAt) byUrl.set(key, { ...item, verificationStatus: item.verificationStatus || 'primary-verified', reviewedAt: prior?.reviewedAt, automaticVerifiedAt: row.retrievedAt, retrievedAt: row.retrievedAt, archived: new Date(now).getTime() - Date.parse(item.publishedAt) >= 30 * dayMs });
  }
  return [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function buildCompanyResearch(snapshot = {}, ticker, now = new Date()) {
  const cutoff = Math.min(Date.parse(snapshot.generatedAt || ''), new Date(now).getTime());
  const rows = (snapshot.observations || []).filter(row => row.source === 'sec' && row.ticker === ticker);
  const state = snapshot.sourceHealth?.sec?.tickers?.[ticker];
  const financials = METRICS.flatMap(([type, label, labelZh]) => {
    const fact = rows.filter(row => row.type === type && row.value !== null && row.value !== '' && Number.isFinite(Number(row.value)) &&
      /^(?:[A-Z]{3})(?:\/shares)?$/.test(row.unit || '') && secUrl(row.sourceUrl || row.provenance?.originUrl) &&
      Number.isFinite(Date.parse(row.periodEnd)) && Number.isFinite(Date.parse(row.filedAt)) && Date.parse(row.periodEnd) <= cutoff && Date.parse(row.filedAt) <= cutoff)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || String(b.periodStart || '').localeCompare(String(a.periodStart || '')) || b.filedAt.localeCompare(a.filedAt))[0];
    const detail = state?.factCoverage?.[type] || {};
    return fact ? [{ ...detail, ...fact, ...fieldLabels(type, { conceptLabel: fact.conceptLabel || detail.conceptLabel, conceptLabelZh: fact.conceptLabelZh || detail.conceptLabelZh }), classification: cutoff - Date.parse(fact.periodEnd) > 400 * dayMs ? 'stale-data' : fact.classification || detail.classification || (Number(fact.value) === 0 ? 'reported-zero' : 'verified-standard-tag'), value: Number(fact.value), sourceUrl: fact.sourceUrl || fact.provenance.originUrl }] : [];
  });
  const filingRow = rows.filter(row => row.type === 'filings' && Array.isArray(row.value)).sort((a, b) => String(b.retrievedAt).localeCompare(String(a.retrievedAt)))[0];
  const filings = (filingRow?.value || []).filter(item => Date.parse(item.filed) <= cutoff && secUrl(item.sourceUrl))
    .map(item => ({ form: item.form, filedAt: item.filed, sourceUrl: item.sourceUrl }));
  const lastSuccessAt = state?.lastSuccessAt || (financials.length ? snapshot.sourceHealth?.sec?.lastSuccessAt : null);
  const stale = lastSuccessAt && new Date(now).getTime() - Date.parse(lastSuccessAt) > 7 * dayMs;
  const profile = profiles.find(item => item.ticker === ticker) || null;
  const events = companyDevelopments(snapshot, ticker, now);
  return {
    company: companies.find(item => item.ticker === ticker), financials, filings, events, profile,
    coverage: { status: stale ? 'stale' : state?.status || (financials.length ? snapshot.sourceHealth?.sec?.status || 'partial' : 'missing'), lastSuccessAt,
      missingFields: [...new Set([...(state?.missingFacts || []), ...Object.keys(state?.factCoverage || {}).filter(id => !financials.some(item => item.id === id))])].map(id => fieldLabels(id, { ...(state?.factCoverage?.[id] || {}), classification: state?.factCoverage?.[id]?.classification || 'unavailable' })),
      message: state?.message || null },
    researchCoverage: snapshot.sourceHealth?.['company-research']?.tickers?.[ticker] || { status: events.length ? 'retained' : 'missing' },
  };
}
