const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { handler } = require('./index');

test('v2 API rejects out-of-range assumptions with a client error', async () => {
  const request = Readable.from([Buffer.from(JSON.stringify({ ticker: 'NBIS', version: 'v2', holdingSessions: 61 }))]);
  request.method = 'POST'; request.url = '/api/backtest'; request.headers = {}; request.socket = { remoteAddress: '127.0.0.1' };
  let status, body;
  const response = { writeHead(code) { status = code; }, end(value) { body = JSON.parse(value); } };
  await handler(request, response);
  assert.equal(status, 400);
  assert.match(body.error, /Holding sessions/);
});
