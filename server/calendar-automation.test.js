const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readCalendarSource } = require('./calendar-source-reader');
const { reconcileCalendar } = require('./calendar-reconciliation');
const { macroSources, parseBlsIcs, parseBeaSchedule, parseFedSchedule } = require('./calendar-sources/macro');
const { sectorSources } = require('./calendar-sources/sector');
const { syncCalendar } = require('../scripts/sync-research-calendar');

const now = new Date('2026-11-11T12:00:00Z');
const BLS = macroSources[0];
const ics = (...entries) => ['BEGIN:VCALENDAR', ...entries.flatMap(entry => ['BEGIN:VEVENT', ...entry, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const cpi = (date = '20261210T083000', status = 'CONFIRMED', prefix = '') => [
  'UID:fixture-cpi', `SUMMARY:${prefix}Consumer Price Index for November 2026`,
  `DTSTART;TZID=America/New_York:${date}`, `STATUS:${status}`,
];
const adapt = (events, source = BLS) => events.map(candidate => ({
  ...candidate, method: source.id, endpoint: candidate.checkedUrl || source.url,
}));
const reconcile = (registry, events) => reconcileCalendar(registry, adapt(events), { now });

test('BLS accepts exact civil and Eastern dates, including DST, and rejects ambiguous clocks or recurrence', () => {
  assert.equal(parseBlsIcs(ics(cpi()))[0].event.start, '2026-12-10T08:30:00-05:00');
  assert.equal(parseBlsIcs(ics(cpi('20261010T083000')))[0].event.start, '2026-10-10T08:30:00-04:00');
  assert.equal(parseBlsIcs(ics(cpi('20261101T013000')))[0].proof, 'review');
  assert.equal(parseBlsIcs(ics([...cpi(), 'RRULE:FREQ=MONTHLY']))[0].proof, 'review');
  assert.throws(() => parseBlsIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT'));
  assert.deepEqual(parseBlsIcs(ics(['UID:irrelevant', 'SUMMARY:Other release'])), []);
});

test('the production BLS feed format uses its UUID and explicit US-Eastern clock without inventing a period', () => {
  const entry = ['UID:c26d524f-228b-46e9-b00e-fdbec26d68af', 'SUMMARY:Consumer Price Index',
    'DTSTART;TZID=US-Eastern:20261110T083000', 'CATEGORIES:IMPORTANT, BLS'];
  const [record] = parseBlsIcs(ics(entry));
  assert.equal(record.event.id, 'bls-cpi-2026-10');
  assert.equal(record.event.title, 'U.S. Consumer Price Index');
  assert.equal(record.event.start, '2026-11-10T08:30:00-05:00');
  assert.equal(reconcile([], [record]).counts.added, 0);
});

test('BEA binds an economic period and release time to its typed schedule row', () => {
  const row = `<table id="release-schedule-table"><thead><tr><th>Year 2026</th></tr></thead><tbody><tr>
  <td class="release-title">Personal Income and Outlays, October 2026</td>
  <td class="scheduled-date"><div class="release-date">November 25</div><small class="text-muted">8:30 AM</small></td></tr></tbody></table>`;
  const [record] = parseBeaSchedule(row);
  assert.equal(record.event.id, 'bea-personal-income-outlays-2026-10');
  assert.equal(record.event.start, '2026-11-25T08:30:00-05:00');
  assert.equal(parseBeaSchedule(row.replace('8:30 AM', 'TBD'))[0].proof, 'review');
});

test('Fed meeting order supplies stable identities, date ranges and official tentative state', () => {
  const panel = ['January', 'March', 'April', 'June', 'July', 'September', 'October', 'December']
    .map(month => `<div class="fomc-meeting__month">${month}</div><div class="fomc-meeting__date">8-9*</div>`).join('');
  const body = `<h4><a>2027 FOMC Meetings</a></h4>${panel}Each meeting date is tentative until confirmed`;
  const [first] = parseFedSchedule(body, { now });
  assert.equal(first.event.id, 'fomc-2027-01');
  assert.equal(first.event.end, '2027-01-09');
  assert.equal(first.event.status, 'tentative');
  assert.equal(parseFedSchedule(body.replace('Each meeting date is tentative until confirmed', ''), { now })[0].proof, 'review');
});

test('reconciliation keeps the stable ID through explicit rescheduling and cancellation', () => {
  const initial = reconcile([], parseBlsIcs(ics(cpi()))).registry;
  const existing = [{ ...initial[0], reviewedAt: '2026-11-10' }];
  const shift = parseBlsIcs(ics(cpi('20261211T093000', 'CONFIRMED', 'Rescheduled: ')));
  const revised = reconcile(existing, shift);
  assert.equal(revised.counts.rescheduled, 1);
  assert.equal(revised.registry[0].id, existing[0].id);
  assert.equal(revised.registry[0].previousStart, existing[0].start);
  assert.equal(revised.registry[0].reviewedAt, '2026-11-10');
  const canceled = reconcile(revised.registry, parseBlsIcs(ics(cpi('20261211T093000', 'CANCELLED'))));
  assert.equal(canceled.registry[0].status, 'canceled');
  assert.equal(canceled.registry[0].start, revised.registry[0].start);
  assert.equal(canceled.registry[0].previousStart, existing[0].start);
  assert.equal(canceled.counts.canceled, 1);
});

test('identical or conflicting schedules, unsupported revisions and disappearance cannot overwrite a manual record', () => {
  const original = reconcile([], parseBlsIcs(ics(cpi()))).registry;
  const renamed = parseBlsIcs(ics(cpi())).map(candidate => ({ ...candidate, event: { ...candidate.event, title: 'Retitled' } }));
  assert.deepEqual(reconcile(original, renamed).registry, original);
  const shifted = parseBlsIcs(ics(cpi('20261211T083000')));
  assert.equal(reconcile(original, shifted).counts.review, 1);
  assert.equal(reconcile([], parseBlsIcs(ics(cpi('20261211T083000', 'CANCELLED')))).counts.review, 1);
  assert.deepEqual(reconcile(original, []).registry, original);
  assert.equal(reconcile(original, [...renamed, ...shifted]).counts.review, 2);
  assert.equal(reconcile(original, parseBlsIcs(ics(cpi('20271211T083000')))).counts.excluded, 1);
});

test('Nebius accepts explicit issuer earnings and investor event schedule fields, retaining original language', () => {
  const source = sectorSources.find(item => item.id === 'nebius-ir');
  const items = [{ id: '16', name: 'q3-financial-resualts-and-live-webcast', title: 'Q3 Financial results and live webcast' },
    { id: '99', name: 'investor-briefing', title: 'Nebius to present at Investor Conference' }];
  const ids = items.map(item => `ir_events:${JSON.stringify({ id: item.id })}`);
  const cache = { ROOT_QUERY: { 'ir_events({})': ids.map(__ref => ({ __ref })) } };
  ids.forEach((id, index) => { cache[id] = { ...items[index], __typename: 'ir_events', datetime: '2026-11-12T13:00:00Z', timezones: ['ET'] }; });
  const page = { page: '/investor-events', props: { pageProps: { __APOLLO_STATE__: cache } } };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(page)}</script>`;
  const { registry } = reconcileCalendar([], adapt(source.parse(html), source), { now });
  assert.deepEqual(registry.map(item => [item.id, item.category]), [['nbis-2026-q3-earnings', 'earnings'], ['nbis-ir-99', 'company']]);
  assert(registry.every(item => item.originalLanguage && !item.reviewedAt));
});

test('Broadcom verifies a quarter-bound earnings row with an explicit matching Eastern offset', () => {
  const source = sectorSources.find(item => item.id === 'broadcom-ir');
  const body = `<h2>Upcoming Events</h2><div class="nir-widget--event--date">12/09/2026 5:00 PM EST</div>
    <a href="/events/event-details/q4-2026-broadcom-earnings-conference-call">Q4 2026 Broadcom Earnings Conference Call</a>`;
  const [result] = source.parse(body);
  assert.equal(result.event.id, 'avgo-2026-q4-earnings');
  assert.equal(result.event.start, '2026-12-09T17:00:00-05:00');
  assert.equal(source.parse(body.replace('EST', 'EDT'))[0].proof, 'review');
});

test('Loudoun verifies a structured hearing, grid workshop or construction event only through matching official detail', async () => {
  const source = sectorSources.find(item => item.id === 'loudoun-calendar');
  const listing = '<time datetime="2026-12-01"></time><a href="/Calendar.aspx?EID=123">Data center public hearing</a>';
  const url = 'https://www.loudoun.gov/Calendar.aspx?EID=123';
  const details = name => ({ '@type': 'Event', url, name, startDate: '2026-12-01', eventStatus: 'https://schema.org/EventScheduled' });
  for (const title of ['Data center public hearing', 'Grid interconnection workshop', 'Data center construction milestone']) {
    const candidates = await source.parse(listing, { read: async checked => {
      assert.equal(checked, url);
      return `<script type="application/ld+json">${JSON.stringify(details(title))}</script>`;
    } });
    const { registry } = reconcileCalendar([], adapt(candidates, source), { now });
    assert.equal(registry[0].id, 'loudoun-calendar-123');
    assert.equal(registry[0].start, '2026-12-01');
  }
  assert.equal((await source.parse(listing, { read: async () => '<p>Expected in Q2</p>' }))[0].proof, 'review');
});

test('reader rejects unapproved URLs, redirects, unsupported content and truncated-size responses', async () => {
  for (const url of ['http://www.bls.gov/schedule/news_release/bls.ics', 'https://127.0.0.1/', BLS.url + '?extra=1']) {
    await assert.rejects(readCalendarSource(BLS.id, url, { fetchImpl: () => assert.fail('unapproved network request') }), /unapproved/);
  }
  await assert.rejects(readCalendarSource(BLS.id, BLS.url, { fetchImpl: async () => new Response(null, {
    status: 302, headers: { location: 'https://127.0.0.1/' },
  }) }), /redirect-denied/);
  await assert.rejects(readCalendarSource(BLS.id, BLS.url, { fetchImpl: async () => new Response('{}', {
    headers: { 'content-type': 'application/json' },
  }) }), /unsupported-content-type/);
  await assert.rejects(readCalendarSource(BLS.id, BLS.url, { fetchImpl: async () => new Response('123456'), maxBytes: 4 }), /response-too-large/);
});

test('reader respects 403 and 429, retries a 5xx once, and times out a pending request', async () => {
  for (const [status, expected] of [[403, 1], [429, 1], [503, 2]]) {
    let calls = 0;
    await assert.rejects(readCalendarSource(BLS.id, BLS.url, { fetchImpl: async () => {
      calls += 1;
      return new Response('', { status });
    } }), new RegExp(`http-${status}`));
    assert.equal(calls, expected);
  }
  let attempts = 0;
  await assert.rejects(readCalendarSource(BLS.id, BLS.url, { timeoutMs: 10, fetchImpl: async (_, { signal }) => {
    attempts += 1;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 50);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
  } }), /request-timeout/);
  assert.equal(attempts, 2);
});

test('dry run reports outages and uncertain records without changing the current registry', async () => {
  const registry = require('../src/data/researchCatalysts.json');
  const before = JSON.stringify(registry);
  const { proposal, report } = await syncCalendar(registry, { now, sources: [BLS, macroSources[1]], read: async id => {
    if (id === BLS.id) throw Object.assign(new Error('Denied'), { code: 'http-403' });
    return '<p>Unsupported page</p>';
  } });
  assert.deepEqual(proposal, registry);
  assert.equal(JSON.stringify(registry), before);
  assert.equal(report.mode, 'dry-run');
  assert.deepEqual(report.sources.map(source => source.reason), ['http-403', 'unsupported-source-structure']);
});
