const { latestExpectedPriceSession } = require('./us-market-calendar');
const DAY_MS = 24 * 60 * 60 * 1000;
const { DEFAULT_TICKERS } = require('./company-universe');
const MIN_PRICE_ROWS = 60;
const MAX_PRICE_STALENESS_DAYS = 10;

function validDate(value) {
  return Number.isFinite(Date.parse(value));
}
function secureUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function priceRows(snapshot, ticker) {
  const byDay = new Map();
  for (const item of snapshot?.observations || []) {
    if (item.source !== 'prices' || item.type !== 'close' || item.ticker !== ticker ||
      !Number.isFinite(Number(item.value)) || Number(item.value) <= 0 || !validDate(item.observedAt) ||
      !secureUrl(item.provenance?.originUrl || item.sourceUrl)) continue;
    byDay.set(item.observedAt.slice(0, 10), item);
  }
  return [...byDay.values()].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

function check(id, severity, ok, message, detail = null) {
  return { id, severity, ok: Boolean(ok), message, detail };
}

function evaluateDemoReadiness(snapshot, {
  tickers = snapshot?.trackedTickers || DEFAULT_TICKERS,
  now = snapshot?.generatedAt || new Date().toISOString(),
  minPriceRows = MIN_PRICE_ROWS,
  maxPriceStalenessDays = MAX_PRICE_STALENESS_DAYS,
} = {}) {
  const checks = [];
  const validUniverse = Array.isArray(tickers) && tickers.length > 0 && tickers.every(ticker => DEFAULT_TICKERS.includes(ticker)) && new Set(tickers).size === tickers.length;
  checks.push(check('tracked-universe', 'blocker', validUniverse, 'Enabled tickers form a nonempty, unique supported universe.'));
  if (!validUniverse) tickers = DEFAULT_TICKERS;
  const generatedAt = validDate(snapshot?.generatedAt) ? snapshot.generatedAt : null;
  checks.push(check('schema-v4', 'blocker', Number(snapshot?.schemaVersion) >= 4, 'Static snapshot uses schemaVersion 4 or newer.', { actual: snapshot?.schemaVersion ?? null }));
  checks.push(check('generated-at', 'blocker', Boolean(generatedAt), 'Snapshot has a valid generatedAt timestamp.', { actual: snapshot?.generatedAt ?? null }));
  checks.push(check('observations-array', 'blocker', Array.isArray(snapshot?.observations), 'Snapshot contains an observations array.'));
  checks.push(check('history-array', 'blocker', Array.isArray(snapshot?.companyHistory), 'Snapshot contains companyHistory.'));
  checks.push(check('backtest-coverage', 'blocker', Boolean(snapshot?.backtestCoverage && typeof snapshot.backtestCoverage === 'object'), 'Snapshot contains backtestCoverage.'));
  checks.push(check('methodology-version', 'blocker', Boolean(snapshot?.methodologies?.companyScore), 'Snapshot identifies the company-score methodology version.', { actual: snapshot?.methodologies?.companyScore ?? null }));
  const unsupportedScores = (snapshot?.scores || []).filter(score =>
    score.methodologyVersion !== 'gridline-price-signal-v2.0.0' ||
    ['fundamentals', 'emotion', 'exposure', 'gap', 'confidence'].some(field => score[field] !== null));
  checks.push(check('no-unsourced-company-scores', 'blocker', unsupportedScores.length === 0, 'The public snapshot contains no legacy curated company scores.', { count: unsupportedScores.length }));

  const reference = validDate(now) ? Date.parse(now) : Date.now();
  const expectedSession = latestExpectedPriceSession(new Date(reference));
  const coverage = {};
  for (const ticker of tickers) {
    const rows = priceRows(snapshot, ticker).filter(row => row.observedAt.slice(0, 10) <= expectedSession);
    const latest = rows[rows.length - 1] || null;
    const earliest = rows[0] || null;
    const stalenessDays = latest ? Math.max(0, (reference - Date.parse(latest.observedAt)) / DAY_MS) : null;
    coverage[ticker] = {
      count: rows.length,
      earliest: earliest?.observedAt || null,
      latest: latest?.observedAt || null,
      expectedSession,
      provider: latest?.provenance?.provider || latest?.providerName || null,
      stalenessDays: stalenessDays === null ? null : Math.round(stalenessDays * 10) / 10,
    };
    checks.push(check(
      `prices-${ticker}`,
      'blocker',
      rows.length >= minPriceRows && stalenessDays !== null && stalenessDays <= maxPriceStalenessDays && latest.observedAt.slice(0, 10) === expectedSession,
      `${ticker} has at least ${minPriceRows} usable daily closes through the expected NYSE session ${expectedSession}.`,
      coverage[ticker],
    ));
  }

  for (const [source, health] of Object.entries(snapshot?.sourceHealth || {})) {
    if (health?.status === 'ok') {
      checks.push(check(
        `healthy-source-${source}`,
        'blocker',
        source === 'events' || Number(health.recordCount ?? 1) > 0,
        source === 'events' ? 'An empty verified event feed is allowed.' : `${source} is not labelled healthy with zero records.`,
        { status: health.status, recordCount: health.recordCount ?? null },
      ));
    } else if (health?.status === 'degraded' || health?.status === 'partial') {
      checks.push(check(
        `degraded-source-${source}`,
        'warning',
        false,
        `${source} is ${health.status}; the demo should disclose the limited or unavailable source scope.`,
        { message: health.message || null },
      ));
    }
  }

  const ageHours = generatedAt ? Math.max(0, (Date.now() - Date.parse(generatedAt)) / (60 * 60 * 1000)) : null;
  checks.push(check(
    'snapshot-age',
    'warning',
    ageHours !== null && ageHours <= 96,
    'Snapshot is no more than 96 hours old (weekday schedule allows weekend gaps).',
    { ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10 },
  ));

  const blockers = checks.filter(item => item.severity === 'blocker' && !item.ok);
  const warnings = checks.filter(item => item.severity === 'warning' && !item.ok);
  return {
    status: blockers.length ? 'blocked' : warnings.length ? 'ready-with-warnings' : 'ready',
    ready: blockers.length === 0,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    checks,
    priceCoverage: coverage,
  };
}

module.exports = {
  DEFAULT_TICKERS,
  MIN_PRICE_ROWS,
  MAX_PRICE_STALENESS_DAYS,
  evaluateDemoReadiness,
  priceRows,
};
