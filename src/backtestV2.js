const { momentumBreakoutTimeline } = require('./signals/momentumBreakoutCore');

const BACKTEST_V2_VERSION = 'daily-close-long-only-v2.0';
const METHODS = ['ma5-ma10', 'momentum-breakout'];

function priceRows(observations, ticker, asOf) {
  const days = new Map();
  const cutoff = asOf ? Date.parse(asOf) : Infinity;
  if (!Number.isFinite(cutoff) && cutoff !== Infinity) return [];
  for (const row of observations || []) {
    const value = Number(row?.value), timestamp = Date.parse(row?.observedAt);
    const retrieved = Date.parse(row?.retrievedAt || '');
    const sourceUrl = row?.provenance?.originUrl || row?.sourceUrl;
    let url; try { url = new URL(sourceUrl); } catch { continue; }
    if (row.source !== 'prices' || row.type !== 'close' || row.ticker !== ticker ||
        !Number.isFinite(value) || value <= 0 || !Number.isFinite(timestamp) || timestamp > cutoff ||
        (Number.isFinite(retrieved) && retrieved > cutoff) || url.protocol !== 'https:') continue;
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const prior = days.get(date);
    if (!prior || (Date.parse(row.retrievedAt || '') || 0) >= (Date.parse(prior.retrievedAt || '') || 0)) {
      days.set(date, { id: row.id || null, date, observedAt: row.observedAt, value, sourceUrl,
        provider: row.provenance?.provider || row.providerName || null, retrievedAt: row.retrievedAt || null });
    }
  }
  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return rows;
  let start = rows.length - 1;
  while (start > 0 && rows[start - 1].sourceUrl === rows[rows.length - 1].sourceUrl && rows[start - 1].provider === rows[rows.length - 1].provider) start--;
  return rows.slice(start);
}

function assumptions(input = {}) {
  const method = input.method || 'ma5-ma10';
  const holdingSessions = Number(input.holdingSessions ?? 10);
  const transactionCostBps = Number(input.transactionCostBps ?? 10);
  const slippageBps = Number(input.slippageBps ?? 5);
  if (!METHODS.includes(method)) throw new Error('Unsupported backtest method');
  if (!Number.isInteger(holdingSessions) || holdingSessions < 1 || holdingSessions > 60) throw new Error('Holding sessions must be an integer from 1 to 60');
  if (!Number.isFinite(transactionCostBps) || transactionCostBps < 0 || transactionCostBps > 100) throw new Error('Transaction cost must be between 0 and 100 basis points per side');
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 100) throw new Error('Slippage must be between 0 and 100 basis points per side');
  const benchmark = input.benchmark || 'SPY';
  if (!['SPY', 'QQQ'].includes(benchmark)) throw new Error('Unsupported benchmark');
  if (input.asOf && !Number.isFinite(Date.parse(input.asOf))) throw new Error('Invalid observation cutoff');
  return { ticker: String(input.ticker || '').toUpperCase(), method, holdingSessions, transactionCostBps, slippageBps, benchmark, asOf: input.asOf || null };
}

function entrySignals(rows, method) {
  if (method === 'momentum-breakout') {
    const points = momentumBreakoutTimeline(rows);
    return new Set(points.filter(point => point.changed && (point.state === 'breakout' || point.state === 'reconfirmed')).map(point => point.observedAt));
  }
  const signals = new Set();
  const avg = (end, n) => rows.slice(end - n + 1, end + 1).reduce((sum, row) => sum + row.value, 0) / n;
  for (let i = 10; i < rows.length; i++) if (avg(i - 1, 5) <= avg(i - 1, 10) && avg(i, 5) > avg(i, 10)) signals.add(rows[i].observedAt);
  return signals;
}

