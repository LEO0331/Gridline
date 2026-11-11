const { plain } = require('../event-discovery');
const issuerProfiles = require('../../src/data/companyResearch.json');
const { dayKey, easternTimestamp } = require('./macro');

const MAX_CANDIDATES = 40;
const NEBIUS = 'https://nebius.com/investor-events';
const BROADCOM = 'https://investors.broadcom.com/company-information/events-presentations';
const COREWEAVE = 'https://investors.coreweave.com/events-and-presentations/default.aspx';
const LOUDOUN_PLANNING = 'https://www.loudoun.gov/6222/Phase-2-Data-Center-Standards-Locations';
const LOUDOUN_CALENDAR = 'https://www.loudoun.gov/mastercalendar';
const EASTERN = 'America/New_York';
const milestone = /\b(hearing|permit(?:ting)?|interconnection|substation|construction|commissioning|groundbreaking|workshop|meeting|review|amendments?|open house)\b/i;
const infrastructure = /\b(data cent(?:er|re)s?|substations?|grid interconnection)\b/i;
const investorEvent = /\b(earnings|financial results|investor (?:day|conference|briefing|presentation)|capital markets day|webcast|commissioning|groundbreaking|construction milestone)\b/i;
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 88).replace(/-$/, '');
const getCells = row => Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), item => plain(item[1]).trim());
const rows = html => Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), item => item[1]);

function review(event, reason, evidence) {
  return { identity: event.id, event, proof: 'review', reason, evidence };
}

function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const normalized = new Date(time).toISOString();
  return normalized === value.replace(/(?<!\.\d{3})Z$/, '.000Z') ? normalized : null;
}

function parseNebius(html) {
  const match = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) throw new Error('Nebius investor listing has no supported Next.js schedule payload');
  const page = JSON.parse(match[1]);
  const cache = page?.props?.pageProps?.__APOLLO_STATE__;
  const queries = Object.entries(cache?.ROOT_QUERY || {}).filter(([name]) => name.startsWith('ir_events('));
  if (page.page !== '/investor-events' || queries.length !== 1 || !Array.isArray(queries[0][1])) {
    throw new Error('Nebius investor listing has an unsupported event index');
  }
  const records = queries[0][1];
  if (records.length > 200) throw new Error('Nebius investor listing exceeds its supported event count');
  return records.flatMap(reference => {
    const record = cache[reference?.__ref];
    if (!record || record.__typename !== 'ir_events' || !/^\d{1,12}$/.test(record.id) ||
        reference.__ref !== `ir_events:${JSON.stringify({ id: record.id })}` ||
        typeof record.title !== 'string' || record.title.length > 240 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.name || '')) return [];
    const earnings = /^Q[1-4] Financial results and live webcast$/i.test(record.title);
    const presentation = /^Nebius (?:to present|will present|presented) at [^<>]{4,180}$/i.test(record.title);
    const changedStatus = /\b(cancell?ed|postponed|rescheduled|tentative)\b/i.test(record.title) || record.status !== undefined;
    const project = /\b(commissioning|groundbreaking|construction milestone|permit(?:ting)?)\b/i.test(record.title);
    if (!earnings && !presentation && !changedStatus && !project && !investorEvent.test(record.title)) return [];
    const legacyEarnings = record.id === '16' && record.name === 'q3-financial-resualts-and-live-webcast';
    const category = earnings || legacyEarnings ? 'earnings' : project ? 'infrastructure' : 'company';
    const start = utcInstant(record.datetime);
    const event = {
      id: legacyEarnings ? 'nbis-2026-q3-earnings' : `nbis-ir-${record.id}`,
      category, title: record.title, sourceUrl: NEBIUS, publisher: 'Nebius Group',
      tickers: ['NBIS'], themeIds: ['neocloud'], timeZone: EASTERN,
      ...(start ? { precision: 'timestamp', start } : {}),
    };
    const evidence = { issuerEventId: record.id, slug: record.name, scheduleField: record.datetime ?? null };
    if (!start || !Array.isArray(record.timezones) || !record.timezones.includes('ET') ||
        changedStatus || (!earnings && !presentation)) {
      return [review(event, 'Nebius schedule precision, status or association needs independent review', evidence)];
    }
    return [{ identity: event.id, event: { ...event, status: 'scheduled' }, proof: 'schedule', evidence }];
  }).slice(-MAX_CANDIDATES);
}

