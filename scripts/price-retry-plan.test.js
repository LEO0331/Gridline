const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { planPriceRetry, main } = require('./price-retry-plan');

function snapshot(tickers, day) {
  return { trackedTickers: tickers, observations: [...tickers, 'SPY', 'QQQ'].flatMap(ticker =>
    Array.from({ length: 60 }, (_, index) => {
      const date = new Date(`${day}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - index);
      return { source: 'prices', type: 'close', ticker, value: 1,
        observedAt: date.toISOString(), sourceUrl: 'https://example.com/market' };
    })) };
}

test('skips a retry after prices through the previous NYSE session are committed', () => {
  const result = planPriceRetry(snapshot(['NBIS', 'AVGO'], '2026-10-13'), new Date('2026-10-14T15:17:00Z'));
  assert.equal(result.needed, false);
  assert.deepEqual(result.missing, []);
  assert.equal(result.expectedSession, '2026-10-13');
});

test('targets missing tickers, including weekends and invalid history', () => {
  const prior = snapshot(['NBIS', 'AVGO'], '2026-10-13');
  prior.observations = prior.observations.filter(row => row.ticker !== 'AVGO');
  assert.deepEqual(planPriceRetry(prior, new Date('2026-10-14T18:17:00Z')).missing, ['AVGO']);
  const onWeekend = snapshot(['NBIS'], '2026-10-15');
  assert.deepEqual(planPriceRetry(onWeekend, new Date('2026-10-17T15:17:00Z')).missing, ['NBIS', 'SPY', 'QQQ']);
});

test('missing benchmarks trigger retry without entering the tracked company universe', () => {
  const prior = snapshot(['NBIS'], '2026-10-13');
  prior.observations = prior.observations.filter(row => row.ticker !== 'SPY');
  const result = planPriceRetry(prior, new Date('2026-10-14T15:17:00Z'));
  assert.deepEqual(result.missing, ['SPY']);
  assert.equal(result.trackedCount, 1);
  assert.equal(result.benchmarkCount, 2);
});

test('missing or malformed publication requires recovery rather than skipping', () => {
  const result = planPriceRetry({}, new Date('2026-10-14T15:17:00Z'));
  assert.equal(result.needed, true);
  assert.ok(result.missing.includes('NBIS'));
});

test('retry preflight writes workflow output and summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gridline-price-retry-'));
  try {
    const file = path.join(dir, 'snapshot.json');
    const output = path.join(dir, 'output');
    const summary = path.join(dir, 'summary');
    fs.writeFileSync(file, JSON.stringify(snapshot(['NBIS'], '2026-10-13')));
    main([file], { RETRY_NOW: '2026-10-14T15:17:00Z', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary });
    assert.equal(fs.readFileSync(output, 'utf8'), 'needed=false\n');
    assert.match(fs.readFileSync(summary, 'utf8'), /no retry or deployment is needed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
