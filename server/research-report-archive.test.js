const test = require('node:test');
const assert = require('node:assert/strict');
const { easternParts, isNyseTradingDay } = require('./us-market-calendar');
const { buildResearchEdition, updateResearchArchive, validateResearchArchive, validateArchiveAgainstSnapshot } = require('./research-report-archive');
const { EMPTY_RESEARCH_ARCHIVE, MAX_REPORT_EDITIONS, MAX_REPORT_BYTES } = require('../src/researchReportArchive');

const day = '2026-11-10';
const closeUrl = 'https://example.com/prices/NBIS';
const secSource = 'https://www.sec.gov/Archives/edgar/data/1/filing.htm';
const eventUrl = 'https://www.loudoun.gov/official-event';
const price = (session = day, value = 100, extra = {}) => ({
  id: `price-${session}-${value}`, source: 'prices', type: 'close', ticker: 'NBIS', value,
  observedAt: `${session}T00:00:00.000Z`, retrievedAt: `${session}T21:30:00.000Z`, currency: 'USD',
  providerName: 'Fixture', sourceUrl: closeUrl, ...extra,
});
const snapshot = (session = day, extra = {}) => ({
  generatedAt: `${session}T22:30:00.000Z`, trackedTickers: ['NBIS'], freshness: 'fresh', observations: [price(session)], ...extra,
});
const event = (extra = {}) => ({
  id: 'infrastructure', source: 'events', type: 'infrastructureEvent',
  retrievedAt: '2026-11-10T21:25:00Z', value: {
    url: eventUrl, title: 'Official development', publishedAt: '2026-11-10T16:00:00Z', source: 'Loudoun', category: 'GRID',
  }, ...extra,
});
const disclosure = (extra = {}) => ({
  id: 'issuer', source: 'company-research', type: 'companyDevelopment', ticker: 'NBIS',
  retrievedAt: '2026-11-10T21:25:00Z', value: {
    ticker: 'NBIS', title: 'Older disclosure', url: 'https://nebius.com/newsroom/official', source: 'Issuer',
    publishedAt: '2026-09-10T16:00:00Z', verificationStatus: 'primary-verified',
  }, ...extra,
});
const fact = (extra = {}) => ({
  id: 'revenue', source: 'sec', ticker: 'NBIS', type: 'revenue', value: 0, unit: 'CNY', periodKind: 'quarter',
  observedAt: '2026-11-10T00:00:00Z', retrievedAt: '2026-11-10T21:20:00Z',
  periodStart: '2026-07-01', periodEnd: '2026-09-30', filedAt: '2026-11-10',
  classification: 'reported-zero', taxonomy: 'us-gaap', factTag: 'Revenues', sourceUrl: secSource, ...extra,
});

test('projects a genuine expected NYSE session and keeps publication, retrieval and observation dates separate', () => {
  const s = snapshot();
  const report = buildResearchEdition(s);
  assert.equal(report.session, day);
  assert.equal(report.generatedAt, s.generatedAt);
  assert.equal(report.market[0].observedAt, price().observedAt);
  assert.equal(report.market[0].retrievedAt, price().retrievedAt);
  assert.equal(report.market[0].sourceUrl, closeUrl);
  assert.equal(report.changes, null);
  assert.deepEqual(report.questions, []);
  assert.throws(() => buildResearchEdition({ generatedAt: '2026-11-10' }), /publication timestamp/);
  assert.throws(() => buildResearchEdition({ generatedAt: '2026-11-31T22:30:00Z' }), /publication timestamp/);
});

test('first append is deterministic, rejects replay or changed same-timestamp evidence, and preserves earlier revisions', () => {
  const s = snapshot();
  const initial = updateResearchArchive(EMPTY_RESEARCH_ARCHIVE, s, snapshot('2026-11-09'));
  assert.equal(initial.editions.length, 1);
  assert.equal(updateResearchArchive(initial, s), initial);
  const checkedAgain = snapshot(day, {
    generatedAt: '2026-11-10T23:00:00.000Z',
    observations: [price(day, 100, { retrievedAt: '2026-11-10T22:59:00Z' })],
  });
  assert.equal(updateResearchArchive(initial, checkedAgain, s), initial);
  const corrected = { ...checkedAgain, observations: [price(day, 101)] };
  const next = updateResearchArchive(initial, corrected, s);
  assert.equal(next.editions.length, 2);
  assert.equal(next.editions[0], initial.editions[0]);
  assert.equal(next.editions[0].session, next.editions[1].session);
  assert.notEqual(next.editions[0].id, next.editions[1].id);
  assert.throws(() => updateResearchArchive(initial, { ...s, observations: [price(day, 101)] }, s), /replace or predate/);
});

