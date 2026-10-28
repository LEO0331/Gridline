const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');
const config = require('./config');
const { createService } = require('./service');
const { startScheduler } = require('./scheduler');
const { runScenario, methodology: SCENARIO_METHODOLOGY } = require('./scenario-engine');
const { runBacktest, BACKTEST_VERSION } = require('./backtest');
const { runBacktestV2, BACKTEST_V2_VERSION, assumptions: backtestV2Assumptions } = require('../src/backtestV2');
const { VERSION: SCORE_VERSION } = require('./scoring/engine');

const MAX_BODY_BYTES = 64 * 1024;
const MAX_QUERY_LIMIT = 500;
const WRITE_WINDOW_MS = 5 * 60 * 1000;
const WRITE_REQUESTS_PER_WINDOW = 30;
const MAX_RATE_LIMIT_CLIENTS = 10000;
const service = createService(config);
const writeBuckets = new Map();
let lastBucketCleanup = 0;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function originAllowed(origin) {
  if (!origin) return true;
  return config.allowedOrigins.includes(origin);
}
function responseHeaders(request) {
  const origin = request.headers.origin;
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...(originAllowed(origin) && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  };
}
function send(request, response, status, payload) {
  response.writeHead(status, responseHeaders(request));
  response.end(JSON.stringify(payload));
}
function remoteAddress(request) {
  return String(request.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
function isLoopback(request) {
  return ['127.0.0.1', '::1'].includes(remoteAddress(request));
}
function safeEqual(actual, expected) {
  const left = Buffer.from(String(actual)); const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function writeAuthorized(request) {
  const origin = request.headers.origin;
  if (isLoopback(request) && (!origin || origin === 'http://localhost:3000')) return true;
  if (!config.apiWriteToken) return false;
  const authorization = String(request.headers.authorization || '');
  return authorization.startsWith('Bearer ') && safeEqual(authorization.slice(7), config.apiWriteToken);
}
function enforceWriteRateLimit(request) {
  const key = remoteAddress(request) || 'unknown'; const now = Date.now();
  if (now - lastBucketCleanup > WRITE_WINDOW_MS) {
    for (const [client, timestamps] of writeBuckets) {
      const active = timestamps.filter(timestamp => now - timestamp < WRITE_WINDOW_MS);
      if (active.length) writeBuckets.set(client, active); else writeBuckets.delete(client);
    }
    lastBucketCleanup = now;
  }
  if (!writeBuckets.has(key) && writeBuckets.size >= MAX_RATE_LIMIT_CLIENTS) throw new HttpError(429, 'Too many requests');
  const recent = (writeBuckets.get(key) || []).filter(timestamp => now - timestamp < WRITE_WINDOW_MS);
  if (recent.length >= WRITE_REQUESTS_PER_WINDOW) throw new HttpError(429, 'Too many requests');
  recent.push(now); writeBuckets.set(key, recent);
}
async function readJsonBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Request body must be valid JSON'); }
}
function queryText(value, name, max = 80) {
  if (value === null || value === undefined || value === '') return undefined;
  const text = String(value);
  if (text.length > max || /[\u0000-\u001f]/.test(text)) throw new HttpError(400, `${name} is invalid`);
  return text;
}
function queryLimit(value, fallback = 100) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError(400, 'limit must be a positive integer');
  return Math.min(parsed, MAX_QUERY_LIMIT);
}
function queryOffset(value) {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000000) throw new HttpError(400, 'offset is invalid');
  return parsed;
}
function tickerValue(value, required = false) {
  const ticker = queryText(value, 'ticker', 12)?.toUpperCase();
  if (required && !ticker) throw new HttpError(400, 'ticker is required');
  if (ticker && !config.tickers.includes(ticker)) throw new HttpError(400, 'ticker is not supported');
  return ticker;
}

