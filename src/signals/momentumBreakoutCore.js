// Daily-close setup rules shared by the signal and retrospective simulation.
// Each point depends only on rows through that point, never on a later close.
const LOOKBACK = 20;
const MAX_AGE = 20;
const INVALIDATION_RATIO = 0.95;

function momentumBreakoutTimeline(rows = []) {
  const points = [];
  let setup = null;
  let state = 'watch';
  for (let index = LOOKBACK; index < rows.length; index += 1) {
    const row = rows[index];
    const window = rows.slice(index - LOOKBACK, index);
    const reference = Math.max(...window.map(item => Number(item.value)));
    let reason = null;
    let next = state;
    // An invalidated setup lasts for its event date. A new setup may start on a later date.
    if (state === 'invalidated') { setup = null; next = 'watch'; }
    if (!setup) {
      if (Number(row.value) > reference) {
        setup = { index, reference, breakoutClose: Number(row.value), observedAt: row.observedAt,
          referenceStart: window[0].observedAt, referenceEnd: window[window.length - 1].observedAt,
          observationIds: [...window, row].map(item => item.id).filter(Boolean) };
        next = 'breakout';
      }
    } else if (index - setup.index >= MAX_AGE) {
      next = 'invalidated'; reason = 'expired';
    } else if (Number(row.value) < setup.reference * INVALIDATION_RATIO) {
      next = 'invalidated'; reason = 'below-invalidation';
    } else if (state === 'pullback' && Number(row.value) > setup.breakoutClose) {
      next = 'reconfirmed';
    } else if (state !== 'pullback' && Number(row.value) < setup.breakoutClose) {
      next = 'pullback';
    }
    const value = { close: Number(row.value), referencePrice: setup?.reference ?? reference,
      breakoutClose: setup?.breakoutClose ?? null, breakoutAt: setup?.observedAt ?? null,
      referenceStart: setup?.referenceStart ?? window[0].observedAt,
      referenceEnd: setup?.referenceEnd ?? window[window.length - 1].observedAt,
      setupAgeSessions: setup ? index - setup.index : null, reason };
    points.push({ observedAt: row.observedAt, state: next, value, changed: next !== state,
      observationIds: setup?.observationIds || [...window, row].map(item => item.id).filter(Boolean),
      observationId: row.id || null, sourceUrl: row.sourceUrl || null, provider: row.provider || null });
    state = next;
  }
  return points;
}

module.exports = { momentumBreakoutTimeline, LOOKBACK, MAX_AGE, INVALIDATION_RATIO };
