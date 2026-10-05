const fs = require('fs/promises');
const path = require('path');
const { getText } = require('./http');
const { PROVIDERS, ACTIVE_PROVIDERS, plain, categoryFor, validArticleUrl, canonicalUrl, articlePublicationDate, parseRss, parseListing } = require('./event-discovery');

const PJM_FEED = PROVIDERS.PJM.endpoints[0].url;
const CANDIDATES_FILE = path.join(__dirname, 'event-candidates.json');
const CATEGORIES = new Set(['POWER', 'GRID', 'PERMIT', 'CAPEX']);
const SOURCE_BUDGET_MS = 75000;
const MAX_CANDIDATES = 12;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function validCandidate(item, now = new Date()) {
  if (!item || !CATEGORIES.has(item.category) || typeof item.title !== 'string' || item.title.trim().length < 12 || !item.region) return false;
  if (item.summary && (typeof item.summary !== 'string' || typeof item.evidenceText !== 'string' || item.evidenceText.length < 12 || typeof item.dateText !== 'string')) return false;
  const date = Date.parse(item.publishedAt);
  if (!Number.isFinite(date) || date > now.getTime()) return false;
  if (item.dateText && (!Number.isFinite(Date.parse(`${item.dateText} UTC`)) || new Date(`${item.dateText} UTC`).toISOString().slice(0, 10) !== String(item.publishedAt).slice(0, 10))) return false;
  return validArticleUrl(item.source, item.url);
}

function pageMatchesTitle(html, title) {
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const expected = normalize(title);
  const headings = [...String(html).matchAll(/<h([1-3])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi)].map(match => plain(match[2]));
  const pageTitle = plain(html.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]);
  return expected.length >= 12 && [...headings, pageTitle].some(heading => {
    const actual = normalize(heading);
    return actual.includes(expected) || (expected.includes(actual) && actual.length >= 12);
  });
}

function pageSupportsEvidence(html, evidenceText) {
  if (!evidenceText) return true;
  const normalize = value => plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return normalize(html).includes(normalize(evidenceText));
}

function sourceReader(read, headers, deadline, sleep, maxBytes = 2 * 1024 * 1024) {
  const cache = new Map();
  return async url => {
    if (cache.has(url)) return cache.get(url);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Provider request budget exhausted');
      try {
        const html = await read(url, headers, { timeoutMs: Math.min(10000, remaining), maxBytes });
        cache.set(url, html);
        return html;
      } catch (error) {
        const status = error.status || Number(error.message.match(/^(\d{3})\b/)?.[1]);
        // Never retry access denial or missing pages. Respect Retry-After within the budget.
        const transient = !status || status === 429 || status >= 500;
        const delay = Math.max(500, error.retryAfterMs || 0);
        if (!transient || attempt === 1 || delay >= deadline - Date.now()) throw error;
        await sleep(delay);
      }
    }
    throw new Error('Provider request failed');
  };
}

