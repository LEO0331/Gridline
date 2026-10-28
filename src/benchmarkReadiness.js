const { easternParts, isNyseTradingDay, latestExpectedPriceSession } = require('./us-market-calendar');

const BENCHMARK_TICKERS = ['SPY', 'QQQ'];
const MIN_BENCHMARK_ROWS = 61;
const timestamp = value => Number.isFinite(Date.parse(value || '')) ? Date.parse(value) : null;
const sourceUrl = row => {
  try {
    const url = new URL(row?.provenance?.originUrl || row?.sourceUrl);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
};

// Coverage validation is shared by snapshot acceptance and Data Health. Benchmarks
// remain optional: their gaps cannot make the company research universe unavailable.
function benchmarkReadiness(snapshot = {}, now = new Date()) {
  const reference = now instanceof Date ? now.getTime() : timestamp(now);
  const generated = timestamp(snapshot.generatedAt);
  const cutoff = reference === null || !Number.isFinite(reference) ? null : Math.min(reference, generated ?? reference);
  const expectedSession = cutoff === null ? null : latestExpectedPriceSession(new Date(reference));
  return BENCHMARK_TICKERS.map(ticker => {
    const byDay = new Map();
    for (const row of Array.isArray(snapshot.observations) ? snapshot.observations : []) {
      const observed = timestamp(row?.observedAt);
      const url = sourceUrl(row);
      if (cutoff === null || row?.source !== 'prices' || row?.type !== 'close' || row?.ticker !== ticker ||
          !Number.isFinite(Number(row.value)) || Number(row.value) <= 0 || observed === null || observed > cutoff || !url) continue;
      const date = new Date(observed).toISOString().slice(0, 10);
      if (date > expectedSession || !isNyseTradingDay(easternParts(new Date(`${date}T17:00:00Z`)))) continue;
      const retrieved = timestamp(row.retrievedAt);
      if (retrieved !== null && retrieved > cutoff) continue;
      const previous = byDay.get(date);
      if (!previous || (retrieved ?? -Infinity) >= (timestamp(previous.retrievedAt) ?? -Infinity)) {
        byDay.set(date, { ...row, date, sourceUrl: url, provider: row.provenance?.provider || row.providerName || null });
      }
    }
    const rows = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    const latest = rows[rows.length - 1] || null;
    let start = rows.length;
    if (latest?.provider) {
      start = rows.length - 1;
      while (start > 0 && rows[start - 1].provider === latest.provider && rows[start - 1].sourceUrl === latest.sourceUrl) start -= 1;
    }
    const continuousRows = rows.slice(start);
    const current = Boolean(latest && latest.date === expectedSession);
    const reasons = [];
    if (!latest) reasons.push('missing');
    else {
      if (!current) reasons.push('stale');
      if (!latest.provider) reasons.push('provider');
      if (continuousRows.length < MIN_BENCHMARK_ROWS) reasons.push('history');
      if (continuousRows.length < rows.length) reasons.push('continuity');
    }
    const ready = current && continuousRows.length >= MIN_BENCHMARK_ROWS;
    return { ticker, count: rows.length, continuousCount: continuousRows.length,
      firstAt: continuousRows[0]?.observedAt || null, lastAt: latest?.observedAt || null,
      retrievedAt: latest?.retrievedAt || null, provider: latest?.provider || null, sourceUrl: latest?.sourceUrl || null,
      expectedSession, current, ready, available20: current && continuousRows.length >= 21,
      available60: ready, reasons };
  });
}

module.exports = { BENCHMARK_TICKERS, MIN_BENCHMARK_ROWS, benchmarkReadiness };
