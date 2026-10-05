const { latestExpectedPriceSession } = require('./us-market-calendar');
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MIN_ROWS = 60;
const DEFAULT_MAX_STALENESS_DAYS = 10;

function isoDateFromUnix(seconds) {
  const date = new Date(Number(seconds) * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function parseStooqHistory(text) {
  const body = String(text || '').trim();
  if (!body || /^no data/i.test(body)) return [];
  const [headerLine, ...lines] = body.split(/\r?\n/);
  const headers = headerLine.split(',').map(value => value.trim().replace(/^\uFEFF/, ''));
  const dateIndex = headers.indexOf('Date');
  const closeIndex = headers.indexOf('Close');
  if (dateIndex < 0 || closeIndex < 0) return [];
  return lines.map(line => line.split(',')).map(columns => ({
    date: String(columns[dateIndex] || '').trim(),
    close: Number(columns[closeIndex]),
  })).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0);
}

function parseYahooHistory(payload) {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return timestamps.map((timestamp, index) => ({
    date: isoDateFromUnix(timestamp),
    close: Number(closes[index]),
  })).filter(row => row.date && Number.isFinite(row.close) && row.close > 0);
}

function validateHistory(rows, ticker, {
  now = new Date(),
  minRows = DEFAULT_MIN_ROWS,
  maxStalenessDays = DEFAULT_MAX_STALENESS_DAYS,
} = {}) {
  const reference = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(reference)) throw new Error(`${ticker} price history has an invalid reference date.`);
  const expectedSession = latestExpectedPriceSession(new Date(reference));
  const sorted = (rows || []).filter(row => row.date <= expectedSession)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (sorted.length < minRows) throw new Error(`${ticker} returned ${sorted.length} usable daily rows; at least ${minRows} are required.`);
  const latest = Date.parse(`${sorted[sorted.length - 1].date}T23:59:59.999Z`);
  if (!Number.isFinite(latest) || !Number.isFinite(reference)) throw new Error(`${ticker} price history has an invalid latest date.`);
  const stalenessDays = Math.max(0, (reference - latest) / DAY_MS);
  if (stalenessDays > maxStalenessDays) throw new Error(`${ticker} latest market row is ${Math.floor(stalenessDays)} days stale.`);
  if (sorted[sorted.length - 1].date !== expectedSession) {
    throw new Error(`${ticker} latest market row is ${sorted[sorted.length - 1].date}; expected completed NYSE session ${expectedSession}.`);
  }
  return sorted;
}

function stooqUrl(baseUrl, ticker) {
  const url = new URL(baseUrl);
  url.searchParams.set('s', `${ticker.toLowerCase()}.us`);
  url.searchParams.set('i', 'd');
  return url.toString();
}

function yahooUrl(baseUrl, ticker) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  return `${root}/${encodeURIComponent(ticker)}?range=2y&interval=1d&events=history&includeAdjustedClose=true`;
}

async function fetchTickerHistory({
  ticker,
  priceBaseUrl,
  priceFallbackBaseUrl,
  getText,
  getJson,
  now = new Date(),
}) {
  const failures = [];
  const primaryUrl = stooqUrl(priceBaseUrl, ticker);
  try {
    const rows = validateHistory(parseStooqHistory(await getText(primaryUrl)), ticker, { now });
    return { ticker, provider: 'Stooq', providerUrl: primaryUrl, rows };
  } catch (error) {
    failures.push(`Stooq: ${error.message}`);
  }

  if (priceFallbackBaseUrl) {
    const fallbackUrl = yahooUrl(priceFallbackBaseUrl, ticker);
    try {
      const rows = validateHistory(parseYahooHistory(await getJson(fallbackUrl, { 'User-Agent': 'Gridline market-data client' })), ticker, { now });
      return { ticker, provider: 'Yahoo Finance', providerUrl: fallbackUrl, rows };
    } catch (error) {
      failures.push(`Yahoo Finance: ${error.message}`);
    }
  }

  throw new Error(`No usable price history for ${ticker}. ${failures.join(' | ')}`);
}

module.exports = {
  DEFAULT_MIN_ROWS,
  DEFAULT_MAX_STALENESS_DAYS,
  parseStooqHistory,
  parseYahooHistory,
  validateHistory,
  fetchTickerHistory,
  stooqUrl,
  yahooUrl,
};