test('weekend and holiday publication does not backfill an already observed session', () => {
  for (const [session, later] of [['2026-11-06', '2026-11-07'], ['2026-11-25', '2026-11-26']]) {
    const prior = snapshot(session);
    const rerun = { ...prior, generatedAt: `${later}T22:30:00Z` };
    assert.equal(buildResearchEdition(rerun).session, session);
    assert.equal(updateResearchArchive(EMPTY_RESEARCH_ARCHIVE, rerun, prior), EMPTY_RESEARCH_ARCHIVE);
    const archive = updateResearchArchive(EMPTY_RESEARCH_ARCHIVE, prior);
    assert.equal(updateResearchArchive(archive, rerun, prior), archive);
  }
});

test('missing, retained-only, unsourced, or future-retrieved market evidence cannot create a report', () => {
  for (const observations of [[], [price('2026-11-09')], [price(day, 100, { sourceUrl: null })],
    [price(day, 100, { retrievedAt: '2026-11-11T00:00:00Z' })], [price(day, 100, { retrievedAt: null })]]) {
    assert.equal(buildResearchEdition(snapshot(day, { observations })), null);
  }
});

test('projected trend evidence requires complete eligible lineage for the same company', () => {
  const latest = price();
  const previous = price('2026-11-09');
  const score = { ticker: 'NBIS', asOf: snapshot().generatedAt, methodologyVersion: 'fixture-v1',
    marketSignal: { available: true, trend: 'mixed', observedAt: latest.observedAt, sourceUrl: closeUrl, lineage: [previous.id, latest.id] } };
  const good = buildResearchEdition(snapshot(day, { observations: [previous, latest], scores: [score] }));
  assert.equal(good.market[0].trend, 'mixed');
  assert.deepEqual(good.market[0].signalObservationIds, score.marketSignal.lineage);
  const future = { ...previous, retrievedAt: '2026-11-11T12:00:00Z' };
  assert.equal(buildResearchEdition(snapshot(day, { observations: [future, latest], scores: [score] })).market[0].trend, null);
  const wrongTicker = { ...previous, ticker: 'CRWV' };
  assert.equal(buildResearchEdition(snapshot(day, { observations: [wrongTicker, latest], scores: [score] })).market[0].trend, null);
});

test('cutoff excludes future-retrieved events and financial filings, preserving older verified disclosure and reported zero', () => {
  const future = '2026-11-11T12:00:00Z';
  const report = buildResearchEdition(snapshot(day, {
    freshness: 'partial',
    sourceHealth: {
      prices: { status: 'ok', checkedAt: '2026-11-10T21:30:00Z' },
      events: { status: 'partial', checkedAt: '2026-11-10T21:45:00Z' },
      'company-research': { status: 'degraded' },
      eia: { status: 'ok', checkedAt: future },
    },
    observations: [price(), event(), event({ id: 'event-future', retrievedAt: future }), disclosure(),
      disclosure({ id: 'later-disclosure', retrievedAt: future }),
      fact(), fact({ id: 'future-retrieval', value: 100, retrievedAt: future }),
      fact({ id: 'future-filing', type: 'capex', filedAt: '2026-11-11' }),
      fact({ id: 'bad-filing', type: 'currentDebt', sourceUrl: 'http://example.com/unaudited' })],
  }));
  assert.equal(report.freshness, 'partial');
  assert.equal(report.sourceHealth.events.status, 'partial');
  assert.equal(report.sourceHealth['company-research'].status, 'degraded');
  assert.equal(report.sourceHealth.eia, undefined);
  assert.deepEqual(report.infrastructure.map(item => item.id), ['infrastructure']);
  assert.deepEqual(report.developments.map(item => item.id), ['issuer']);
  assert.equal(report.developments[0].publishedAt, disclosure().value.publishedAt);
  assert.deepEqual(report.financials.map(item => [item.id, item.value, item.unit, item.sourceUrl]), [['revenue', 0, 'CNY', secSource]]);
  assert.equal(report.questions[0].sourceUrl, disclosure().value.url);
});

