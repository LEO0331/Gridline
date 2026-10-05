const PROVIDERS = {
  PJM: { region: 'PJM region', hosts: ['insidelines.pjm.com'], paths: [/^\/.+\/$/], endpoints: [{ url: 'https://insidelines.pjm.com/feed/', format: 'rss' }] },
  Loudoun: {
    region: 'Northern Virginia', hosts: ['www.loudoun.gov'], paths: [/^\/CivicAlerts\.aspx$/i, /^\/m\/newsflash\/home\/detail\/\d+$/i],
    endpoints: [{ url: 'https://www.loudoun.gov/RSSFeed.aspx?ModID=1&CID=County-News-10', format: 'rss' }, { url: 'https://www.loudoun.gov/CivicAlerts.aspx?CID=10', format: 'html' }],
  },
  ERCOT: {
    region: 'Texas', hosts: ['www.ercot.com'], paths: [/^\/news\/release(?:\/|$)/, /^\/services\/comm\/mkt_notices\/[A-Z]-[A-Z0-9-]+$/i],
    endpoints: [{ url: 'https://www.ercot.com/news/releases', format: 'html' }, { url: 'https://www.ercot.com/services/comm/mkt_notices/archives', format: 'html' }],
  },
  Oracle: {
    region: 'All regions', hosts: ['www.oracle.com'], paths: [/^\/news\/announcement\/.+\/$/],
    endpoints: [{ url: 'https://www.oracle.com/news/', format: 'html' }],
  },
};
// Retain legacy provider parsers for historical records; only these sources are fetched.
const ACTIVE_PROVIDERS = ['Loudoun', 'Oracle'];

function plain(value) {
  return String(value || '').replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp|mdash|ndash);/gi, token => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–' })[token.toLowerCase()])
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function categoryFor(title) {
  if (/data cent(?:er|re)|substation/i.test(title) && /permit|application|zon(?:ing|e)|den(?:y|ies|ied)|approv|pause/i.test(title)) return 'PERMIT';
  if (/interconnection|transmission|large (?:load|electricity user)|data cent(?:er|re)|grid reliability/i.test(title)) return 'GRID';
  if (/load forecast|electricity demand|generation|capacity auction|resource adequacy|power capacity|energy costs/i.test(title)) return 'POWER';
  if (/capital expenditure|capex|cloud region|cloud infrastructure.*(?:expand|invest)|(?:expand|invest).*cloud infrastructure/i.test(title)) return 'CAPEX';
  return null;
}

function attribute(tag, name) {
  return plain(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]);
}

function validArticleUrl(source, value) {
  try {
    const url = new URL(value);
    const provider = PROVIDERS[source];
    if (!provider || url.protocol !== 'https:' || url.username || url.password || !provider.hosts.includes(url.hostname)) return false;
    if (source === 'Loudoun' && /^\/CivicAlerts\.aspx$/i.test(url.pathname)) return /^\d+$/.test(url.searchParams.get('AID') || '');
    if (source === 'ERCOT' && url.pathname === '/news/release') return /^[a-z0-9-]+$/i.test(url.searchParams.get('id') || '');
    return provider.paths.some(pattern => pattern.test(url.pathname));
  } catch { return false; }
}

function canonicalUrl(value, base) {
  const url = new URL(plain(value), base);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  if (url.hostname === 'www.loudoun.gov' && /^\/CivicAlerts\.aspx$/i.test(url.pathname)) {
    const aid = [...url.searchParams].find(([key]) => key.toLowerCase() === 'aid')?.[1];
    if (/^\d+$/.test(aid || '')) {
      url.pathname = `/m/newsflash/home/detail/${aid}`;
      url.search = '';
    }
  }
  if (url.hostname === 'www.loudoun.gov' && /^\/m\/newsflash\/home\/detail\//i.test(url.pathname)) url.pathname = url.pathname.toLowerCase();
  return url.toString();
}

function isoPublication(value) {
  if (!value) return null;
  const text = plain(value);
  const date = new Date(/(?:Z|[+-]\d\d:\d\d|GMT|UTC)$/i.test(text) ? text : `${text} UTC`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function visibleDate(html) {
  const text = plain(html);
  const match = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}\b/i)
    || text.match(/\b\d{1,2}\/\d{1,2}\/20\d{2}\b/);
  return isoPublication(match?.[0]);
}

function articlePublicationDate(html) {
  for (const [tag] of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const key = attribute(tag, 'property') || attribute(tag, 'name') || attribute(tag, 'itemprop');
    if (/^(article:published_time|datePublished|pubdate|publication_date)$/i.test(key)) return isoPublication(attribute(tag, 'content'));
  }
  for (const [, json] of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root = JSON.parse(json);
      const records = Array.isArray(root) ? root : [root, ...(root['@graph'] || [])];
      const article = records.find(item => /Article|NewsArticle|BlogPosting/.test(String(item?.['@type'])) && item.datePublished);
      if (article) return isoPublication(article.datePublished);
    } catch { /* Invalid publisher metadata is not publication evidence. */ }
  }
  const time = String(html).match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i);
  if (time) return isoPublication(time[1]);
  // Restrict unstructured dates to the article content, excluding navigation and footer dates.
  const content = String(html).match(/<h1\b[^>]*>[\s\S]*?<\/(?:article|main)>/i)?.[0]
    || String(html).match(/<h1\b[^>]*>[\s\S]{0,6000}/i)?.[0];
  const labeled = plain(html).match(/(?:Posted on|Published|Publication Date)\s*:?\s*((?:[A-Za-z]+\.?\s+\d{1,2},?\s+20\d{2})|(?:\d{1,2}\/\d{1,2}\/20\d{2}))/i);
  if (labeled) return isoPublication(labeled[1]);
  const dateline = plain(content || '').match(/[—–]\s*((?:[A-Za-z]+\.?\s+\d{1,2},?\s+20\d{2}))/);
  return isoPublication(dateline?.[1]);
}

function parseRss(xml, source = 'PJM') {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/channel>/i.test(xml) || !/<\/rss>/i.test(xml)) throw new Error('Unrecognized RSS response');
  const value = (item, tag) => plain(item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]);
  return [...String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const title = value(item, 'title');
    let url = value(item, 'link');
    try { url = canonicalUrl(url, PROVIDERS[source].endpoints[0].url); } catch { /* Admission records invalid links. */ }
    return { source, title, category: categoryFor(title), publishedAt: isoPublication(value(item, 'pubDate')), url, region: PROVIDERS[source].region };
  }).filter(item => item.category);
}

function parseListing(html, source, base) {
  const candidates = [];
  let articleLinks = 0;
  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = canonicalUrl(attribute(match[1], 'href'), base); } catch { continue; }
    if (!validArticleUrl(source, url)) continue;
    articleLinks += 1;
    const title = plain(match[2]);
    const category = categoryFor(title);
    if (!category || title.length < 12) continue;
    const prefix = String(html).slice(0, match.index);
    const start = Math.max(prefix.lastIndexOf('<li'), prefix.lastIndexOf('<tr'), prefix.lastIndexOf('<article'));
    const nearby = start < 0 ? '' : prefix.slice(start);
    candidates.push({ source, title, category, url, region: PROVIDERS[source].region, publishedAt: visibleDate(nearby) });
  }
  if (!articleLinks) throw new Error('Unrecognized listing response: no official article links');
  return candidates;
}

module.exports = { PROVIDERS, ACTIVE_PROVIDERS, plain, categoryFor, validArticleUrl, canonicalUrl, articlePublicationDate, parseRss, parseListing };
