const { setTimeout: sleep } = require('node:timers/promises');

function validateConfig(env) {
  let url;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    throw new Error('SUPABASE_URL must be a hosted Supabase HTTPS project URL.');
  }
  if (
    url.protocol !== 'https:' ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
    url.port || url.username || url.password || url.search || url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('SUPABASE_URL must be a hosted Supabase HTTPS project URL.');
  }
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY must be a publishable key; privileged keys are not allowed.');
  }
  return { endpoint: new URL('/rest/v1/rpc/gridline_health', url).href, key };
}

async function requestHealth(config, { fetchImpl, sleepImpl, timeoutMs }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let retryable = false;
    let failure;
    try {
      let response;
      try {
        response = await fetchImpl(config.endpoint, {
          method: 'POST',
          headers: { apikey: config.key, 'Content-Type': 'application/json' },
          body: '{}',
          redirect: 'error',
          signal: controller.signal,
        });
      } catch {
        retryable = true;
        throw new Error('Supabase health request failed or timed out.');
      }
      if (!response.ok) {
        retryable = response.status === 408 || response.status === 429 || (response.status >= 500 && response.status <= 599);
        throw new Error(`Supabase health request returned HTTP ${response.status}.`);
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        retryable = controller.signal.aborted;
        throw new Error('Supabase health response could not be read.');
      }
      if (payload !== 'ok') {
        throw new Error('Supabase health response was unexpected.');
      }
      return;
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timer);
    }
    if (!retryable || attempt === 3) throw failure;
    await sleepImpl(1000 * (2 ** (attempt - 1)));
  }
}

async function runHealthCheck(env = process.env, options = {}) {
  const config = validateConfig(env);
  const dependencies = {
    fetchImpl: options.fetchImpl || fetch,
    sleepImpl: options.sleepImpl || sleep,
    timeoutMs: options.timeoutMs || 10000,
  };
  for (let count = 0; count < 3; count += 1) {
    await requestHealth(config, dependencies);
  }
  return 3;
}

if (require.main === module) {
  runHealthCheck().then((count) => {
    console.log(`Supabase health check passed (${count} successful database requests).`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { validateConfig, runHealthCheck };
