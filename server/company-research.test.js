const test = require('node:test');
const assert = require('node:assert/strict');
const { ingestCompanyResearch, matchingDate } = require('./company-research');
const profiles = require('../src/data/companyResearch.json');
const companies = require('../src/data/companyExposure.json');
const record = { source: 'Official issuer', title: 'Issuer Announces New AI Capacity', url: 'https://issuer.example/news/capacity', publishedAt: '2026-08-01T00:00:00Z', evidenceText: 'new contracted capacity will be delivered', summary: 'A dated capacity announcement.' };
const profile = { ticker: 'TEST', officialHosts: ['issuer.example'], sources: [record], focus: 'Review delivery.', focusZh: '檢視交付。' };
const page = '<h1>Issuer Announces New AI Capacity</h1><time datetime="2026-08-01"></time><p>new contracted capacity will be delivered</p>';
const deps = { profiles: [profile], now: new Date('2026-10-08T00:00:00Z'), sleep: async () => {}, getText: async () => page };

test('every tracked company has dated official business research in both languages', () => {
  assert.deepEqual(profiles.map(item => item.ticker), companies.map(item => item.ticker));
  for (const item of profiles) {
    assert.ok(item.focus && item.focusZh && item.risks && item.risksZh);
    for (const source of item.sources) {
      assert.equal(new URL(source.url).protocol, 'https:');
      assert.ok(item.officialHosts.includes(new URL(source.url).hostname));
      assert.ok(Number.isFinite(Date.parse(source.publishedAt)) && source.summaryZh && source.evidenceText);
    }
  }
});

test('company evidence verifies title date passage and ticker attribution', async () => {
  const result = await ingestCompanyResearch({ tickers: ['TEST'] }, deps);
  assert.equal(result.status, 'ok');
  assert.equal(result.observations[0].ticker, 'TEST');
  assert.equal(result.observations[0].value.focusZh, profile.focusZh);
  assert.equal(result.tickerOutcomes[0].recordCount, 1);
});

test('missing evidence wrong dates and non-primary hosts are withheld', async () => {
  for (const html of [page.replace('new contracted capacity', 'different claim'), page.replace('2026-08-01', '2026-08-02'), page.replace('Issuer Announces New AI Capacity', 'Another release')]) {
    const result = await ingestCompanyResearch({ tickers: ['TEST'] }, { ...deps, getText: async () => html });
    assert.equal(result.status, 'degraded'); assert.equal(result.observations.length, 0);
  }
  const result = await ingestCompanyResearch({ tickers: ['TEST'] }, { ...deps, profiles: [{ ...profile, sources: [{ ...record, url: 'https://fake.example/news' }] }] });
  assert.equal(result.observations.length, 0);
});

test('failed issuer requests cannot discard successful issuer records', async () => {
  const result = await ingestCompanyResearch({ tickers: ['TEST', 'BAD'] }, { ...deps, profiles: [profile, { ...profile, ticker: 'BAD', sources: [{ ...record, url: 'https://issuer.example/blocked' }] }], getText: async url => { if (url.endsWith('/blocked')) throw Object.assign(new Error('403 Forbidden'), { status: 403 }); return page; } });
  assert.equal(result.status, 'partial'); assert.equal(result.observations.length, 1);
  assert.equal(result.tickerOutcomes.find(item => item.ticker === 'BAD').status, 'degraded');
});

test('future releases are withheld and human-readable dates are checked when structured metadata is missing', async () => {
  assert.ok(matchingDate('<p>August 1, 2026</p>', record));
  assert.equal(matchingDate('<p>August 2, 2026</p>', record), false);
  const result = await ingestCompanyResearch({ tickers: ['TEST'] }, { ...deps, now: new Date('2026-07-01') });
  assert.equal(result.observations.length, 0);
});

test('visible publication dateline can resolve an earlier SEO timestamp, not an arbitrary body date', () => {
  const html = '<meta property="article:published_time" content="2026-07-31 23:12:03"><h1>Issuer Announces New AI Capacity</h1><p>SANTA CLARA, Calif., August 1, 2026 -- Company announcement.</p>';
  assert.equal(matchingDate(html, record), true);
  assert.equal(matchingDate(html.replace('August 1, 2026', 'August 2, 2026'), record), false);
});

