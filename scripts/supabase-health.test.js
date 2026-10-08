const assert = require('node:assert/strict');
const test = require('node:test');
const { validateConfig, runHealthCheck } = require('./supabase-health');

const env = {
  SUPABASE_URL: 'https://example-project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
};
const ok = () => ({ ok: true, status: 200, json: async () => 'ok' });

test('configuration accepts only hosted HTTPS URLs and publishable keys', () => {
  assert.equal(validateConfig(env).endpoint, 'https://example-project.supabase.co/rest/v1/rpc/gridline_health');
  for (const url of [undefined, 'invalid', 'http://example-project.supabase.co',
    'https://evil.test', 'https://example-project.supabase.co.evil.test',
    'https://user:password@example-project.supabase.co',
    'https://example-project.supabase.co?secret=abc',
    'https://example-project.supabase.co#abc',
    'https://example-project.supabase.co/path', 'https://example-project.supabase.co:1234']) {
    assert.throws(() => validateConfig({ ...env, SUPABASE_URL: url }), /SUPABASE_URL/);
  }
  for (const key of [undefined, '', 'sb_secret_fixture', 'service_role', 'eyJhbGciOiJIUzI1NiJ9', 'sb_publishable_']) {
    assert.throws(() => validateConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: key }), /publishable key/);
  }
});

test('three sequential database requests use a publishable key without bearer auth', async () => {
  let calls = 0;
  const result = await runHealthCheck(env, {
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, validateConfig(env).endpoint);
      assert.equal(options.method, 'POST');
      assert.deepEqual(options.headers, { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' });
      assert.equal(options.body, '{}');
      assert.equal(options.redirect, 'error');
      assert.equal(options.signal.aborted, false);
      return ok();
    },
    sleepImpl: async () => assert.fail('Successful requests do not retry'),
  });
  assert.equal(result, 3);
  assert.equal(calls, 3);
});

test('transient HTTP failures recover with bounded backoff', async () => {
  for (const status of [408, 429, 500, 503]) {
    let calls = 0;
    const delays = [];
    assert.equal(await runHealthCheck(env, {
      fetchImpl: async () => ++calls <= 2 ? { ok: false, status } : ok(),
      sleepImpl: async (ms) => delays.push(ms),
    }), 3);
    assert.equal(calls, 5);
    assert.deepEqual(delays, [1000, 2000]);
  }
});

test('permanent HTTP failure aborts the run without retries', async () => {
  let calls = 0;
  await assert.rejects(runHealthCheck(env, {
    fetchImpl: async () => { calls += 1; return { ok: false, status: 403 }; },
    sleepImpl: async () => assert.fail('Permanent failure must not retry'),
  }), /HTTP 403/);
  assert.equal(calls, 1);
});

test('unexpected and malformed responses are not counted or retried', async () => {
  for (const json of [async () => ({ status: 'ok' }), async () => 'unexpected', async () => { throw new Error('sensitive response'); }]) {
    let calls = 0;
    await assert.rejects(runHealthCheck(env, {
      fetchImpl: async () => { calls += 1; return { ...ok(), json }; },
      sleepImpl: async () => assert.fail('Invalid payload must not retry'),
    }), /Supabase health response/);
    assert.equal(calls, 1);
  }
});

test('network errors retry at most three times and never expose credentials', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(runHealthCheck(env, {
    fetchImpl: async () => { calls += 1; throw new Error(`Sensitive ${env.SUPABASE_PUBLISHABLE_KEY} upstream body`); },
    sleepImpl: async (ms) => delays.push(ms),
  }), (error) => {
    assert.equal(error.message, 'Supabase health request failed or timed out.');
    assert.equal(error.message.includes(env.SUPABASE_PUBLISHABLE_KEY), false);
    return true;
  });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('timed out requests are aborted and retried', async () => {
  let calls = 0;
  const delays = [];
  assert.equal(await runHealthCheck(env, {
    timeoutMs: 5,
    fetchImpl: async (_, { signal }) => {
      calls += 1;
      if (calls > 1) return ok();
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
      });
    },
    sleepImpl: async (ms) => delays.push(ms),
  }), 3);
  assert.equal(calls, 4);
  assert.deepEqual(delays, [1000]);
});