function simulate(rows, signals, settings, start, end) {
  let cash = 1, shares = 0, position = null, order = null, peak = 1, maxDrawdown = 0;
  const equity = [], trades = [];
  const fee = settings.transactionCostBps / 10000, slip = settings.slippageBps / 10000;
  for (let i = start; i <= end; i++) {
    const row = rows[i];
    let exited = false;
    if (order) {
      shares = cash / (row.value * (1 + slip) * (1 + fee));
      position = { signalAt: order.observedAt, signalObservationId: order.id, entryAt: row.observedAt,
        entryObservationId: row.id, entryPrice: row.value, entryIndex: i, startingCash: cash, sourceUrl: row.sourceUrl };
      cash = 0; order = null;
    }
    if (position && i - position.entryIndex >= settings.holdingSessions) {
      cash = shares * row.value * (1 - slip) * (1 - fee);
      trades.push({ ...position, exitAt: row.observedAt, exitObservationId: row.id, exitPrice: row.value,
        holdingSessions: i - position.entryIndex, netReturn: cash / position.startingCash - 1, status: 'complete' });
      shares = 0; position = null; exited = true;
    }
    const value = cash + shares * row.value;
    peak = Math.max(peak, value); const drawdown = value / peak - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    equity.push({ observedAt: row.observedAt, equity: value, drawdown });
    // A signal after today's close may only fill on a later close, and orders cannot overlap.
    if (!position && !order && !exited && signals.has(row.observedAt)) order = row;
  }
  const pending = position ? [{ ...position, status: 'open', markedAt: rows[end].observedAt, markPrice: rows[end].value }] : order ? [{ signalAt: order.observedAt, status: 'pending-entry', signalObservationId: order.id }] : [];
  const count = trades.length;
  return { trades, pending, equity, metrics: { completedTrades: count, pendingTrades: pending.length,
    winRate: count ? trades.filter(trade => trade.netReturn > 0).length / count : null,
    averageNetTradeReturn: count ? trades.reduce((sum, trade) => sum + trade.netReturn, 0) / count : null,
    portfolioReturn: equity.length ? equity[equity.length - 1].equity - 1 : null,
    maxDrawdown: equity.length ? maxDrawdown : null,
    averageHoldingSessions: count ? trades.reduce((sum, trade) => sum + trade.holdingSessions, 0) / count : null } };
}

function benchmarkReturn(rows, benchmark, start, end) {
  if (start > end || !rows[start] || !rows[end]) return null;
  const byDate = new Map(benchmark.map(row => [row.date, row]));
  const first = byDate.get(rows[start].date), last = byDate.get(rows[end].date);
  if (!first || !last || !first.provider || first.provider !== rows[start].provider || last.provider !== first.provider) return null;
  return { value: last.value / first.value - 1, start: first.observedAt, end: last.observedAt,
    provider: first.provider, sourceUrl: first.sourceUrl, observationIds: [first.id, last.id].filter(Boolean) };
}

function runBacktestV2(input, observations = []) {
  const settings = assumptions(input);
  const rows = priceRows(observations, settings.ticker, settings.asOf), benchmark = priceRows(observations, settings.benchmark, settings.asOf);
  const signals = entrySignals(rows, settings.method), split = Math.floor(rows.length * 0.7);
  const main = simulate(rows, signals, settings, 0, rows.length - 1);
  const minimum = settings.method === 'momentum-breakout' ? 21 : 11;
  const maskInsufficient = (metrics, end) => end < minimum - 1 ? { ...metrics, portfolioReturn: null, maxDrawdown: null } : metrics;
  main.metrics = maskInsufficient(main.metrics, rows.length - 1);
  const sections = [['inSample', 0, split - 1], ['outOfSample', split, rows.length - 1]];
  const validation = Object.fromEntries(sections.map(([name, start, end]) => {
    const part = simulate(rows, signals, settings, start, end);
    return [name, { start: rows[start]?.observedAt || null, end: rows[end]?.observedAt || null,
      ...maskInsufficient(part.metrics, end), benchmark: benchmarkReturn(rows, benchmark, start, end) }];
  }));
  const sensitivity = [0, settings.transactionCostBps, Math.min(100, settings.transactionCostBps * 2)].map(cost => ({
    transactionCostBps: cost, slippageBps: settings.slippageBps,
    portfolioReturn: maskInsufficient(simulate(rows, signals, { ...settings, transactionCostBps: cost }, 0, rows.length - 1).metrics, rows.length - 1).portfolioReturn }));
  return { backtestVersion: BACKTEST_V2_VERSION, assumptions: settings,
    status: main.metrics.completedTrades ? 'complete' : 'insufficient-data',
    coverage: { start: rows[0]?.observedAt || null, end: rows[rows.length - 1]?.observedAt || null, priceObservations: rows.length,
      sourceUrl: rows[rows.length - 1]?.sourceUrl || null, provider: rows[rows.length - 1]?.provider || null,
      observationIds: rows.map(row => row.id).filter(Boolean),
      unknownRetrievalDates: rows.filter(row => !Number.isFinite(Date.parse(row.retrievedAt || ''))).length },
    ...main, benchmark: benchmarkReturn(rows, benchmark, 0, rows.length - 1), validation, sensitivity,
    warnings: ['Daily close fills are simplified and not executable; actual fills and costs may differ.',
      'Prices may not be consistently adjusted for splits or dividends; benchmark comparison is price-only.',
      'Records retrieved after the cutoff are excluded; missing retrieval dates cannot be verified. Historical provider revisions and survivorship are not reconstructed. Results are descriptive, not advice.',
      'The chronological split uses fixed rules, warmup history and separately reset cash; no parameter fitting occurs, so walk-forward refitting is not applicable.',
      'Small samples and missing observations can make results unreliable. Open positions are marked at the final close without hypothetical exit costs.'] };
}
module.exports = { BACKTEST_V2_VERSION, runBacktestV2, priceRows, assumptions };
