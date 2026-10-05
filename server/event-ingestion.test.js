const test = require('node:test');
const assert = require('node:assert/strict');
const candidates = require('./event-candidates.json');
const { ingestEvents, parsePjmFeed, validCandidate, pageMatchesTitle, pageSupportsEvidence, PJM_FEED } = require('./event-ingestion');
const { PROVIDERS } = require('./event-discovery');

const articleUrl = 'https://insidelines.pjm.com/pjm-updates-large-load-interconnection/';
const feed = `<rss><channel><item><title>PJM Updates Large Load Interconnection Process</title><link>${articleUrl}</link><pubDate>Tue, 22 Sep 2026 14:00:00 GMT</pubDate></item><item><title>PJM Names New Executive</title><link>https://insidelines.pjm.com/executive/</link><pubDate>Tue, 22 Sep 2026 14:00:00 GMT</pubDate></item></channel></rss>`;

test('PJM feed proposes only relevant primary-source articles', () => {
  const items = parsePjmFeed(feed);
  assert.equal(items.length, 1);
  assert.equal(items[0].category, 'GRID');
  assert.equal(items[0].url, articleUrl);
});

test('event admission rejects generic and mismatched links', () => {
  const candidate = parsePjmFeed(feed)[0];
  assert.equal(validCandidate(candidate, new Date('2026-09-23T00:00:00Z')), true);
  assert.equal(validCandidate({ ...candidate, url: 'https://insidelines.pjm.com/' }, new Date('2026-09-23T00:00:00Z')), false);
  assert.equal(validCandidate({ ...candidate, url: 'https://example.com/story' }, new Date('2026-09-23T00:00:00Z')), false);
  assert.equal(pageMatchesTitle('<h1>Unrelated story</h1>', candidate.title), false);
  assert.equal(pageSupportsEvidence('<p>Unrelated content</p>', 'delivery of 850MW additional datacenter capacity'), false);
});

test('curated candidates carry specific primary-source URLs and publication dates', () => {
  assert.equal(candidates.length, 2);
  for (const item of candidates) assert.equal(validCandidate(item, new Date('2026-09-23T00:00:00Z')), true);
});

test('active event candidates exclude the inaccessible Oracle earnings page', () => {
  assert.equal(candidates.some(item => item.url.includes('investor.oracle.com/investor-news/news-details/2026/Oracle-Announces-Q1-Results')), false);
});

test('revised Loudoun candidate requires the current conditional headline and supporting text', async () => {
  const candidate = candidates.find(item => item.url.endsWith('/10874'));
  const result = await ingestEvents({}, {
    providerNames: ['PJM', 'Loudoun'], sleep: async () => {},
    now: new Date('2026-09-29T00:00:00Z'),
    readFile: async () => JSON.stringify([candidate]),
    getText: async url => url === PJM_FEED || url.includes('RSSFeed.aspx') ? '<rss><channel></channel></rss>'
      : `<h1>${candidate.title}</h1><time>${candidate.dateText}</time><p>${candidate.evidenceText}</p>`,
  });
  assert.equal(result.observations.length, 1);
  assert.match(result.observations[0].value.summary, /if approved, could pause/);
});

test('ingestion publishes only a reachable article whose heading matches the feed title', async () => {
  const result = await ingestEvents({}, {
    providerNames: ['PJM'], sleep: async () => {},
    now: new Date('2026-09-23T00:00:00Z'),
    readFile: async () => '[]',
    getText: async url => url === PJM_FEED ? feed : '<h1>PJM Updates Large Load Interconnection Process</h1><time datetime="2026-09-22T14:00:00Z"></time>',
  });
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].sourceUrl, articleUrl);
  assert.equal(result.observations[0].value.title, 'PJM Updates Large Load Interconnection Process');
  assert.equal(result.coverage.scope, 'official-discovery-and-curated-candidates');
  assert.deepEqual([result.coverage.candidateCount, result.coverage.acceptedCount, result.coverage.excludedCount], [1, 1, 0]);
});

test('inaccessible candidate is withheld', async () => {
  const result = await ingestEvents({}, {
    providerNames: ['PJM'], sleep: async () => {},
    now: new Date('2026-09-23T00:00:00Z'),
    readFile: async () => '[]',
    getText: async url => { if (url === PJM_FEED) return feed; throw new Error('403 Forbidden'); },
  });
  assert.equal(result.observations.length, 0);
  assert.match(result.payload.rejected[0].reason, /inaccessible/);
  assert.equal(result.coverage.excludedCount, 1);
  assert.equal(result.coverage.excluded[0].url, articleUrl);
});

