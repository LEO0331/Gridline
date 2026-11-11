const { addCalendarDays, calendarDate, validateCatalysts } = require('../src/researchCalendarModel');

const sameValue = (a, b) => a === b || (a && b && Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b));
const sameSchedule = (a, b) => a.precision === b.precision && sameValue(a.start, b.start) && sameValue(a.end, b.end);
const origin = event => new URL(event.sourceUrl).hostname.replace(/^www\./, '');
const sameAssociation = (a, b) => a.category === b.category && JSON.stringify(a.tickers || []) === JSON.stringify(b.tickers || []);
const allowedProofs = ['schedule', 'reschedule', 'cancellation'];
const sourceDay = (event, field = 'start') => {
  const value = event[field];
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return event.precision === 'date' ? value : calendarDate(value);
};

function verification(candidate, checkedAt) {
  return {
    verifiedAt: checkedAt,
    verificationMethod: candidate.method,
    verificationSourceUrl: candidate.endpoint,
  };
}

function manualProvenance(existing, sourceUrl) {
  if (!existing?.reviewedAt) return {};
  const original = existing.manualReviewSourceUrl || existing.sourceUrl;
  return { reviewedAt: existing.reviewedAt, ...(original !== sourceUrl ? { manualReviewSourceUrl: original } : {}) };
}

function proposedEvent(candidate, existing, checkedAt) {
  const { event, proof } = candidate;
  if (existing && (!sameAssociation(existing, event) || origin(existing) !== origin(event))) {
    return { reason: 'Existing identity has a different publisher, category or issuer.' };
  }
  if (!existing && proof !== 'schedule') return { reason: 'A revision requires an existing matching occurrence.' };
  if (existing?.status === 'completed') return { reason: 'A completed occurrence requires human review.' };
  const metadata = verification(candidate, checkedAt);
  if (proof === 'cancellation') {
    if (event.status !== 'canceled') return { reason: 'Cancellation status requires explicit publisher evidence.' };
    if (existing.status === 'canceled') return { classification: 'unchanged' };
    if (!sameSchedule(existing, event)) return { reason: 'Cancellation evidence conflicts with the retained schedule.' };
    return { classification: 'canceled', record: { ...existing, ...metadata,
      ...manualProvenance(existing, event.sourceUrl), sourceUrl: event.sourceUrl, status: 'canceled' } };
  }
  if (!['scheduled', 'tentative'].includes(event.status) || existing?.status === 'canceled') {
    return { reason: 'The reported schedule status requires human review.' };
  }
  const scheduleChanged = existing && !sameSchedule(existing, event);
  if (scheduleChanged && proof !== 'reschedule') return { reason: 'The official date differs without an explicit rescheduling notice.' };
  if (scheduleChanged && candidate.evidence?.previousStartDate &&
    !sameValue(existing.start, candidate.evidence.previousStartDate)) {
    return { reason: 'The publisher’s previous date differs from the retained schedule.' };
  }
  if (existing && !scheduleChanged && (existing.status === event.status ||
    (existing.status === 'rescheduled' && event.status === 'scheduled'))) return { classification: 'unchanged' };

  const record = { ...event, ...metadata, ...manualProvenance(existing, event.sourceUrl) };
  if (existing?.titleZh && existing.title === event.title && !record.titleZh) record.titleZh = existing.titleZh;
  if (!record.titleZh) record.originalLanguage = true;
  if (scheduleChanged) {
    record.status = 'rescheduled';
    if (!sameValue(existing.start, event.start) || existing.precision !== event.precision) record.previousStart = existing.start;
    else if (existing.previousStart) record.previousStart = existing.previousStart;
  }
  return { classification: !existing ? 'added' : scheduleChanged ? 'rescheduled' : 'status-updated', record };
}

