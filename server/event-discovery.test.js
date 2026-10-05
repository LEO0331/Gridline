const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRss, parseListing, validArticleUrl, canonicalUrl, articlePublicationDate } = require('./event-discovery');

test('Loudoun RSS discovers relevant permits and rejects malformed responses', () => {
  const items = parseRss('<rss><channel><item><title>County Approves Data Center Permit</title><link>https://www.loudoun.gov/CivicAlerts.aspx?AID=123</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>', 'Loudoun');
  assert.equal(items[0].category, 'PERMIT');
  assert.equal(items[0].region, 'Northern Virginia');
  assert.throws(() => parseRss('<html>Access denied</html>', 'Loudoun'), /Unrecognized RSS/);
});

test('listings discover only specific official articles and relevant titles', () => {
  const items = parseListing('<table><tr><td>10/01/2026</td><td><a href="/news/release?id=abc-123">ERCOT Releases Long-Term Load Forecast</a></td></tr><tr><td><a href="/news/release?id=other">ERCOT Launches Podcast</a></td></tr></table>', 'ERCOT', 'https://www.ercot.com/news/releases');
  assert.equal(items.length, 1);
  assert.equal(items[0].publishedAt.slice(0, 10), '2026-10-01');
  assert.equal(validArticleUrl('ERCOT', items[0].url), true);
  assert.equal(validArticleUrl('ERCOT', 'https://www.ercot.com/news/release'), false);
  assert.equal(validArticleUrl('Loudoun', 'https://www.loudoun.gov/CivicAlerts.aspx?CID=10'), false);
  assert.throws(() => parseListing('<html><h1>Please enable JavaScript</h1></html>', 'Oracle', 'https://www.oracle.com/news/'), /Unrecognized listing/);
});

test('Oracle discovery preserves corporate title/date without admitting unrelated announcements', () => {
  const items = parseListing('<li><div>Oct 2, 2026</div><h3><a href="/news/announcement/energy-2026-10-02/">Oracle Announces Commitment to Absorb Rising Energy Costs</a></h3></li><li><a href="/news/announcement/health/">Oracle Health Advances Patient Care</a></li>', 'Oracle', 'https://www.oracle.com/news/');
  assert.equal(items.length, 1);
  assert.equal(items[0].category, 'POWER');
  assert.equal(items[0].publishedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(validArticleUrl('Oracle', 'https://attacker.example/news/announcement/energy/'), false);
});

test('canonicalization removes tracking and normalizes Loudoun detail paths', () => {
  assert.equal(canonicalUrl('/m/newsflash/Home/Detail/10876?utm_source=rss#top', 'https://www.loudoun.gov'), 'https://www.loudoun.gov/m/newsflash/home/detail/10876');
});

test('publication evidence ignores update metadata and navigation dates', () => {
  assert.equal(articlePublicationDate('<meta name="Updated Date" content="2026-10-05"><nav>Oct 5, 2026</nav><h1>Article</h1><div>Austin, Texas&mdash;Oct 2, 2026</div></main>'), '2026-10-02T00:00:00.000Z');
  assert.equal(articlePublicationDate('<meta content="2026-10-02T12:00:00Z" property="article:published_time">'), '2026-10-02T12:00:00.000Z');
  assert.equal(articlePublicationDate('<nav>Oct 5, 2026</nav><h1>Article</h1><p>No date</p>'), null);
});

test('alternative publishers keep their own identity and reject unrelated domains and index URLs', () => {
  assert.equal(validArticleUrl('Oracle OCI Blog', 'https://blogs.oracle.com/cloud-infrastructure/oracle-alloy-reserved-regions'), true);
  assert.equal(validArticleUrl('Oracle OCI Blog', 'https://blogs.oracle.com/cloud-infrastructure/category/regions'), false);
  assert.equal(validArticleUrl('Oracle OCI Blog', 'https://blogs.oracle.com/cloud-infrastructure/feed'), false);
  assert.equal(validArticleUrl('Texas Governor', 'https://gov.texas.gov/news/post/data-center-policy'), true);
  assert.equal(validArticleUrl('Texas Governor', 'https://www.ercot.com/news/release/related'), false);
  assert.equal(validArticleUrl('FERC', 'https://www.ferc.gov/news-events/news/large-load-integration'), true);
  assert.equal(validArticleUrl('FERC', 'https://www.ferc.gov/news-events/news/news-releases-headlines'), false);
});

test('OCI feed selects region announcements without classifying technical region tutorials as events', () => {
  const xml = '<rss><channel><item><title>Announcing Oracle Alloy Reserved Regions</title><link>https://blogs.oracle.com/cloud-infrastructure/oracle-alloy-reserved-regions</link><pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate></item><item><title>Best Practices for Resilient Architectures Across Regions</title><link>https://blogs.oracle.com/cloud-infrastructure/technical-guide</link></item></channel></rss>';
  const items = parseRss(xml, 'Oracle OCI Blog');
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'Oracle OCI Blog');
  assert.equal(items[0].category, 'CAPEX');
});

test('alternative listing admission uses publisher date fields rather than dates in body text', () => {
  assert.equal(articlePublicationDate('<meta name="publish_date" content="August 31, 2026"><h1>OCI launch</h1>'), '2026-08-31T00:00:00.000Z');
  assert.equal(articlePublicationDate('<h1>Governor policy</h1><p class="meta">September 21, 2026 | Austin, Texas</p><p>On September 14 he announced another policy.</p>', 'Texas Governor'), '2026-09-21T00:00:00.000Z');
  assert.equal(articlePublicationDate('<h1>Governor policy</h1><p>On September 14, 2026 he announced another policy.</p>', 'Texas Governor'), null);
});
