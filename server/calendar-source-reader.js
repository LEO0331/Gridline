const { sourceEndpointAllowed } = require('../src/calendarSourcePolicy');
const { issuerListingAllowed } = require('./calendar-sources/sector');

const DEFAULT_TIMEOUT = 7000;
const MAX_BYTES = 2 * 1024 * 1024;

class SourceError extends Error {
  constructor(code, retryable = false) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

async function readText(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) throw new SourceError('response-too-large');
  const reader = response.body?.getReader();
  if (!reader) throw new SourceError('missing-response-body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new SourceError('response-too-large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function request(url, { fetchImpl, timeoutMs, maxBytes }) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: 'manual', signal,
      headers: { accept: 'text/calendar, text/html, application/xhtml+xml', 'user-agent': 'Gridline-Research-Calendar/1.0' },
    });
    if (response.status >= 300 && response.status < 400) throw new SourceError('redirect-denied');
    if (!response.ok) throw new SourceError(`http-${response.status}`, response.status >= 500 && response.status < 600);
    if (response.url && response.url !== url) throw new SourceError('unexpected-response-url');
    const contentType = response.headers.get('content-type') || '';
    if (!/^(?:text\/(?:calendar|html|plain)|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType)) {
      throw new SourceError('unsupported-content-type');
    }
    return await readText(response, maxBytes);
  } catch (error) {
    if (error instanceof SourceError) throw error;
    if (signal.aborted) throw new SourceError('request-timeout', true);
    if (error instanceof TypeError) throw new SourceError('network-or-invalid-response', true);
    throw new SourceError('unreadable-response');
  }
}

async function readCalendarSource(method, url, {
  fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT, maxBytes = MAX_BYTES,
} = {}) {
  if (!sourceEndpointAllowed(method, url) && !issuerListingAllowed(method, url)) throw new SourceError('unapproved-source-endpoint');
  try {
    return await request(url, { fetchImpl, timeoutMs, maxBytes });
  } catch (error) {
    if (!error.retryable) throw error;
    return request(url, { fetchImpl, timeoutMs, maxBytes });
  }
}

module.exports = { readCalendarSource };