function issuerListing(html, config) {
  if (!config.heading.test(html)) throw new Error(`${config.publisher} listing has an unsupported structure`);
  const tableRows = rows(html).map(getCells).filter(cells => cells.length >= 2 && investorEvent.test(cells[1] || ''));
  if (!tableRows.length && !/no upcoming events|no events scheduled/i.test(html)) {
    throw new Error(`${config.publisher} has no supported server-rendered investor event rows`);
  }
  return tableRows.slice(0, MAX_CANDIDATES).map(([dateLabel, title]) => {
    const period = /\bQ([1-4])\s+(20\d{2})\b/i.exec(title);
    const earnings = /earnings|financial results/i.test(title);
    const id = earnings && period ? `${config.ticker.toLowerCase()}-${period[2]}-q${period[1]}-earnings`
      : `${config.ticker.toLowerCase()}-review-${slug(title)}`;
    return review({ id, title, category: earnings ? 'earnings' : 'company', sourceUrl: config.url,
      publisher: config.publisher, tickers: [config.ticker], timeZone: EASTERN },
    'Issuer HTML date and occurrence need independent verification', { dateLabel, title });
  });
}

function parseBroadcom(html) {
  if (!/Upcoming Events/i.test(html)) throw new Error('Unsupported Broadcom calendar.');
  const fields = /<div\b[^>]*class=["'][^"']*nir-widget--event--date[^"']*["'][^>]*>([^<]+)<\/div>(?:(?!nir-widget--event--date)[\s\S]){0,2200}?<a\b[^>]*href=["']\/events\/event-details\/q([1-4])-(20\d{2})-broadcom-earnings-conference-call["'][^>]*>\s*Q\2 \3 Broadcom Earnings Conference Call\s*<\/a>/gi;
  const results = [];
  for (const [, displayDate, quarter, year] of html.matchAll(fields)) {
    const clock = /^(\d{2})\/(\d{2})\/(20\d{2}) (\d{1,2}):([0-5]\d) (AM|PM) (EST|EDT)$/.exec(displayDate.trim());
    const start = clock && Number(clock[4]) >= 1 && Number(clock[4]) <= 12 && easternTimestamp(
      dayKey(clock[3], clock[1], clock[2]), Number(clock[4]) % 12 + (clock[6] === 'PM' ? 12 : 0), Number(clock[5]));
    const event = { id: `avgo-${year}-q${quarter}-earnings`, title: `Q${quarter} ${year} Broadcom Earnings Conference Call`,
      category: 'earnings', sourceUrl: BROADCOM, publisher: 'Broadcom Investor Relations', timeZone: EASTERN,
      tickers: ['AVGO'], themeIds: ['hardware'] };
    if (!start || !start.endsWith(clock[7] === 'EST' ? '-05:00' : '-04:00')) {
      results.push(review(event, 'Broadcom event time does not match the explicit Eastern offset.', { dateLabel: displayDate.trim() }));
    } else {
      results.push({ identity: event.id, event: { ...event, precision: 'timestamp', start, status: 'scheduled' },
        proof: 'schedule', evidence: { dateLabel: displayDate.trim(), fiscalYear: year, fiscalQuarter: quarter } });
    }
    if (results.length >= MAX_CANDIDATES) break;
  }
  return results.length ? results : issuerListing(html, {
    url: BROADCOM, ticker: 'AVGO', publisher: 'Broadcom Investor Relations', heading: /Upcoming Events/i,
  });
}

function parseLoudounPlanning(html) {
  if (!/Phase 2: Data Center Standards (?:&|&amp;) Locations/i.test(html)) throw new Error('Loudoun planning scope changed');
  return rows(html).map(getCells).filter(cells => cells.length === 2 &&
    /^(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2},)?\s+20\d{2}$/i.test(cells[0]) &&
    milestone.test(cells[1])).slice(0, MAX_CANDIDATES).map(([dateLabel, subject]) => {
    const title = `Loudoun Data Center Standards and Locations: ${subject}`;
    return review({ id: `loudoun-data-center-standards-${slug(subject)}`, title, category: 'infrastructure',
      sourceUrl: LOUDOUN_PLANNING, publisher: 'Loudoun County', timeZone: EASTERN },
    'Project timeline requires an official dated notice or agenda and does not establish a scheduled proceeding', { dateLabel, subject });
  });
}

function parseLoudounDetail(html, url, occurrence) {
  const nodes = Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
    .flatMap(([, json]) => {
      try {
        const value = JSON.parse(json);
        return value?.['@graph'] || value;
      } catch { return []; }
    });
  const events = nodes.filter(item => item?.['@type'] === 'Event' && item.url === url);
  if (events.length !== 1) return null;
  const [item] = events;
  const status = /^https:\/\/schema\.org\/Event(Scheduled|Cancelled|Rescheduled)$/.exec(item.eventStatus || '')?.[1];
  const precision = /^\d{4}-\d{2}-\d{2}$/.test(item.startDate || '') ? 'date' : 'timestamp';
  if (!status || typeof item.name !== 'string' || item.name.length > 220 || !infrastructure.test(item.name) ||
      !milestone.test(item.name) || (status === 'Rescheduled' && !item.previousStartDate)) return null;
  const event = { id: `loudoun-calendar-${occurrence}`, title: item.name, category: 'infrastructure',
    sourceUrl: url, publisher: 'Loudoun County', timeZone: EASTERN, precision, start: item.startDate,
    ...(item.endDate ? { end: item.endDate } : {}), status: status === 'Cancelled' ? 'canceled' : 'scheduled' };
  return { identity: event.id, event, checkedUrl: url,
    proof: { Scheduled: 'schedule', Cancelled: 'cancellation', Rescheduled: 'reschedule' }[status],
    evidence: { occurrence, startDate: item.startDate, previousStartDate: item.previousStartDate, eventStatus: item.eventStatus } };
}

