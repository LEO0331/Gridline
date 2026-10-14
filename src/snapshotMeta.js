import { SOURCE_ORDER } from './dataHealthModel';

export const emptySnapshot = { generatedAt: null, freshness: 'unknown', sourceHealth: {}, outcomes: [] };

async function fetchDashboardSnapshot() {
  const paths = ['dashboard-overview.json', 'dashboard-snapshot.json'];
  let lastError = null;
  for (const file of paths) {
    try {
      const response = await fetch(`${process.env.PUBLIC_URL}/data/${file}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${file} unavailable`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Snapshot unavailable');
}

export async function loadDashboardSnapshot() {
  const snapshot = { ...emptySnapshot, ...await fetchDashboardSnapshot() };
  try {
    const reviewResponse = await fetch(`${process.env.PUBLIC_URL}/data/event-review.json`, { cache: 'no-store' });
    if (!reviewResponse.ok) return snapshot;
    const review = await reviewResponse.json();
    if (!Array.isArray(review.observations) || !Number.isFinite(Date.parse(review.checkedAt))) return snapshot;
    const latestCheck = Date.parse(snapshot.sourceHealth?.events?.checkedAt || '') || 0;
    if (Date.parse(review.checkedAt) <= latestCheck) return snapshot;
    const observations = new Map((snapshot.observations || []).map(item => [item.id, item]));
    review.observations.forEach(item => { if (item?.source === 'events' && item.id) observations.set(item.id, item); });
    return {
      ...snapshot,
      observations: [...observations.values()],
      sourceHealth: {
        ...snapshot.sourceHealth,
        events: review.sourceHealth?.events,
      },
    };
  } catch { return snapshot; }
}

export function summarizeSnapshot(snapshot = emptySnapshot, language = 'en', timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, now = new Date()) {
  const date = new Date(snapshot.generatedAt || '');
  const valid = Number.isFinite(date.getTime());
  const nowMs = new Date(now).getTime();
  // A snapshot can remain in the public folder after a failed run. Its stored
  // freshness describes publication time, not how current it is today.
  const retained = valid && Number.isFinite(nowMs) && nowMs - date.getTime() > 96 * 60 * 60 * 1000;
  const locale = language === 'zh-TW' ? 'zh-TW' : 'en-US';
  const generatedLabel = valid
    ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: language === 'zh-TW' ? 'long' : 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone }).format(date)
    : null;
  const sources = [...SOURCE_ORDER, 'company-research'].map(source => snapshot.sourceHealth?.[source]).filter(Boolean);
  const healthySources = sources.filter(item => item?.status === 'ok').length;
  const latestMarketDate = (snapshot.observations || [])
    .filter(item => item?.source === 'prices' && item?.type === 'close' && Number.isFinite(Date.parse(item.observedAt)))
    .reduce((latest, item) => !latest || item.observedAt > latest ? item.observedAt : latest, null);
  return {
    generatedAt: snapshot.generatedAt || null,
    generatedLabel: valid ? (language === 'zh-TW' ? generatedLabel : generatedLabel.toUpperCase()) : (language === 'zh-TW' ? '正在載入快照' : 'LOADING SNAPSHOT'),
    generatedUtc: valid ? date.toISOString() : null,
    healthySources,
    totalSources: sources.length,
    freshness: retained ? 'stale' : snapshot.freshness || 'unknown',
    publicationFreshness: snapshot.freshness || 'unknown',
    retainedSnapshot: retained,
    latestMarketDate,
  };
}