function reconcileCalendar(registry, candidates, { now = new Date(), pastDays = 30, futureDays = 90 } = {}) {
  const baseline = validateCatalysts(registry);
  if (baseline.rejected.length) throw new Error('The current calendar registry failed validation.');
  const checkedAt = new Date(now).toISOString();
  const today = calendarDate(now);
  const window = { start: addCalendarDays(today, -pastDays), end: addCalendarDays(today, futureDays) };
  const records = new Map(registry.map(event => [event.id, event]));
  const groups = new Map();
  const reviews = [];
  const counts = { added: 0, unchanged: 0, rescheduled: 0, canceled: 0, 'status-updated': 0, review: 0, excluded: 0, pruned: 0 };
  const review = (candidate, reason) => {
    counts.review += 1;
    const existing = records.get(candidate.event?.id);
    reviews.push({ ...candidate, reason, ...(existing ? { existing } : {}) });
  };

  for (const candidate of candidates) {
    const event = candidate.event || {};
    const day = sourceDay(event);
    const end = sourceDay(event, 'end') || day;
    const pastUntrackedSchedule = candidate.proof === 'schedule' && !records.has(event.id) && end && end < today;
    if (candidate.proof === 'excluded' || pastUntrackedSchedule || (day && (end < window.start || day > window.end))) {
      counts.excluded += 1;
      continue;
    }
    if (candidate.proof === 'review') {
      review(candidate, candidate.reason || 'The source needs human review.');
      // A conflicting proposed date for the same occurrence blocks automatic acceptance.
      if (!candidate.identity || !day) continue;
    } else if (!allowedProofs.includes(candidate.proof) || !candidate.identity || candidate.identity !== event.id ||
      validateCatalysts([{ ...event, ...verification(candidate, checkedAt), ...(!event.titleZh ? { originalLanguage: true } : {}) }]).rejected.length) {
      review(candidate, 'Candidate identity, schedule or source verification failed validation.');
      continue;
    }
    const group = groups.get(candidate.identity) || [];
    group.push(candidate);
    groups.set(candidate.identity, group);
  }

  for (const [id, group] of groups) {
    const strong = group.filter(candidate => candidate.proof !== 'review');
    if (!strong.length) continue;
    const candidate = strong.find(item => item.proof === 'reschedule') || strong[0];
    if (group.some(other => !sameAssociation(candidate.event, other.event) || !sameSchedule(candidate.event, other.event) ||
      (other.event.status && other.event.status !== candidate.event.status))) {
      for (const item of strong) review(item, 'Official candidates conflict for the same occurrence.');
      continue;
    }
    if (!records.has(id) && candidate.event.category !== 'macro' && [...records.values()].some(event =>
      sameAssociation(event, candidate.event) && origin(event) === origin(candidate.event) && sameSchedule(event, candidate.event))) {
      review(candidate, 'The same publisher already has a matching schedule under a different identity.');
      continue;
    }
    const result = proposedEvent(candidate, records.get(id), checkedAt);
    if (result.reason || (result.record && validateCatalysts([result.record]).rejected.length)) {
      review(candidate, result.reason || 'The proposed registry record failed validation.');
      continue;
    }
    counts[result.classification] += 1;
    if (result.record) records.set(id, result.record);
  }

  // Retention runs alongside accepted changes. An outage alone never edits the registry.
  if (counts.added || counts.rescheduled || counts.canceled || counts['status-updated']) {
    const cutoff = addCalendarDays(today, -180);
    for (const [id, event] of records) {
      if ((sourceDay(event, 'end') || sourceDay(event)) < cutoff && (!event.verifiedAt || calendarDate(event.verifiedAt) < cutoff)) {
        records.delete(id);
        counts.pruned += 1;
      }
    }
  }
  const result = [...records.values()];
  if (validateCatalysts(result).rejected.length) throw new Error('Reconciled calendar registry failed validation.');
  return { registry: result, checkedAt, window, counts, candidates: reviews };
}

module.exports = { reconcileCalendar };
