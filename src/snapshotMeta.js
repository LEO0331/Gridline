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

export function summarizeSnapshot(snapshot = emptySnapshot, language = 'en', timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const date = new Date(snapshot.generatedAt || '');
  const valid = Number.isFinite(date.getTime());
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
    freshness: snapshot.freshness || 'unknown',
    latestMarketDate,
  };
}