async function checkProvider(source, curated, now, read, headers, dependencies) {
  const provider = PROVIDERS[source];
  const fetchPage = sourceReader(read, headers, Date.now() + (dependencies.budgetMs || SOURCE_BUDGET_MS), dependencies.sleep || wait, provider.maxResponseBytes);
  const discoveryErrors = [];
  let discovered = [];
  let checkedEndpoints = 0;
  let endpoint = null;
  for (const target of provider.endpoints) {
    try {
      const body = await fetchPage(target.url);
      const candidates = target.format === 'rss' ? parseRss(body, source) : parseListing(body, source, target.url);
      discovered.push(...candidates);
      checkedEndpoints += 1;
      endpoint = target.url;
      break;
    } catch (error) { discoveryErrors.push({ url: target.url, message: error.message }); }
  }
  const unique = new Map();
  for (const item of [...discovered, ...curated.filter(item => item.source === source)]) {
    let url = item.url;
    try { url = canonicalUrl(url); } catch { /* Admission below reports invalid URLs. */ }
    // Curated evidence takes precedence when the same URL occurs in a feed.
    unique.set(url, { ...item, url });
  }
  const truncated = unique.size > MAX_CANDIDATES;
  const accepted = [];
  const rejected = [];
  const candidates = [...unique.values()].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))).slice(0, MAX_CANDIDATES);
  for (const item of candidates) {
    if (!validArticleUrl(source, item.url)) { rejected.push({ source, title: item.title || '', reason: 'invalid metadata or non-primary URL' }); continue; }
    try {
      const html = await fetchPage(item.url);
      if (!pageMatchesTitle(html, item.title)) throw new Error('record title mismatch');
      if (!pageSupportsEvidence(html, item.evidenceText)) throw new Error('supporting text missing');
      const publishedAt = articlePublicationDate(html, source);
      if (item.dateText) {
        if (!pageSupportsEvidence(html, item.dateText)) throw new Error('publication date missing');
      } else {
        if (!publishedAt) throw new Error('publication date missing');
      }
      // Some feeds publish the revision date; the article's publication evidence prevails.
      const verified = { ...item, publishedAt: item.dateText ? item.publishedAt : publishedAt };
      if (!validCandidate(verified, now)) throw new Error('invalid metadata or non-primary URL');
      accepted.push(verified);
    } catch (error) {
      const reason = /^(record title mismatch|supporting text missing|publication date (?:missing|mismatch)|invalid metadata)/.test(error.message) ? error.message : `record inaccessible: ${error.message}`;
      rejected.push({ source, title: item.title || '', url: item.url, reason });
    }
  }
  const discoveryStatus = checkedEndpoints ? 'checked' : 'unavailable';
  const verificationStatus = !checkedEndpoints && !accepted.length ? 'degraded' : rejected.length || truncated ? 'partial' : 'ok';
  return {
    accepted, rejected,
    health: {
      discoveryStatus, verificationStatus, checkedAt: now.toISOString(), endpoint,
      candidateCount: unique.size, acceptedCount: accepted.length, excludedCount: rejected.length,
      duplicateCount: discovered.length + curated.filter(item => item.source === source).length - unique.size,
      truncated, omittedCandidateCount: Math.max(0, unique.size - MAX_CANDIDATES), discoveryErrors,
      ...(verificationStatus === 'ok' && discoveryStatus === 'checked' ? { lastSuccessAt: now.toISOString() } : {}),
    },
  };
}

async function ingestEvents(config = {}, dependencies = {}) {
  const read = dependencies.getText || getText;
  const readFile = dependencies.readFile || (file => fs.readFile(file, 'utf8'));
  const now = dependencies.now || new Date();
  const headers = { 'User-Agent': config.secUserAgent || 'Gridline event research dashboard', Accept: 'application/rss+xml, application/xml, text/html' };
  let curated = [];
  try { curated = JSON.parse(await readFile(CANDIDATES_FILE)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(curated)) throw new Error('Event candidates must be a JSON array.');
  curated = curated.filter(item => item.source !== 'Oracle' || !/^https:\/\/investor\.oracle\.com(?:\/|$)/i.test(item.url || ''));
  const names = dependencies.providerNames || ACTIVE_PROVIDERS;
  // Providers run independently; each host has sequential requests and a bounded budget.
  const results = await Promise.all(names.map(source => checkProvider(source, curated, now, read, headers, dependencies)));
  const sources = Object.fromEntries(names.map((name, index) => [name, results[index].health]));
  const accepted = results.flatMap(result => result.accepted);
  const rejected = results.flatMap(result => result.rejected);
  const states = Object.values(sources);
  const limited = states.filter(item => item.verificationStatus !== 'ok' || item.discoveryStatus !== 'checked');
  const status = states.every(item => item.verificationStatus === 'degraded') ? 'degraded' : limited.length ? 'partial' : 'ok';
  const feedStatus = states.every(item => item.discoveryStatus === 'unavailable') ? 'unavailable' : states.some(item => item.discoveryStatus !== 'checked') ? 'partial' : 'checked';
  return {
    status,
    payload: { discovered: states.reduce((sum, item) => sum + item.candidateCount, 0), accepted: accepted.length, rejected, sources },
    coverage: {
      scope: 'official-discovery-and-curated-candidates', feedStatus, sources,
      candidateCount: states.reduce((sum, item) => sum + item.candidateCount, 0), acceptedCount: accepted.length, excludedCount: rejected.length,
      duplicateCount: states.reduce((sum, item) => sum + item.duplicateCount, 0),
      excluded: rejected.slice(0, 20), excludedOmittedCount: Math.max(0, rejected.length - 20),
    },
    observations: accepted.map(item => ({ source: 'events', type: 'infrastructureEvent', value: item, observedAt: item.publishedAt, retrievedAt: now.toISOString(), sourceUrl: item.url, region: item.region })),
    message: `${accepted.length} verified infrastructure event records; ${rejected.length} rejected; ${limited.length}/${states.length} provider checks limited`,
  };
}

module.exports = { ingestEvents, parsePjmFeed: xml => parseRss(xml, 'PJM'), validCandidate, pageMatchesTitle, pageSupportsEvidence, categoryFor, PJM_FEED };