test('archives explicit missing-field evidence with the SEC review source and date', () => {
  const report = buildResearchEdition(snapshot(day, {
    sourceHealth: { sec: { status: 'partial', tickers: { NBIS: {
      checkedAt: '2026-11-10T22:00:00Z',
      factCoverage: { currentDebt: {
        available: false, classification: 'not-separately-reported',
        reason: 'Not reported separately.', reasonZh: '未單獨申報。', auditSourceUrl: secSource, auditReviewedAt: '2026-10-12',
      } },
    } } } },
  }));
  assert.equal(report.financialGaps[0].classification, 'not-separately-reported');
  assert.equal(report.questions[0].sourceUrl, secSource);
  assert.equal(report.questions[0].date, '2026-10-12');
});

test('retains verified snapshot differences and distinguishes an empty available comparison from no baseline', () => {
  const s = snapshot();
  const diff = { version: 'snapshot-diff-v1', available: true, from: snapshot('2026-11-09').generatedAt, to: s.generatedAt };
  const empty = buildResearchEdition({ ...s, snapshotChanges: { ...diff, changes: [] } });
  assert.equal(empty.changes.available, true);
  assert.equal(empty.changes.summary.total, 0);
  const changed = buildResearchEdition({
    ...s, observations: [price(), event()],
    snapshotChanges: { ...diff, changes: [
      { id: 'event-added', type: 'event-added', title: event().value.title, publishedAt: event().value.publishedAt, sourceUrl: eventUrl },
      { id: 'event-missing', type: 'event-added', title: 'Source unavailable', publishedAt: event().value.publishedAt },
    ] },
  });
  assert.equal(changed.changes.summary.event, 1);
  assert.equal(changed.changes.omitted, 1);
  assert.equal(changed.questions[0].sourceUrl, eventUrl);
});

test('archive limits editions and fails closed for invalid structure, tampered evidence or inconsistent snapshots', () => {
  let archive = EMPTY_RESEARCH_ARCHIVE;
  const start = Date.parse('2026-01-02T17:00:00Z');
  for (let i = 0; archive.trimmedEditions === 0 && i < 100; i += 1) {
    const current = new Date(start + i * 86_400_000);
    if (!isNyseTradingDay(easternParts(current))) continue;
    archive = updateResearchArchive(archive, snapshot(current.toISOString().slice(0, 10)));
  }
  assert.equal(archive.editions.length, MAX_REPORT_EDITIONS);
  assert.equal(archive.trimmedEditions, 1);
  assert.equal(validateResearchArchive(EMPTY_RESEARCH_ARCHIVE), EMPTY_RESEARCH_ARCHIVE);
  assert.throws(() => validateResearchArchive({ schemaVersion: 2, editions: [] }), /schema/);
  assert.throws(() => validateResearchArchive({ ...archive, editions: [archive.editions[0], archive.editions[0]] }), /edition/);
  const latest = archive.editions.at(-1);
  const tampered = { ...archive, editions: [{ ...latest, freshness: 'unknown' }] };
  assert.throws(() => validateArchiveAgainstSnapshot(tampered, snapshot(latest.session)), /identity/);
  assert.throws(() => validateArchiveAgainstSnapshot(archive, snapshot('2026-01-02')), /newer/);
  assert.throws(() => validateArchiveAgainstSnapshot(archive, snapshot(latest.session, { observations: [price(latest.session, 101)] })), /match/);
});

test('a read-only projection of the real full snapshot fits the compact edition budget', () => {
  const checkedIn = require('../public/data/dashboard-snapshot.json');
  const report = buildResearchEdition(checkedIn);
  assert.ok(report, 'checked-in snapshot should have an eligible recorded market session');
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= MAX_REPORT_BYTES);
  assert.equal(updateResearchArchive(EMPTY_RESEARCH_ARCHIVE, checkedIn).editions.length, 1);
});
