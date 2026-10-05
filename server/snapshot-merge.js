function observationKey(item) {
  if (item?.id) return `id:${item.id}`;
  return JSON.stringify([
    item?.source || '', item?.type || '', item?.ticker || '', item?.region || '',
    item?.observedAt || '', item?.value ?? null,
  ]);
}

function mergeSnapshotObservations(previous = [], fresh = [], outcomes = []) {
  const successful = new Set((outcomes || []).filter(item => item.status === 'ok').map(item => item.source));
  const retained = (previous || []).filter(item => item.source === 'events' || !successful.has(item.source));
  const merged = new Map();
  for (const item of [...retained, ...(fresh || [])]) merged.set(observationKey(item), item);
  return [...merged.values()].sort((a, b) => {
    const sourceOrder = String(a.source || '').localeCompare(String(b.source || ''));
    if (sourceOrder) return sourceOrder;
    const dateOrder = String(a.observedAt || '').localeCompare(String(b.observedAt || ''));
    if (dateOrder) return dateOrder;
    return observationKey(a).localeCompare(observationKey(b));
  });
}

function mergeSnapshotHealth(previous = {}, current = {}, observations = []) {
  const sources = new Set([...Object.keys(previous || {}), ...Object.keys(current || {})]);
  const merged = {};
  for (const source of sources) {
    const prior = previous?.[source] || {};
    const next = current?.[source] || {};
    const priorWithoutDegradedMarkers = { ...prior };
    delete priorWithoutDegradedMarkers.retainedRecordCount;
    delete priorWithoutDegradedMarkers.qualityReviewedAt;
    const retainedCount = (observations || []).filter(item => item.source === source).length;
    const degraded = next.status === 'degraded';
    const eventSources = next.coverage?.sources && Object.fromEntries(Object.entries(next.coverage.sources).map(([name, state]) => {
      const lastSuccessAt = state.lastSuccessAt || prior.coverage?.sources?.[name]?.lastSuccessAt;
      return [name, { ...state, ...(lastSuccessAt ? { lastSuccessAt } : {}) }];
    }));
    merged[source] = {
      ...priorWithoutDegradedMarkers,
      ...next,
      ...(eventSources ? { coverage: { ...next.coverage, sources: eventSources } } : {}),
      ...(source === 'events' && degraded && !next.coverage ? { coverage: null } : {}),
      ...(degraded && !next.lastSuccessAt && prior.lastSuccessAt ? { lastSuccessAt: prior.lastSuccessAt } : {}),
      ...(degraded ? { retainedRecordCount: retainedCount } : {}),
    };
  }
  return merged;
}

module.exports = { mergeSnapshotObservations, mergeSnapshotHealth, observationKey };
