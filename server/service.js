const { createStore } = require('./store');
const adapters = require('./sources');
const { normalizeObservations } = require('./provenance');
const { mergeSnapshotHealth } = require('./snapshot-merge');

function summarizeTickers(source, enabledTickers, tickers) {
  const successful = enabledTickers.filter(ticker => tickers[ticker]?.status === 'ok');
  const failed = enabledTickers.filter(ticker => tickers[ticker]?.status !== 'ok');
  const missingFacts = successful.filter(ticker => tickers[ticker]?.missingFacts?.length);
  const recordCount = successful.reduce((sum, ticker) => sum + (tickers[ticker].recordCount || 0), 0);
  return {
    status: failed.length === 0 ? 'ok' : successful.length ? 'partial' : 'degraded',
    recordCount,
    message: `${source}: ${successful.length}/${enabledTickers.length} tracked tickers ingested (${recordCount} observations)${failed.length ? `; unavailable: ${failed.map(ticker => `${ticker}${tickers[ticker]?.message ? ` (${tickers[ticker].message})` : ''}`).join(', ')}` : ''}${missingFacts.length ? `; incomplete comparable USD facts: ${missingFacts.join(', ')}` : ''}`,
  };
}

function createService(config) {
  const store = createStore(config.dataDir);
  async function ingest(source, force = false, options = {}) {
    if (!adapters[source]) throw new Error(`Unsupported source '${source}'.`);
    const priorHealth = await store.health();
    const tickerSource = source === 'prices' || source === 'sec';
    const enabledTickers = config.tickers || [];
    const coverageFresh = !tickerSource || enabledTickers.every(ticker => priorHealth[source]?.tickers?.[ticker]?.status === 'ok');
    if (!force && coverageFresh && await store.cacheFresh(source)) return { source, status: 'cached', message: 'Fresh cached data retained.' };
    try {
      const result = await adapters[source]({ ...config, ...(options.tickers ? { tickers: options.tickers.filter(ticker => enabledTickers.includes(ticker)) } : {}) });
      await store.saveRaw(source, result.payload);
      const observations = normalizeObservations(source, result.observations);
      if (!observations.length && source !== 'events' && !result.tickerOutcomes) {
        throw new Error(`${source} returned zero usable observations; last-known-good data retained.`);
      }
      await store.saveObservations(source, observations);
      const checkedAt = new Date().toISOString();
      const tickerOutcomes = result.tickerOutcomes?.map(item => ({ ...item, recordCount: observations.filter(row => row.ticker === item.ticker).length }));
      const tickerStates = tickerOutcomes && Object.fromEntries(tickerOutcomes.map(item => [item.ticker, { ...item, checkedAt, ...(item.status === 'ok' ? { lastSuccessAt: checkedAt } : {}) }]));
      const mergedTickers = { ...priorHealth[source]?.tickers, ...tickerStates };
      const summary = tickerStates ? summarizeTickers(source, enabledTickers, mergedTickers) : null;
      const status = summary?.status || (source === 'events' ? result.status || ((result.coverage?.feedStatus === 'unavailable' || result.coverage?.excludedCount > 0) ? 'partial' : 'ok') : result.status || 'ok');
      let health = { status, ...((tickerStates ? status === 'ok' : status !== 'degraded') ? { lastSuccessAt: checkedAt } : {}), cacheMinutes: config.cacheMinutes, recordCount: summary?.recordCount ?? observations.length, message: summary?.message || result.message, ...(tickerStates ? { tickers: tickerStates, trackedTickers: enabledTickers } : {}), ...(source === 'events' ? { coverage: result.coverage || null } : {}) };
      health = mergeSnapshotHealth(priorHealth, { [source]: health }, await store.observations({ source }))[source];
      await store.recordHealth(source, health);
      return { source, status, recordCount: health.recordCount, message: health.message, ...(tickerOutcomes ? { tickerOutcomes } : {}), ...(source === 'events' ? { coverage: health.coverage } : {}) };
    } catch (error) {
      const tickerOutcomes = tickerSource && enabledTickers.length ? (options.tickers || enabledTickers).map(ticker => ({ ticker, status: 'degraded', recordCount: 0, checkedAt: new Date().toISOString(), message: error.message })) : null;
      const tickerStates = tickerOutcomes && Object.fromEntries(tickerOutcomes.map(item => [item.ticker, item]));
      const summary = tickerStates ? summarizeTickers(source, enabledTickers, { ...priorHealth[source]?.tickers, ...tickerStates }) : { status: 'degraded', message: error.message };
      await store.recordHealth(source, mergeSnapshotHealth(priorHealth, { [source]: { ...summary, cacheMinutes: config.cacheMinutes, ...(tickerStates ? { tickers: tickerStates, trackedTickers: enabledTickers } : {}) } }, await store.observations({ source }))[source]);
      return { source, ...summary, ...(tickerOutcomes ? { tickerOutcomes } : {}) };
    }
  }
  return {
    ingest,
    health: () => store.health(),
    observations: (...args) => store.observations(...args),
    sources: () => Object.keys(adapters),
    store,
  };
}
module.exports = { createService };