test('blocked legacy provider checks cannot prevent an active corporate source from succeeding', async () => {
  const calls = [];
  const oracleUrl = 'https://www.oracle.com/news/announcement/cloud-region/';
  const result = await ingestEvents({}, {
    providerNames: ['PJM', 'Loudoun', 'ERCOT', 'Oracle'],
    now: new Date('2026-10-05T01:00:00Z'), readFile: async () => '[]', sleep: async () => {},
    getText: async url => {
      calls.push(url);
      if (url === PJM_FEED || url.includes('RSSFeed.aspx')) return '<rss><channel></channel></rss>';
      if (url === PROVIDERS.Oracle.endpoints[0].url) return `<li><div>Oct 2, 2026</div><a href="${oracleUrl}">Oracle Opens New Cloud Region</a></li>`;
      if (url === oracleUrl) return '<h1>Oracle Opens New Cloud Region</h1><time datetime="2026-10-02"></time>';
      throw Object.assign(new Error('403 Forbidden'), { status: 403 });
    },
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.observations.length, 1);
  assert.equal(result.coverage.sources.Oracle.discoveryStatus, 'checked');
  assert.equal(result.coverage.sources.Oracle.verificationStatus, 'ok');
  assert.equal(result.coverage.sources.ERCOT.verificationStatus, 'degraded');
  assert.equal(result.coverage.sources.PJM.verificationStatus, 'ok');
  assert.equal(calls.filter(url => url === PROVIDERS.ERCOT.endpoints[0].url).length, 1);
});

test('default discovery never fetches paused sources or Oracle investor candidates', async () => {
  const calls = [];
  const result = await ingestEvents({}, {
    now: new Date('2026-10-05T01:00:00Z'),
    readFile: async () => JSON.stringify([
      parsePjmFeed(feed)[0],
      { source: 'ERCOT', url: 'https://www.ercot.com/news/release?id=old', title: 'Old Large Load Announcement' },
      { source: 'Oracle', url: 'https://investor.oracle.com/investor-news/news-details/2026/old/default.aspx', title: 'Oracle Expands Cloud Region' },
    ]),
    getText: async url => {
      calls.push(url);
      assert.ok(!/ercot\.com|insidelines\.pjm\.com|investor\.oracle\.com/.test(url));
      if (url.includes('RSSFeed.aspx')) return '<rss><channel></channel></rss>';
      return '<a href="/news/announcement/health/">Oracle Health Advances Patient Care</a>';
    },
  });
  assert.deepEqual(Object.keys(result.coverage.sources), ['Loudoun', 'Oracle']);
  assert.equal(calls.length, 2);
  assert.equal(result.coverage.excludedCount, 0);
  assert.equal(result.status, 'ok');
});

test('Loudoun falls back from malformed RSS and verifies canonical article dates', async () => {
  const url = 'https://www.loudoun.gov/m/newsflash/home/detail/123';
  const result = await ingestEvents({}, {
    providerNames: ['Loudoun'], now: new Date('2026-10-05T01:00:00Z'), readFile: async () => '[]',
    getText: async target => target.includes('RSSFeed') ? '<html>Maintenance</html>' : target === url
      ? '<h1>County Approves Data Center Permit</h1><time datetime="2026-10-02"></time>'
      : '<a href="/CivicAlerts.aspx?aid=123">County Approves Data Center Permit</a>',
  });
  assert.equal(result.observations[0].sourceUrl, url);
  assert.equal(result.observations[0].observedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(result.coverage.sources.Loudoun.discoveryStatus, 'checked');
  assert.equal(result.coverage.sources.Loudoun.discoveryErrors.length, 1);
});

test('transient requests honor Retry-After while access denial and exhausted budgets are not retried', async () => {
  let calls = 0;
  const sleeps = [];
  const result = await ingestEvents({}, {
    providerNames: ['PJM'], readFile: async () => '[]', sleep: async ms => sleeps.push(ms),
    getText: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('429 Too Many Requests'), { status: 429, retryAfterMs: 1500 });
      return '<rss><channel></channel></rss>';
    },
  });
  assert.equal(result.status, 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1500]);
  const blocked = await ingestEvents({}, {
    providerNames: ['PJM'], readFile: async () => '[]', budgetMs: 100, sleep: async () => assert.fail('Budget must not be exceeded'),
    getText: async () => { throw Object.assign(new Error('429 Too Many Requests'), { status: 429, retryAfterMs: 1000 }); },
  });
  assert.equal(blocked.status, 'degraded');
  assert.equal(blocked.coverage.sources.PJM.discoveryStatus, 'unavailable');
});

test('URL duplicates are fetched once and article publication prevails over a feed revision date', async () => {
  let articleCalls = 0;
  const result = await ingestEvents({}, {
    providerNames: ['PJM'], now: new Date('2026-09-23T00:00:00Z'), readFile: async () => JSON.stringify([parsePjmFeed(feed)[0]]),
    getText: async url => {
      if (url === PJM_FEED) return feed;
      articleCalls += 1;
      return '<h1>PJM Updates Large Load Interconnection Process</h1><time datetime="2026-09-21"></time>';
    },
  });
  assert.equal(articleCalls, 1);
  assert.equal(result.observations.length, 1);
  assert.equal(result.coverage.duplicateCount, 1);
  assert.equal(result.observations[0].observedAt, '2026-09-21T00:00:00.000Z');
});

test('undated and future-dated articles are excluded without inventing publication dates', async () => {
  for (const articleDate of ['', '<time datetime="2026-09-24"></time>']) {
    const result = await ingestEvents({}, {
      providerNames: ['PJM'], now: new Date('2026-09-23T00:00:00Z'), readFile: async () => '[]',
      getText: async url => url === PJM_FEED ? feed : `<h1>PJM Updates Large Load Interconnection Process</h1>${articleDate}<p>Next meeting is September 30, 2026.</p>`,
    });
    assert.equal(result.status, 'partial');
    assert.equal(result.observations.length, 0);
    assert.equal(result.coverage.excludedCount, 1);
  }
});

test('candidate caps disclose incomplete verification instead of reporting healthy', async () => {
  const items = Array.from({ length: 13 }, (_, index) => `<item><title>PJM Large Load Update ${index}</title><link>https://insidelines.pjm.com/update-${index}/</link><pubDate>Tue, 22 Sep 2026 14:00:00 GMT</pubDate></item>`).join('');
  const result = await ingestEvents({}, {
    providerNames: ['PJM'], now: new Date('2026-09-23T00:00:00Z'), readFile: async () => '[]',
    getText: async url => url === PJM_FEED ? `<rss><channel>${items}</channel></rss>` : `<h1>PJM Large Load Update ${url.match(/update-(\d+)/)[1]}</h1><time datetime="2026-09-22"></time>`,
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.observations.length, 12);
  assert.equal(result.coverage.sources.PJM.omittedCandidateCount, 1);
});
