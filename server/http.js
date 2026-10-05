function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/); if (!headerLine) return [];
  const headers = headerLine.split(',').map(value => value.trim());
  return lines.filter(Boolean).map(line => Object.fromEntries(headers.map((header, index) => [header, line.split(',')[index] || ''])));
}
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20000;
function assertHttps(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Outbound data sources must use HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Outbound data source URLs cannot contain credentials.');
  return parsed;
}
function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}
async function assertPublicHttps(url) {
  const parsed = assertHttps(url);
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error('Outbound data source resolved to a private network address.');
  return parsed;
}
async function boundedText(response, maxBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('Upstream response exceeds the configured size limit.');
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const decoder = new TextDecoder(); let size = 0; let output = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('Upstream response exceeds the configured size limit.'); }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}
async function request(url, headers = {}, options = {}) {
  let current = String(url);
  const signal = AbortSignal.timeout(options.timeoutMs || REQUEST_TIMEOUT_MS);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicHttps(current);
    const response = await fetch(current, { headers, redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (redirects === 3) throw new Error('Upstream data source redirected too many times.');
      current = new URL(response.headers.get('location'), current).toString();
      continue;
    }
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}`);
      error.status = response.status;
      const retryAfter = response.headers.get('retry-after');
      error.retryAfterMs = retryAfter ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())) : 0;
      await response.body?.cancel();
      throw error;
    }
    return response;
  }
  throw new Error('Upstream request failed.');
}
async function getJson(url, headers = {}) {
  const response = await request(url, { Accept: 'application/json', ...headers });
  return JSON.parse(await boundedText(response));
}
async function getText(url, headers = {}, options = {}) {
  return boundedText(await request(url, headers, options), options.maxBytes || MAX_RESPONSE_BYTES);
}
module.exports = { getJson, getText, parseCsv, assertHttps, assertPublicHttps, privateAddress, boundedText, MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS };
const dns = require('dns/promises');
const net = require('net');