async function parseLoudounCalendar(html, { read } = {}) {
  if (!/<time\b[^>]*datetime=/i.test(html)) throw new Error('Loudoun calendar has no supported date cells');
  const candidates = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const subject = plain(match[2]).trim();
    if (!/^\/Calendar\.aspx\?EID=\d+(?:&(?:amp;)?[^"'<> ]+)?$/i.test(match[1]) ||
        !infrastructure.test(subject) || !milestone.test(subject) || subject.length > 220) continue;
    const occurrence = /EID=(\d+)/i.exec(match[1])[1];
    const url = `https://www.loudoun.gov/Calendar.aspx?EID=${occurrence}`;
    let verified;
    let failure;
    if (read && candidates.length < 4) {
      try { verified = parseLoudounDetail(await read(url), url, occurrence); }
      catch (error) { failure = error.code || 'detail-unavailable'; }
    }
    candidates.push(verified || review({ id: `loudoun-calendar-${occurrence}`, title: subject, category: 'infrastructure',
      sourceUrl: LOUDOUN_CALENDAR, publisher: 'Loudoun County', timeZone: EASTERN },
    'Calendar listing needs structured detail to verify the proceeding, date and schedule status', { occurrence, subject, url, failure }));
    if (candidates.length === MAX_CANDIDATES) break;
  }
  return candidates;
}

const sectorSources = [
  { id: 'nebius-ir', url: NEBIUS, parse: parseNebius },
  { id: 'broadcom-ir', url: BROADCOM, parse: parseBroadcom },
  { id: 'coreweave-ir', url: COREWEAVE, parse: text => issuerListing(text, {
    url: COREWEAVE, ticker: 'CRWV', publisher: 'CoreWeave Investor Relations', heading: /Upcoming (?:&|&amp;) Recent Events/i,
  }) },
  { id: 'loudoun-planning', url: LOUDOUN_PLANNING, parse: parseLoudounPlanning },
  { id: 'loudoun-calendar', url: LOUDOUN_CALENDAR, parse: parseLoudounCalendar },
];

function issuerCandidates(html, profile) {
  if (!/<html\b/i.test(html) || /<title>[^<]*(?:access denied|just a moment|captcha)/i.test(html)) {
    throw new Error('Unsupported issuer listing.');
  }
  const found = new Map();
  for (const link of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = plain(link[2]).trim();
    if (title.length > 240 || !investorEvent.test(title) ||
      !/\b(?:to (?:announce|report|host|present|participate)|will (?:report|host|present)|announces? (?:date|timing)|rescheduled|cancell?ed|upcoming)\b/i.test(title)) continue;
    let url;
    try { url = new URL(link[1], profile.listingUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !profile.officialHosts.includes(url.hostname) || url.href === profile.listingUrl) continue;
    if (profile.ticker === 'ORCL' && url.hostname !== 'www.oracle.com') continue;
    const category = /commissioning|groundbreaking|construction milestone/i.test(title) ? 'infrastructure'
      : /earnings|financial results/i.test(title) ? 'earnings' : 'company';
    const id = `${profile.ticker.toLowerCase()}-review-${slug(title)}`;
    found.set(id, review({ id, category, title, sourceUrl: url.href, publisher: profile.ticker, tickers: [profile.ticker] },
      'Official listing headline requires direct schedule and status verification.', { title, listingUrl: profile.listingUrl }));
    if (found.size >= 3) break;
  }
  return [...found.values()];
}

const structuredIssuerTickers = new Set(['NBIS', 'AVGO', 'CRWV']);
const issuerListings = issuerProfiles.filter(profile => !structuredIssuerTickers.has(profile.ticker)).map(profile => ({
  id: `issuer-${profile.ticker.toLowerCase()}`, url: profile.listingUrl, parse: text => issuerCandidates(text, profile),
}));
const issuerListingAllowed = (method, url) => issuerListings.some(source => source.id === method && source.url === url);

module.exports = { sectorSources: [...sectorSources, ...issuerListings], issuerListingAllowed };