const accession = '0000000123-26-000001';
const archiveRoot = 'https://www.sec.gov/Archives/edgar/data/123/000000012326000001';
const secProfile = { ...profile, issuerCik: 123 };
const secDeps = {
  ...deps, profiles: [secProfile],
  getJson: async url => url.includes('/submissions/') ? { cik: 123, filings: { recent: { accessionNumber: [accession], form: ['8-K'], filingDate: ['2026-08-01'], primaryDocument: ['report.htm'] } } } : { directory: { name: '/Archives/edgar/data/123/000000012326000001', item: [{ name: 'ex99-1.htm' }] } },
  getText: async url => { if (url === record.url) throw Object.assign(new Error('403 Forbidden'), { status: 403 }); return page; },
};

test('403 is attempted once and an exact issuer SEC mirror carries effective and original URLs', async () => {
  let attempts = 0;
  const result = await ingestCompanyResearch({ tickers: ['TEST'] }, { ...secDeps, getText: async url => { if (url === record.url) { attempts++; throw Object.assign(new Error('403 Forbidden'), { status: 403 }); } return page; } });
  assert.equal(attempts, 1);
  const value = result.observations[0].value;
  assert.equal(value.originalSourceUrl, record.url);
  assert.equal(value.url, `${archiveRoot}/ex99-1.htm`);
  assert.equal(value.issuerCik, 123); assert.equal(value.accession, accession);
  assert.equal(value.verificationStatus, 'official-fallback-verified');
});

test('all seven denied publisher fixtures recover only through their own verified issuer documents', async () => {
  for (const ticker of ['ORCL', 'IREN', 'AVGO', 'CIFR', 'GDS', 'VNET', 'DLR']) {
    const result = await ingestCompanyResearch({ tickers: [ticker] }, { ...secDeps, profiles: [{ ...secProfile, ticker }] });
    assert.equal(result.observations.length, 1, ticker);
    assert.equal(result.observations[0].ticker, ticker);
  }
});

test('Eaton-style timeout is retried once within the budget then verified with SEC fallback', async () => {
  let calls = 0;
  const result = await ingestCompanyResearch({ tickers: ['TEST'] }, { ...secDeps, getText: async url => {
    if (url === record.url && ++calls <= 2) throw new Error('Timeout'); return page;
  } });
  assert.equal(calls, 2); assert.equal(result.observations.length, 1);
});

test('SEC issuer mismatch and archive mismatch cannot admit another company release', async () => {
  for (const getJson of [async () => ({ cik: 999 }), async url => url.includes('/submissions/') ? await secDeps.getJson(url) : { directory: { name: '/Archives/edgar/data/999/000000012326000001', item: [{ name: 'ex99-1.htm' }] } }]) {
    const result = await ingestCompanyResearch({ tickers: ['TEST'] }, { ...secDeps, getJson });
    assert.equal(result.observations.length, 0);
  }
});

test('SEC title date and evidence must all match the curated release', async () => {
  for (const html of [page.replace('2026-08-01', '2026-08-02'), page.replace('new contracted capacity will be delivered', 'unrelated text'), page.replace('Issuer Announces New AI Capacity', 'Another issuer release')]) {
    const result = await ingestCompanyResearch({ tickers: ['TEST'] }, { ...secDeps, getText: async url => { if (url === record.url) throw Object.assign(new Error('403'), { status: 403 }); return html; } });
    assert.equal(result.observations.length, 0);
  }
});

test('denied originals cool down seven days, SEC fallback still checks daily, and reprobes after cooldown', async () => {
  let attempts = 0; let jsonCalls = 0;
  const priorHealth = { tickers: { TEST: { sourceChecks: [{ originalSourceUrl: record.url, blockedAt: '2026-10-07T00:00:00Z' }] } } };
  const dependencies = { ...secDeps, getJson: async url => { jsonCalls++; return secDeps.getJson(url); }, getText: async url => { if (url === record.url) attempts++; return page; } };
  await ingestCompanyResearch({ tickers: ['TEST'], priorHealth }, dependencies);
  assert.equal(attempts, 0); assert.ok(jsonCalls > 0);
  await ingestCompanyResearch({ tickers: ['TEST'], priorHealth }, { ...dependencies, now: new Date('2026-10-15') });
  assert.equal(attempts, 1);
});

test('failed rechecks classify retained evidence without fresh observations or success timestamps', async () => {
  const previous = { source: 'company-research', ticker: 'TEST', sourceUrl: record.url, value: record, retrievedAt: '2026-10-01T00:00:00Z' };
  const result = await ingestCompanyResearch({ tickers: ['TEST'], previousObservations: [previous] }, { ...deps, getText: async () => { throw Object.assign(new Error('403 Forbidden'), { status: 403 }); } });
  assert.equal(result.observations.length, 0);
  assert.equal(result.tickerOutcomes[0].sourceChecks[0].coverage, 'retained-reviewed');
  assert.equal(result.tickerOutcomes[0].sourceChecks[0].lastSuccessAt, undefined);
  assert.equal(result.tickerOutcomes[0].retryable, false);
  assert.equal(previous.retrievedAt, '2026-10-01T00:00:00Z');
});

