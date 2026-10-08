const crypto = require('crypto');

const PROVIDERS = {
  sec: { name: 'U.S. Securities and Exchange Commission', url: 'https://www.sec.gov/edgar/search/', dataClass: 'primary' },
  eia: { name: 'U.S. Energy Information Administration', url: 'https://www.eia.gov/opendata/', dataClass: 'primary' },
  pjm: { name: 'PJM Interconnection', url: 'https://www.pjm.com/', dataClass: 'primary' },
  ferc: { name: 'Federal Energy Regulatory Commission', url: 'https://data.ferc.gov/', dataClass: 'primary' },
  'company-ir': { name: 'Company investor relations', url: null, dataClass: 'primary' },
  prices: { name: 'Stooq market data', url: 'https://stooq.com/', dataClass: 'market' },
  events: { name: 'Verified infrastructure event sources', url: null, dataClass: 'primary' },
  'company-research': { name: 'Verified official company disclosures', url: null, dataClass: 'primary' },
};

function canonical(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, Object.keys(value).sort());
  return String(value);
}

function observationIdentity(item) {
  return [
    item.source,
    item.type,
    item.ticker || '',
    item.region || '',
    item.periodEnd || '',
    item.observedAt || '',
    canonical(item.value),
  ].join('|');
}

function stableObservationId(item) {
  return `obs_${crypto.createHash('sha256').update(observationIdentity(item)).digest('hex').slice(0, 24)}`;
}

function sourceUrlFor(item, provider) {
  if (item.sourceUrl) return item.sourceUrl;
  if (item.value && typeof item.value === 'object' && item.value.url) return item.value.url;
  return provider.url;
}

function attachProvenance(item, defaults = {}) {
  const source = item.source || defaults.source;
  if (!source) throw new Error('Observation provenance requires a source.');
  const retrievedAt = item.retrievedAt || defaults.retrievedAt || new Date().toISOString();
  const observedAt = item.observedAt || item.periodEnd || defaults.observedAt || retrievedAt;
  const provider = PROVIDERS[source] || { name: source, url: null, dataClass: 'external' };
  const normalized = { ...item, source, observedAt, retrievedAt };
  const id = stableObservationId(normalized);
  const originUrl = sourceUrlFor(normalized, provider);
  return {
    ...normalized,
    id,
    observationId: id,
    provenance: {
      observationId: id,
      source,
      provider: normalized.providerName || provider.name,
      dataClass: normalized.providerDataClass || provider.dataClass,
      originUrl,
      observedAt,
      retrievedAt,
      confidence: normalized.confidence === null || normalized.confidence === undefined ? null : Number.isFinite(Number(normalized.confidence)) ? Number(normalized.confidence) : null,
      lineage: [id],
      transformation: 'normalized-observation-v1',
    },
  };
}

function normalizeObservations(source, observations, retrievedAt = new Date().toISOString()) {
  return (observations || []).map(item => attachProvenance(item, { source, retrievedAt }));
}

function provenanceSummary(observations) {
  const rows = observations || [];
  const sources = [...new Set(rows.map(item => item.source).filter(Boolean))].sort();
  const withOrigin = rows.filter(item => item.provenance?.originUrl).length;
  const primary = rows.filter(item => item.provenance?.dataClass === 'primary').length;
  return {
    observationCount: rows.length,
    sources,
    primarySourceRatio: rows.length ? primary / rows.length : 0,
    originUrlCoverage: rows.length ? withOrigin / rows.length : 0,
  };
}

module.exports = { PROVIDERS, stableObservationId, attachProvenance, normalizeObservations, provenanceSummary };
