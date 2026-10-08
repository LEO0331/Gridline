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