async function handler(request, response) {
  const origin = request.headers.origin;
  if (origin && !originAllowed(origin)) return send(request, response, 403, { error: 'Origin not allowed' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...responseHeaders(request),
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Access-Control-Max-Age': '600',
    });
    return response.end();
  }
  const url = new URL(request.url, 'http://localhost');
  try {
    if (request.method === 'POST') {
      enforceWriteRateLimit(request);
      if (!writeAuthorized(request)) throw new HttpError(401, 'Authorization required');
    }
    if (request.method === 'GET' && url.pathname === '/api/health') {
      const storage = service.store.storage;
      return send(request, response, 200, { sources: await service.health(), supportedSources: service.sources(), storage: { engine: storage.engine, schemaVersion: storage.schemaVersion } });
    }
    if (request.method === 'GET' && url.pathname === '/api/observations') {
      const filters = {
        ticker: tickerValue(url.searchParams.get('ticker')),
        type: queryText(url.searchParams.get('type'), 'type'),
        region: queryText(url.searchParams.get('region'), 'region'),
        source: queryText(url.searchParams.get('source'), 'source'),
        since: queryText(url.searchParams.get('since'), 'since', 40),
        until: queryText(url.searchParams.get('until'), 'until', 40),
        limit: queryLimit(url.searchParams.get('limit'), MAX_QUERY_LIMIT),
        offset: queryOffset(url.searchParams.get('offset')),
      };
      return send(request, response, 200, await service.observations(filters));
    }
    if (request.method === 'GET' && url.pathname === '/api/provenance') {
      const observationId = queryText(url.searchParams.get('observationId'), 'observationId', 200);
      if (!observationId) throw new HttpError(400, 'observationId query parameter is required');
      const record = await service.store.observationById(observationId);
      return record ? send(request, response, 200, record) : send(request, response, 404, { error: 'Observation not found' });
    }
    if (request.method === 'GET' && url.pathname === '/api/scores') {
      return send(request, response, 200, await service.store.scoreSnapshots({
        ticker: tickerValue(url.searchParams.get('ticker')),
        methodologyVersion: SCORE_VERSION,
        since: queryText(url.searchParams.get('since'), 'since', 40),
        until: queryText(url.searchParams.get('until'), 'until', 40),
        limit: queryLimit(url.searchParams.get('limit'), MAX_QUERY_LIMIT),
        offset: queryOffset(url.searchParams.get('offset')),
      }));
    }
    if (request.method === 'POST' && url.pathname === '/api/scenario') {
      const input = await readJsonBody(request); const output = runScenario(input);
      const run = await service.store.saveScenarioRun(output.input, output, output.methodologyVersion);
      return send(request, response, 200, { run, ...output });
    }
    if (request.method === 'GET' && url.pathname === '/api/scenario/runs') return send(request, response, 200, await service.store.scenarioRuns(queryLimit(url.searchParams.get('limit'), 20), SCENARIO_METHODOLOGY.version));
    if (request.method === 'POST' && url.pathname === '/api/backtest') {
      const input = await readJsonBody(request); const ticker = tickerValue(input.ticker, true);
      if (input.version === 'v2' || input.version === BACKTEST_V2_VERSION) {
        let settings;
        try { settings = backtestV2Assumptions({ ...input, ticker, asOf: input.asOf || new Date().toISOString() }); } catch (error) { throw new HttpError(400, error.message); }
        const observations = await service.observations({ source: 'prices', ticker, type: 'close' });
        const benchmark = await service.observations({ source: 'prices', ticker: settings.benchmark, type: 'close' });
        const output = runBacktestV2(settings, [...observations, ...benchmark]);
        const run = await service.store.saveBacktestRun(settings, output, output.backtestVersion);
        return send(request, response, 200, { run, ...output });
      }
      if (input.version !== undefined && input.version !== BACKTEST_VERSION) throw new HttpError(400, 'Unsupported backtest version');
      if (input.horizonDays !== undefined || (input.horizonSessions !== undefined && Number(input.horizonSessions) !== 10)) throw new HttpError(400, 'Only the 10-session price backtest is supported');
      const observations = await service.observations({ source: 'prices', ticker, type: 'close' });
      const output = runBacktest({ ticker }, observations);
      const run = await service.store.saveBacktestRun({ ticker, horizonSessions: 10 }, output, output.backtestVersion);
      return send(request, response, 200, { run, ...output });
    }
    if (request.method === 'GET' && url.pathname === '/api/backtest/runs') {
      const version = url.searchParams.get('version');
      if (version && !['v2', BACKTEST_V2_VERSION, BACKTEST_VERSION].includes(version)) throw new HttpError(400, 'Unsupported backtest version');
      return send(request, response, 200, await service.store.backtestRuns(queryLimit(url.searchParams.get('limit'), 20), version === 'v2' ? BACKTEST_V2_VERSION : version || BACKTEST_VERSION));
    }
    if (request.method === 'POST' && url.pathname === '/api/ingest') {
      const source = queryText(url.searchParams.get('source'), 'source', 30);
      if (!source || !service.sources().includes(source)) throw new HttpError(400, 'A supported source query parameter is required');
      return send(request, response, 200, await service.ingest(source, url.searchParams.get('force') === 'true'));
    }
    if (request.method === 'POST' && url.pathname === '/api/ingest/all') {
      const outcomes = await Promise.all(service.sources().map(item => service.ingest(item, url.searchParams.get('force') === 'true')));
      return send(request, response, 200, { outcomes });
    }
    return send(request, response, 404, { error: 'Not found' });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('API request failed', { method: request.method, path: url.pathname, error: error.message });
    return send(request, response, status, { error: status === 500 ? 'Internal server error' : error.message });
  }
}

function startServer() {
  return http.createServer(handler).listen(config.port, config.host, () => {
    console.log(`Gridline API listening on http://${config.host}:${config.port}`);
    if (config.scheduleEnabled) startScheduler(service, config);
  });
}
if (require.main === module) startServer();
module.exports = { handler, startServer, readJsonBody, writeAuthorized, queryLimit, HttpError, MAX_BODY_BYTES };
