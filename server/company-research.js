const profiles = require('../src/data/companyResearch.json');
const { getText } = require('./http');
const { plain, articlePublicationDate } = require('./event-discovery');
const { pageMatchesTitle, pageSupportsEvidence, sourceReader } = require('./event-ingestion');
const { secFilings, secDocuments, developmentFromPage, officialLinks, hasPublicationEvidence } = require('./company-source-discovery');

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
  if (extracted?.slice(0, 10) === expected) return true;
  // Publisher SEO timestamps can precede the visible release dateline (e.g. Arista).
  // Only accept a conflicting date when the first dateline near the exact headline confirms it.
  if (extracted) {
    const heading = [...String(html).matchAll(/<h([1-3])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi)]
      .find(match => plain(match[2]).toLowerCase().includes(record.title.toLowerCase()));
    const nearHeadline = heading ? plain(html.slice(heading.index + heading[0].length)).slice(0, 2000) : '';
    const dateline = nearHeadline.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}\b/i)?.[0];
    return Boolean(dateline && new Date(`${dateline} UTC`).toISOString().slice(0, 10) === expected);
  }
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
    const discoveryErrors = []; const sourceChecks = [];
    const prior = config.priorHealth?.tickers?.[ticker] || config.priorHealth?.tickerOutcomes?.find(item => item.ticker === ticker) || {};
    const seenUrls = new Set(prior.sourceCursor?.urls || []);
    const seenAccessions = new Set(prior.sourceCursor?.accessions || []);
    for (const item of config.previousObservations || []) if (item.ticker === ticker && item.source === 'company-research') seenUrls.add(item.sourceUrl || item.value?.url);
    let count = 0;
    const deadline = Date.now() + (dependencies.budgetMs || 45000);
    const headers = { 'User-Agent': config.secUserAgent || 'Gridline company research https://github.com/LEO0331/Gridline', Accept: 'text/html' };
    const fetchPage = sourceReader(read, headers, deadline, dependencies.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))), 4 * 1024 * 1024);
    const readJson = dependencies.getJson ? async url => {
      if (Date.now() >= deadline) throw new Error('Provider request budget exhausted');
      return dependencies.getJson(url, headers, { timeoutMs: Math.min(10000, deadline - Date.now()), maxBytes: 4 * 1024 * 1024 });
    } : async url => JSON.parse(await fetchPage(url));
    let filings;
    const getFilings = async () => {
      if (!profile?.issuerCik) return [];
      if (!filings) filings = await readJson(`https://data.sec.gov/submissions/CIK${String(profile.issuerCik).padStart(10, '0')}.json`).then(value => secFilings(value, profile.issuerCik, now));
      return filings;
    };
    const accept = (record, verificationStatus, identity = {}) => {
      const value = { ...record, ticker, focus: profile.focus, focusZh: profile.focusZh, risks: profile.risks, risksZh: profile.risksZh, verificationStatus, ...identity };
      observations.push({ source: 'company-research', type: 'companyDevelopment', ticker, value, observedAt: record.publishedAt, retrievedAt: now.toISOString(), sourceUrl: record.url });
      count += 1; seenUrls.add(record.url);
      payload.push({ ticker, url: record.url, verifiedAt: now.toISOString() });
    };
    const verify = (html, record) => {
      if (!pageMatchesTitle(html, record.title) && !pageSupportsEvidence(html, record.title)) throw new Error('record title mismatch');
      if (!pageSupportsEvidence(html, record.evidenceText)) throw new Error('supporting text missing');
      if (!matchingDate(html, record)) throw new Error('publication date missing or mismatch');
    };
    for (const record of records) {
      let originalError;
      try {
        if (!allowedSource(profile, record) || !Number.isFinite(Date.parse(record.publishedAt)) || Date.parse(record.publishedAt) > now.getTime() || !record.evidenceText || record.evidenceText.length < 12) throw new Error('invalid official source metadata');
        const previousCheck = prior.sourceChecks?.find(check => check.originalSourceUrl === record.url && check.blockedAt);
        const previous403 = prior.errors?.find(error => error.url === record.url && /\b403\b/.test(error.message || ''));
        const blockedAt = previousCheck?.blockedAt || (previous403 ? prior.checkedAt : null);
        if (blockedAt && now.getTime() - Date.parse(blockedAt) < 7 * 86400000) throw Object.assign(new Error('403 access-denial cooldown'), { status: 403, blockedAt });
        const html = await fetchPage(record.url);
        verify(html, record); accept(record, 'primary-verified');
        sourceChecks.push({ originalSourceUrl: record.url, effectiveSourceUrl: record.url, coverage: 'primary-verified', checkedAt: now.toISOString(), lastSuccessAt: now.toISOString() });
        continue;
      } catch (error) { originalError = error; }
      let fallback;
      // Invalid curated metadata is never rescued by a coincidental SEC text match.
      if (allowedSource(profile, record) && Date.parse(record.publishedAt) <= now.getTime() && record.evidenceText?.length >= 12) {
        try {
          const candidates = (await getFilings()).filter(item => Math.abs(Date.parse(item.filedAt) - Date.parse(record.publishedAt)) <= 7 * 86400000).slice(0, 2);
          for (const filing of candidates) {
            for (const document of await secDocuments(filing, profile.issuerCik, readJson)) {
              try { const html = await fetchPage(document.url); if (!pageSupportsEvidence(html, record.title)) throw new Error('exact record title missing'); if (!hasPublicationEvidence(html, record)) throw new Error('publication evidence missing'); verify(html, record); fallback = document; break; } catch { /* A different release is not a valid mirror. */ }
            }
            if (fallback) break;
          }
        } catch (error) { discoveryErrors.push({ source: 'sec-fallback', message: error.message }); }
      }
      const denied = originalError.status === 403 || /\b403\b/.test(originalError.message);
      const retained = Boolean(profile.reviewedAt && Date.parse(profile.reviewedAt) <= now.getTime()) || (config.previousObservations || []).some(item => item.ticker === ticker && (item.value?.originalSourceUrl || item.value?.url || item.sourceUrl) === record.url);
      const previousCheck = prior.sourceChecks?.find(check => check.originalSourceUrl === record.url);
      const check = { originalSourceUrl: record.url, effectiveSourceUrl: fallback?.url || null, coverage: fallback ? 'official-fallback-verified' : retained ? 'retained-reviewed' : 'unavailable', checkedAt: now.toISOString(), lastError: originalError.message, ...(previousCheck?.lastSuccessAt ? { lastSuccessAt: previousCheck.lastSuccessAt } : {}), ...(denied ? { blockedAt: originalError.blockedAt || now.toISOString() } : {}) };
      if (fallback) {
        accept({ ...record, url: fallback.url, source: `SEC ${fallback.form} exhibit` }, 'official-fallback-verified', { sourceKind: 'sec-mirror', originalSourceUrl: record.url, issuerCik: fallback.cik, accession: fallback.accession });
        check.lastSuccessAt = now.toISOString();
      } else errors.push({ url: record.url, message: originalError.message, retryable: !denied && !/metadata|mismatch|missing/.test(originalError.message) });
      sourceChecks.push(check);
    }
    // Discover a bounded number of newly seen official articles, then issuer-owned filings.
    if (profile?.listingUrl && allowedSource(profile, { url: profile.listingUrl })) {
      const listingDenied = prior.discoveryErrors?.find(error => error.url === profile.listingUrl && /403/.test(error.message));
      const cooldown = listingDenied && now.getTime() - Date.parse(listingDenied.blockedAt || prior.checkedAt) < 7 * 86400000;
      try {
        if (cooldown) throw Object.assign(new Error('403 listing access-denial cooldown'), { blockedAt: listingDenied.blockedAt || prior.checkedAt });
        const listing = await fetchPage(profile.listingUrl);
        const links = officialLinks(listing, profile.listingUrl, profile.officialHosts).filter(url => !seenUrls.has(url) && !records.some(record => record.url === url)).slice(0, 3);
        for (const url of links) {
          const record = developmentFromPage(await fetchPage(url), url, `${ticker} official newsroom`, now);
          if (record && Date.parse(record.publishedAt) >= now.getTime() - 90 * 86400000) { verify(await fetchPage(url), record); accept(record, 'primary-verified'); }
        }
      } catch (error) { discoveryErrors.push({ url: profile.listingUrl, message: error.message, ...(/403/.test(error.message) ? { blockedAt: error.blockedAt || now.toISOString() } : {}) }); }
    }
    try {
      const newFilings = (await getFilings()).filter(item => !seenAccessions.has(item.accession) && Date.parse(item.filedAt) >= now.getTime() - 45 * 86400000).slice(0, 2);
      for (const filing of newFilings) {
        let checked = true;
        for (const document of await secDocuments(filing, profile.issuerCik, readJson)) {
          try {
          const html = await fetchPage(document.url);
          const record = developmentFromPage(html, document.url, `SEC ${filing.form} exhibit`, now);
          if (record && Math.abs(Date.parse(record.publishedAt) - Date.parse(filing.filedAt)) <= 7 * 86400000 && !seenUrls.has(record.url)) {
            verify(html, record); accept(record, 'official-fallback-verified', { sourceKind: 'sec-filing-discovery', issuerCik: document.cik, accession: document.accession });
          }
          } catch (error) { checked = false; discoveryErrors.push({ source: 'sec-discovery', url: document.url, message: error.message }); }
        }
        if (checked) seenAccessions.add(filing.accession);
      }
    } catch (error) { discoveryErrors.push({ source: 'sec-discovery', message: error.message }); }
    tickerOutcomes.push({ ticker, status: count && !errors.length && !discoveryErrors.length ? 'ok' : count ? 'partial' : 'degraded', recordCount: count, errors,
      checkedAt: now.toISOString(), retryable: errors.some(error => error.retryable), sourceChecks, discoveryErrors,
      sourceCursor: { urls: [...seenUrls].slice(-200), accessions: [...seenAccessions].slice(-200) },
      message: records.length ? `${count}/${records.length} configured official company records verified${errors.length ? '; limited source access or evidence' : ''}.` : 'No official company sources configured.' });
    }));
  }
  const successful = tickerOutcomes.filter(item => item.status === 'ok').length;
  return { observations, payload, tickerOutcomes, status: successful === tickerOutcomes.length ? 'ok' : observations.length ? 'partial' : 'degraded',
    message: `${successful}/${tickerOutcomes.length} companies have all configured research sources verified.` };
}

module.exports = { ingestCompanyResearch, allowedSource, matchingDate };
