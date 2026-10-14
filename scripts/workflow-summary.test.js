const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshotSummary, heartbeatSummary, main } = require('./workflow-summary');

const now = '2026-10-12T12:00:00Z';
const recent = '2026-10-12T06:00:00Z';
const snapshot = (source, health) => ({ generatedAt: recent, sourceHealth: { [source]: health } });

test('partial publisher coverage shows verified and retained checks without failure warnings', () => {
  const report = snapshotSummary(snapshot('company-research', {
    status: 'partial', recordCount: 0, lastSuccessAt: recent, checkedAt: recent,
    tickers: { ORCL: { lastSuccessAt: recent, sourceChecks: [{ coverage: 'official-fallback-verified' }, { coverage: 'retained-reviewed' }, { coverage: 'unavailable' }] } },
  }), { now });
  assert.match(report.markdown, /1 verified \/ 1 retained \/ 1 unavailable/);
  assert.deepEqual(report.annotations, []);
});

test('older source success and zero data produce warnings, never hide behind a new checked date', () => {
  const report = snapshotSummary(snapshot('sec', { status: 'degraded', recordCount: 0, checkedAt: recent, lastSuccessAt: '2026-10-01T00:00:00Z', tickers: { NBIS: { status: 'unavailable', lastSuccessAt: '2026-10-01T00:00:00Z' } } }), { now });
  assert.equal(report.annotations.length, 2);
  assert.match(report.markdown, /retained \(refresh incomplete\)/);
});

test('financial reporting dates flag staleness while unreported fields remain normal', () => {
  const report = snapshotSummary(snapshot('sec', { status: 'ok', recordCount: 2, lastSuccessAt: recent, tickers: { DLR: { status: 'ok', recordCount: 2, lastSuccessAt: recent, factCoverage: {
    capex: { available: true, periodEnd: '2024-06-30' }, currentDebt: { available: false, classification: 'not-separately-reported' },
  } } } }), { now });
  assert.equal(report.annotations.length, 1);
  assert.match(report.annotations[0], /stale financial fields \(capex\)/);
  assert.match(report.markdown, /currentDebt: not-separately-reported/);
});

test('price freshness permits weekends and warns after seven days', () => {
  const report = snapshotSummary(snapshot('prices', { status: 'ok', recordCount: 2, lastSuccessAt: recent, tickers: {
    NBIS: { status: 'ok', recordCount: 1, latestSession: '2026-10-09' }, CRWV: { status: 'ok', recordCount: 1, latestSession: '2026-10-01' },
  } }), { now });
  assert.equal(report.annotations.length, 1);
  assert.match(report.annotations[0], /^CRWV:/);
});

test('requested scope avoids unrelated source warnings and flags missing selected sources', () => {
  const report = snapshotSummary(snapshot('prices', { status: 'ok', recordCount: 0 }), { now, sources: ['sec'] });
  assert.equal(report.annotations.length, 1);
  assert.match(report.annotations[0], /sec: no source health/);
  assert.doesNotMatch(report.markdown, /prices/);
});

test('failed refresh distinguishes previously published success from this run', () => {
  const report = snapshotSummary(snapshot('sec', { status: 'ok', recordCount: 2, lastSuccessAt: recent }), { now, refreshOutcome: 'failure' });
  assert.match(report.annotations[0], /previously published snapshot/);
});

test('multiple source overview rows precede the per-ticker tables', () => {
  const report = snapshotSummary({ generatedAt: recent, sourceHealth: {
    sec: { status: 'ok', recordCount: 1, lastSuccessAt: recent, tickers: { NBIS: { status: 'ok', recordCount: 1 } } },
    prices: { status: 'ok', recordCount: 1, lastSuccessAt: recent },
  } }, { now });
  assert.ok(report.markdown.indexOf('| prices |') < report.markdown.indexOf('### sec ticker coverage'));
});

test('heartbeat summary confirms success only for successful health step', () => {
  assert.deepEqual(heartbeatSummary('success', now).annotations, []);
  for (const outcome of ['failure', 'skipped', 'cancelled', 'unknown']) {
    const report = heartbeatSummary(outcome, now);
    assert.equal(report.annotations.length, 1);
    assert.match(report.markdown, /No successful heartbeat is confirmed/);
    assert.match(report.markdown, /latest successful run/);
  }
});

test('snapshot CLI writes a step summary without embedding arbitrary source messages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-summary-'));
  try {
    const input = path.join(dir, 'snapshot.json');
    const output = path.join(dir, 'summary.md');
    fs.writeFileSync(input, JSON.stringify(snapshot('sec', { status: 'ok', recordCount: 2, lastSuccessAt: recent, message: 'secret-fixture-value' })));
    main(['snapshot', input, 'sec'], { GITHUB_STEP_SUMMARY: output, SUMMARY_NOW: now });
    const markdown = fs.readFileSync(output, 'utf8');
    assert.match(markdown, /Dashboard refresh coverage/);
    assert.doesNotMatch(markdown, /secret-fixture-value/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('blocked final price retry reports upstream provider categories without raw errors', () => {
  const report = snapshotSummary(snapshot('prices', { status: 'ok', recordCount: 260, lastSuccessAt: recent }), {
    now, refreshOutcome: 'failure', retryStage: 'final',
    refreshReport: { expectedSession: '2026-10-13', blockedTickers: ['NBIS', 'AVGO'],
      providerFailures: [
        { ticker: 'NBIS', providers: [{ provider: 'Stooq', reason: 'The operation was aborted due to timeout' },
          { provider: 'Yahoo Finance', reason: 'latest market row is 2026-10-12; expected completed NYSE session 2026-10-13' }] },
        { ticker: 'AVGO', providers: [{ provider: 'Stooq', reason: 'fetch failed' },
          { provider: 'Yahoo Finance', reason: 'latest market row is 2026-10-12; expected completed NYSE session 2026-10-13' }] },
      ] },
  });
  assert.match(report.markdown, /Blocked tickers: \*\*2\*\*/);
  assert.match(report.markdown, /Stooq \| 2 \| timeout: 1; request\/data error: 1/);
  assert.match(report.markdown, /Yahoo Finance \| 2 \| session lag: 2/);
  assert.doesNotMatch(report.markdown, /fetch failed/);
  assert.equal(report.criticalAnnotations.length, 1);
  assert.match(report.criticalAnnotations[0], /Final scheduled price retry blocked/);
});