test('new official listing articles are admitted once with persistent cursor and original passage', async () => {
  const url = 'https://issuer.example/news/new';
  const html = '<h1>Issuer Announces New AI Cloud Capacity</h1><time datetime="2026-10-01"></time><p>The company announced new AI cloud capacity available for customer deployments.</p>';
  const dependencies = { ...deps, profiles: [{ ...profile, listingUrl: 'https://issuer.example/news' }], getText: async target => target === record.url ? page : target === url ? html : `<a href="${url}">Issuer Announces New AI Cloud Capacity</a>` };
  const first = await ingestCompanyResearch({ tickers: ['TEST'] }, dependencies);
  assert.equal(first.observations.length, 2);
  assert.equal(first.observations[1].value.translationStatus, 'original-language');
  const second = await ingestCompanyResearch({ tickers: ['TEST'], priorHealth: { tickers: { TEST: first.tickerOutcomes[0] } } }, dependencies);
  assert.equal(second.observations.length, 1);
});

test('new issuer SEC filings are discovered incrementally and never attributed from another CIK', async () => {
  const html = '<h1>Issuer Announces New AI Cloud Capacity</h1><time datetime="2026-10-01"></time><p>The company announced new AI cloud capacity available for customer deployments.</p>';
  const dependencies = { ...secDeps, getText: async url => url === record.url ? page : html, getJson: async url => {
    const value = await secDeps.getJson(url); if (value.filings) value.filings.recent.filingDate = ['2026-10-01']; return value;
  } };
  const first = await ingestCompanyResearch({ tickers: ['TEST'] }, dependencies);
  assert.equal(first.observations.length, 2); assert.equal(first.observations[1].value.accession, accession);
  const second = await ingestCompanyResearch({ tickers: ['TEST'], priorHealth: { tickers: { TEST: first.tickerOutcomes[0] } } }, dependencies);
  assert.equal(second.observations.length, 1);
});

test('reporting-period dates in exhibit bodies cannot masquerade as release publication evidence', async () => {
  const html = page.replace('<time datetime="2026-08-01"></time>', '<p>Reporting period ended August 1, 2026.</p>');
  const result = await ingestCompanyResearch({ tickers: ['TEST'] }, { ...secDeps, getText: async url => { if (url === record.url) throw Object.assign(new Error('403'), { status: 403 }); return html; } });
  assert.equal(result.observations.length, 0);
});

test('an official feed can discover an issuer URL but cannot whitelist a syndicated host', async () => {
  const { officialLinks } = require('./company-source-discovery');
  const feed = '<rss><channel><item><title>AI Cloud Capacity</title><link>https://issuer.example/news/ai</link></item><item><title>AI Cloud Capacity</title><link>https://syndicate.example/ai</link></item></channel></rss>';
  assert.deepEqual(officialLinks(feed, 'https://issuer.example/feed', profile.officialHosts), ['https://issuer.example/news/ai']);
});

test('SEC bold release headings are discovered with short attributed excerpts', () => {
  const { developmentFromPage } = require('./company-source-discovery');
  const html = '<p><b>Issuer Announces New AI Cloud Capacity</b></p><p>NEW YORK, October 1, 2026 -- The company announced new AI cloud capacity for customers with delivery plans and several other reported details in this original release.</p>';
  const result = developmentFromPage(html, 'https://www.sec.gov/Archives/release.htm', 'SEC 8-K exhibit', new Date('2026-10-12'));
  assert.ok(result);
  assert.equal(result.summaryKind, 'source-excerpt');
  assert.ok(result.evidenceText.split(/\s+/).length <= 20);
});

test('failed SEC discovery remains eligible for the next refresh', async () => {
  const dependencies = { ...secDeps, getJson: async url => {
    const value = await secDeps.getJson(url); if (value.filings) value.filings.recent.filingDate = ['2026-10-01']; return value;
  }, getText: async url => { if (url === record.url) return page; throw new Error('Timeout'); } };
  const result = await ingestCompanyResearch({ tickers: ['TEST'] }, dependencies);
  assert.deepEqual(result.tickerOutcomes[0].sourceCursor.accessions, []);
  assert.equal(result.tickerOutcomes[0].status, 'partial');
  assert.ok(result.tickerOutcomes[0].discoveryErrors.length);
});
