const profiles = require('../src/data/companyResearch.json');
const { getText } = require('./http');
const { plain, articlePublicationDate } = require('./event-discovery');
const { pageMatchesTitle, pageSupportsEvidence, sourceReader } = require('./event-ingestion');

function allowedSource(profile, record) {
  try {
    const url = new URL(record.url);
    return url.protocol === 'https:' && !url.username && !url.password &&
      profile.officialHosts.includes(url.hostname) && !/\.pdf$/i.test(url.pathname);
  } catch { return false; }
}

function matchingDate(html, record) {
  const extracted = articlePublicationDate(html, record.source);
  const expected = record.publishedAt.slice(0, 10);
  if (extracted) return extracted.slice(0, 10) === expected;
  const date = new Date(record.publishedAt);
  const full = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const short = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const month = date.getUTCMonth() + 1; const day = date.getUTCDate(); const year = date.getUTCFullYear();
  const normalize = value => plain(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const body = normalize(html);
  return [full, short, expected, `${month}/${day}/${year}`, `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`]
    .some(value => body.includes(normalize(value)));
}

async function ingestCompanyResearch(config = {}, dependencies = {}) {
  const registry = dependencies.profiles || profiles;
  const now = dependencies.now || new Date();
  const observations = []; const tickerOutcomes = []; const payload = [];
  const read = dependencies.getText || getText;
  const tickers = config.tickers || registry.map(profile => profile.ticker);
  for (let offset = 0; offset < tickers.length; offset += 3) {
    await Promise.all(tickers.slice(offset, offset + 3).map(async ticker => {
    const profile = registry.find(item => item.ticker === ticker);
    const records = profile?.sources || [];
    const errors = [];
    let count = 0;
    const fetchPage = sourceReader(read, { 'User-Agent': config.secUserAgent || 'Gridline company research https://github.com/LEO0331/Gridline', Accept: 'text/html' }, Date.now() + (dependencies.budgetMs || 12000), dependencies.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))), 4 * 1024 * 1024);
    for (const record of records) {
      try {
        if (!allowedSource(profile, record) || !Number.isFinite(Date.parse(record.publishedAt)) || Date.parse(record.publishedAt) > now.getTime() || !record.evidenceText || record.evidenceText.length < 12) throw new Error('invalid official source metadata');
        const html = await fetchPage(record.url);
        if (!pageMatchesTitle(html, record.title) && !pageSupportsEvidence(html, record.title)) throw new Error('record title mismatch');
        if (!pageSupportsEvidence(html, record.evidenceText)) throw new Error('supporting text missing');
        if (!matchingDate(html, record)) throw new Error('publication date missing or mismatch');
        const value = { ...record, ticker, focus: profile.focus, focusZh: profile.focusZh, risks: profile.risks, risksZh: profile.risksZh };
        observations.push({ source: 'company-research', type: 'companyDevelopment', ticker, value, observedAt: record.publishedAt, retrievedAt: now.toISOString(), sourceUrl: record.url });
        count += 1;
        payload.push({ ticker, url: record.url, verifiedAt: now.toISOString() });
      } catch (error) { errors.push({ url: record.url, message: error.message }); }
    }
    tickerOutcomes.push({ ticker, status: count && !errors.length ? 'ok' : count ? 'partial' : 'degraded', recordCount: count, errors,
      message: records.length ? `${count}/${records.length} configured official company records verified${errors.length ? '; limited source access or evidence' : ''}.` : 'No official company sources configured.' });
    }));
  }
  const successful = tickerOutcomes.filter(item => item.status === 'ok').length;
  return { observations, payload, tickerOutcomes, status: successful === tickerOutcomes.length ? 'ok' : observations.length ? 'partial' : 'degraded',
    message: `${successful}/${tickerOutcomes.length} companies have all configured research sources verified.` };
}

module.exports = { ingestCompanyResearch, allowedSource, matchingDate };
