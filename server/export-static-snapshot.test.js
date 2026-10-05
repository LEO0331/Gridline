const test = require('node:test');
const assert = require('node:assert/strict');
const { refreshWithRetry } = require('./export-static-snapshot');

test('snapshot exporter does not repeat bounded event checks after partial access or complete denial', async () => {
  for (const status of ['partial', 'degraded']) {
    let calls = 0;
    const result = await refreshWithRetry({ ingest: async () => {
      calls += 1;
      return { source: 'events', status, coverage: { sources: { ERCOT: { discoveryStatus: 'unavailable' } } } };
    } }, 'events');
    assert.equal(calls, 1);
    assert.equal(result.attempts, 1);
    assert.equal(result.status, status);
  }
});

test('snapshot exporter still retries other degraded providers', async () => {
  let calls = 0;
  const result = await refreshWithRetry({ ingest: async () => ({ source: 'prices', status: ++calls === 1 ? 'degraded' : 'ok' }) }, 'prices');
  assert.equal(calls, 2);
  assert.equal(result.status, 'ok');
  assert.equal(result.attempts, 2);
});
