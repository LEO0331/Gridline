const { plain, articlePublicationDate } = require('./event-discovery');

const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const relevant = /\b(data cent(?:er|re)s?|AI|GPU|cloud|power|capacity|liquid cooling|earnings|financial results|grid|nuclear|fuel cell|financing)\b/i;
const safeDocument = name => /^[\w.-]+\.html?$/i.test(name || '');
function publicationDate(html, title) {
  const explicit = /<meta\b[^>]*(?:article:published_time|datePublished|pubdate|publication_date|publish_date)/i.test(html) || /"datePublished"\s*:/i.test(html) || /<time\b[^>]*datetime=/i.test(html);
  if (explicit) return articlePublicationDate(html);
  const text = plain(html); const index = text.toLowerCase().indexOf(title.toLowerCase());
  if (index < 0) return null;
  const date = text.slice(index + title.length, index + title.length + 1500)
    .match(/\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2})\s*(?:\([^)]*\))?\s*(?:--|—|–)/i)?.[1];
  return date ? new Date(`${date} UTC`).toISOString() : null;
}

function secFilings(submissions, cik, now) {
  if (Number(submissions?.cik) !== Number(cik)) throw new Error('SEC issuer CIK mismatch');
  const recent = submissions.filings?.recent || {};
  return (recent.accessionNumber || []).map((accession, i) => ({ accession, filedAt: recent.filingDate?.[i], form: recent.form?.[i], document: recent.primaryDocument?.[i] }))
    .filter(item => ACCESSION.test(item.accession) && /^\d{4}-\d{2}-\d{2}$/.test(item.filedAt || '') && item.filedAt <= now.toISOString().slice(0, 10) && ['8-K', '6-K'].includes(item.form))
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

async function secDocuments(filing, cik, readJson) {
  const root = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filing.accession.replaceAll('-', '')}`;
  const index = await readJson(`${root}/index.json`);
  // An index belongs to exactly the requested issuer/accession; reject mismatched responses.
  if (index.directory?.name !== `/Archives/edgar/data/${Number(cik)}/${filing.accession.replaceAll('-', '')}`) throw new Error('SEC archive index issuer/accession mismatch');
  const exhibits = (index.directory.item || []).map(item => item.name).filter(name => safeDocument(name) && /(?:ex(?:hibit)?[-_]?99|99[-_.]?1)/i.test(name)).slice(0, 3);
  if (filing.form === '6-K' && safeDocument(filing.document)) exhibits.push(filing.document);
  return [...new Set(exhibits)].map(name => ({ url: `${root}/${name}`, cik: Number(cik), accession: filing.accession, filedAt: filing.filedAt, form: filing.form }));
}

function developmentFromPage(html, url, source, now) {
  const headings = [...String(html).matchAll(/<h([1-3])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi)].map(match => plain(match[2]));
  if (source.startsWith('SEC ')) headings.push(...[...String(html).slice(0, 12000).matchAll(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi)].map(match => plain(match[1])));
  const title = headings.find(value => value.length >= 15 && value.length <= 250 && relevant.test(value));
  const publishedAt = title && publicationDate(html, title);
  const passage = [...String(html).matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)].map(match => plain(match[1]))
    .find(value => value.length >= 40 && value.length <= 1000 && relevant.test(value));
  if (!title || !passage || !publishedAt || Date.parse(publishedAt) > now.getTime()) return null;
  const words = passage.split(/\s+/); const excerpt = words.slice(0, 20).join(' ');
  const summary = `${excerpt}${words.length > 20 ? '…' : ''}`;
  return { source, title, titleZh: title, url, publishedAt, evidenceText: excerpt, summary, summaryZh: summary, summaryKind: 'source-excerpt', region: 'All regions', discovered: true, translationStatus: 'original-language' };
}

function hasPublicationEvidence(html, record) {
  const structured = publicationDate(html, record.title);
  if (structured) return structured.slice(0, 10) === record.publishedAt.slice(0, 10);
  const text = plain(html);
  const titleIndex = text.toLowerCase().indexOf(record.title.toLowerCase());
  if (titleIndex < 0) return false;
  const nearHeadline = text.slice(titleIndex + record.title.length, titleIndex + record.title.length + 1500);
  const dateline = nearHeadline.match(/\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2})\s*(?:\([^)]*\))?\s*(?:--|—|–)/i)?.[1];
  return Boolean(dateline && new Date(`${dateline} UTC`).toISOString().slice(0, 10) === record.publishedAt.slice(0, 10));
}

function officialLinks(body, baseUrl, hosts) {
  const links = [];
  for (const match of String(body).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname) || /\.pdf$/i.test(url.pathname) || !relevant.test(plain(match[2])) || url.href === baseUrl) continue;
      url.hash = '';
      links.push(url.href);
    } catch { /* Malformed listing links are not sources. */ }
  }
  for (const match of String(body).matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)) {
    const chunk = match[1];
    if (!relevant.test(plain(chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''))) continue;
    const link = chunk.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] || plain(chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '');
    try { const url = new URL(link); if (url.protocol === 'https:' && !url.username && !url.password && hosts.includes(url.hostname) && !/\.pdf$/i.test(url.pathname)) links.push(url.href); } catch { /* Invalid feed items withheld. */ }
  }
  return [...new Set(links)];
}

module.exports = { secFilings, secDocuments, developmentFromPage, officialLinks, hasPublicationEvidence };
