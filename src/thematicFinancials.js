import { FINANCIAL_METRICS } from './companyResearchModel';

const reportedClassifications = new Set(['verified-standard-tag', 'verified-issuer-extension', 'reported-zero', 'stale-data']);
const standardTaxonomies = new Set(['us-gaap', 'ifrs-full']);
const durationKinds = new Set(['quarter', 'annual', 'year-to-date']);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validPeriod(fact) {
  if (!validDate(fact.periodEnd)) return false;
  if (fact.periodKind === 'instant') return fact.periodStart == null;
  return durationKinds.has(fact.periodKind) && validDate(fact.periodStart) && fact.periodStart < fact.periodEnd;
}

function financialCell({ ticker, research }, id) {
  const fact = research?.financials?.find(item => item.id === id && Number.isFinite(item.value)
    && reportedClassifications.has(item.classification)) || null;
  const missing = fact ? null : research?.coverage?.missingFields?.find(item => item.id === id) || null;
  if (fact) {
    const stale = fact.classification === 'stale-data' || research.coverage?.status === 'stale';
    return { ticker, fact, missing, status: stale ? 'stale' : 'reported' };
  }
  const status = {
    'not-separately-reported': 'not-separately-reported',
    'stale-data': 'stale',
  }[missing?.classification] || 'unavailable';
  return { ticker, fact, missing, status };
}

function comparisonReasons(cells, id) {
  const facts = cells.flatMap(cell => cell.fact ? [cell.fact] : []);
  const reasons = [];
  if (facts.length < 2) reasons.push('insufficient-reports');
  if (facts.length !== cells.length) reasons.push('missing-fields');
  if (cells.some(cell => cell.status === 'stale')) reasons.push('stale');
  if (facts.length < 2) return reasons;

  const first = facts[0];
  const unitPattern = id === 'dilutedEps' ? /^[A-Z]{3}\/shares$/ : /^[A-Z]{3}$/;
  if (facts.some(fact => !validPeriod(fact) || !validDate(fact.filedAt) || fact.filedAt < fact.periodEnd
    || !unitPattern.test(fact.unit || '') || !fact.taxonomy || !fact.factTag || !fact.conceptLabel)) reasons.push('metadata');
  if (facts.some(fact => fact.periodKind !== first.periodKind || (fact.periodStart ?? null) !== (first.periodStart ?? null)
    || fact.periodEnd !== first.periodEnd)) reasons.push('period');
  if (facts.some(fact => fact.unit !== first.unit)) reasons.push('unit');
  if (facts.some(fact => (fact.taxonomy && !standardTaxonomies.has(fact.taxonomy))
    || fact.classification === 'verified-issuer-extension'
    || fact.taxonomy !== first.taxonomy || fact.factTag !== first.factTag
    || fact.conceptLabel !== first.conceptLabel)) reasons.push('definition');
  return reasons;
}

// Facts come from buildCompanyResearch, which already checks the SEC source, dates
// and units. A row-level label applies to the entire selected group.
export function buildThematicFinancials(companies) {
  return FINANCIAL_METRICS.map(([id, label, labelZh]) => {
    const cells = companies.map(company => financialCell(company, id));
    const reasons = comparisonReasons(cells, id);
    const state = reasons.includes('insufficient-reports') ? 'unavailable' : reasons.length ? 'not-comparable' : 'comparable';
    return { id, label, labelZh, state, reasons, cells };
  });
}
