const PRICE_ROWS_PER_TICKER = 120;
const EIA_FALLBACK_ROWS = 48;
const RUNTIME_PROFILE = 'overview-v1';

const time = value => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
};

const sourceUrl = row => row?.sourceUrl || row?.provenance?.originUrl || null;
const providerName = row => row?.providerName || row?.provenance?.provider || null;

function latestByDay(rows = []) {
  const byDay = new Map();
  for (const row of rows) {
    const observed = time(row?.observedAt);
    if (observed === null) continue;
    const day = new Date(observed).toISOString().slice(0, 10);
    const prior = byDay.get(day);
    const retrieved = time(row?.retrievedAt) ?? -Infinity;
    const priorRetrieved = time(prior?.retrievedAt) ?? -Infinity;
    if (!prior || retrieved >= priorRetrieved) byDay.set(day, row);
  }
  return [...byDay.values()].sort((a, b) => time(a.observedAt) - time(b.observedAt));
}

function compactPrices(observations = []) {
  const byTicker = new Map();
  for (const row of observations) {
    if (row?.source !== 'prices' || row?.type !== 'close' || !row?.ticker) continue;
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, []);
    byTicker.get(row.ticker).push(row);
  }

  const result = [];
  for (const [ticker, rows] of [...byTicker.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const row of latestByDay(rows).slice(-PRICE_ROWS_PER_TICKER)) {
      result.push({
        id: row.id || null,
        source: 'prices',
        type: 'close',
        value: row.value,
        observedAt: row.observedAt,
        ticker,
        providerName: providerName(row),
        sourceUrl: sourceUrl(row),
      });
    }
  }
  return result;
}

function dedupeEiaHours(observations = []) {
  const byHour = new Map();
  for (const row of observations) {
    if (row?.source !== 'eia' || row?.type !== 'rtoDemandActual' ||
        row?.dataType !== 'D' || row?.region !== 'PJM' || time(row.observedAt) === null) continue;
    const hour = new Date(time(row.observedAt)).toISOString().slice(0, 13);
    const prior = byHour.get(hour);
    const retrieved = time(row.retrievedAt) ?? -Infinity;
    const priorRetrieved = time(prior?.retrievedAt) ?? -Infinity;
    if (!prior || retrieved >= priorRetrieved) byHour.set(hour, row);
  }
  return [...byHour.values()].sort((a, b) => time(a.observedAt) - time(b.observedAt));
}

function compactEia(observations = []) {
  const rows = dedupeEiaHours(observations);
  const byDay = new Map();
  for (const row of rows) {
    const day = String(row.observedAt).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(row);
  }

  const completeDays = [...byDay.keys()]
    .filter(day => byDay.get(day).length === 24)
    .sort()
    .reverse();

  let selected = null;
  for (const day of completeDays) {
    const prior = new Date(`${day}T00:00:00Z`);
    prior.setUTCDate(prior.getUTCDate() - 7);
    const priorDay = prior.toISOString().slice(0, 10);
    if (byDay.get(priorDay)?.length === 24) {
      selected = [...byDay.get(priorDay), ...byDay.get(day)];
      break;
    }
  }

  const chosen = selected || rows.slice(-EIA_FALLBACK_ROWS);
  return chosen.map(row => ({
    source: 'eia',
    type: 'rtoDemandActual',
    value: row.value,
    observedAt: row.observedAt,
    region: row.region,
    dataType: row.dataType,
    unit: row.unit,
    sourceUrl: sourceUrl(row),
  }));
}

function compactSec(observations = []) {
  return observations
    .filter(row => row?.source === 'sec')
    .map(row => {
      const compact = {};
      for (const key of [
        'id', 'source', 'type', 'value', 'observedAt', 'ticker', 'unit',
        'periodStart', 'periodEnd', 'filedAt', 'form', 'fiscalYear',
        'fiscalPeriod', 'sourceUrl',
      ]) {
        if (row[key] !== undefined) compact[key] = row[key];
      }
      if (!compact.sourceUrl) compact.sourceUrl = sourceUrl(row);
      return compact;
    });
}

function compactEvents(observations = []) {
  return observations
    .filter(row => row?.source === 'events' && row?.type === 'infrastructureEvent')
    .map(row => ({
      id: row.id || null,
      source: 'events',
      type: 'infrastructureEvent',
      value: row.value,
      retrievedAt: row.retrievedAt || null,
    }));
}

function buildRuntimeSnapshot(snapshot = {}) {
  const observations = snapshot.observations || [];
  return {
    schemaVersion: snapshot.schemaVersion || null,
    ...(Array.isArray(snapshot.trackedTickers) ? { trackedTickers: snapshot.trackedTickers } : {}),
    runtimeProfile: RUNTIME_PROFILE,
    generatedAt: snapshot.generatedAt || null,
    freshness: snapshot.freshness || 'unknown',
    sourceHealth: snapshot.sourceHealth || {},
    methodologies: snapshot.methodologies || null,
    backtestCoverage: snapshot.backtestCoverage || null,
    observations: [
      ...compactPrices(observations),
      ...compactEia(observations),
      ...compactSec(observations),
      ...compactEvents(observations),
    ],
    snapshotChanges: snapshot.snapshotChanges || null,
    demoReadiness: snapshot.demoReadiness || null,
    note: snapshot.note || null,
  };
}

module.exports = {
  PRICE_ROWS_PER_TICKER,
  EIA_FALLBACK_ROWS,
  RUNTIME_PROFILE,
  buildRuntimeSnapshot,
  compactPrices,
  compactEia,
};
