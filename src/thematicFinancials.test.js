import { buildCompanyResearch } from './companyResearchModel';
import { buildThematicFinancials } from './thematicFinancials';

const now = new Date('2026-11-10T12:00:00Z');
const generatedAt = '2026-11-09T22:26:16.437Z';
const sourceUrl = 'https://www.sec.gov/Archives/edgar/data/1/report.htm';

const revenue = (ticker, overrides = {}) => ({
  id: `fact-${ticker}`, source: 'sec', type: 'revenue', ticker,
  value: 1234.5, unit: 'USD', periodKind: 'quarter', periodStart: '2026-04-01', periodEnd: '2026-06-30',
  filedAt: '2026-08-01', form: '10-Q', sourceUrl,
  taxonomy: 'us-gaap', factTag: 'RevenueFromContractWithCustomerExcludingAssessedTax',
  conceptLabel: 'Reported revenue', conceptLabelZh: '申報營收', extractionMethod: 'sec-companyfacts',
  classification: 'verified-standard-tag', ...overrides,
});

function financials(observations, tickers = ['NBIS', 'CRWV'], tickerHealth = {}) {
  const snapshot = { generatedAt, observations, sourceHealth: { sec: { tickers: tickerHealth } } };
  return buildThematicFinancials(tickers.map(ticker => ({ ticker, research: buildCompanyResearch(snapshot, ticker, now) })));
}

const revenueRow = (overrides, nbis = {}, health = {}) => financials([revenue('NBIS', nbis), revenue('CRWV', overrides)], undefined, health)[0];

test('matching validated standard definitions and exact fiscal periods permit a qualified comparison', () => {
  const row = revenueRow({ filedAt: '2026-08-08' }, { value: 0, classification: 'reported-zero' });
  expect(row).toMatchObject({ id: 'revenue', state: 'comparable', reasons: [] });
  expect(row.cells.map(cell => cell.status)).toEqual(['reported', 'reported']);
  expect(row.cells[0].fact).toMatchObject({
    id: 'revenue', value: 0, unit: 'USD', classification: 'reported-zero', filedAt: '2026-08-01', sourceUrl,
    periodStart: '2026-04-01', periodEnd: '2026-06-30', form: '10-Q',
  });
  expect(row.cells[1].fact).toMatchObject({ value: 1234.5, filedAt: '2026-08-08', sourceUrl });
});

test.each([
  ['different fiscal dates', { periodStart: '2026-05-01', periodEnd: '2026-07-31' }, 'period'],
  ['annual periods', { periodKind: 'annual', periodStart: '2025-07-01' }, 'period'],
  ['year-to-date periods', { periodKind: 'year-to-date', periodStart: '2026-01-01' }, 'period'],
  ['native currency', { unit: 'CNY' }, 'unit'],
  ['different reporting units', { unit: 'USD/shares' }, 'unit'],
  ['different standard tags', { factTag: 'Revenues' }, 'definition'],
  ['issuer-specific accounting definitions', { conceptLabel: 'Consolidated hosting revenue' }, 'definition'],
  ['issuer extensions', { taxonomy: 'crwv', classification: 'verified-issuer-extension' }, 'definition'],
  ['missing concept metadata', { factTag: undefined }, 'metadata'],
  ['invalid period metadata', { periodStart: '2026-04-31' }, 'metadata'],
])('shows reported facts with an explicit gap for %s', (_label, overrides, reason) => {
  const row = revenueRow(overrides);
  expect(row.state).toBe('not-comparable');
  expect(row.reasons).toContain(reason);
  expect(row.cells[1].fact.value).toBe(1234.5);
  expect(row.cells[1].fact.unit).toBe(overrides.unit || 'USD');
});

test('preserves audited not-separately-reported debt and distinguishes missing capex', () => {
  const currentDebt = revenue('NBIS', {
    type: 'currentDebt', periodKind: 'instant', periodStart: null, factTag: 'LongTermDebtCurrent',
  });
  const rows = financials([currentDebt], undefined, {
    CRWV: { factCoverage: { currentDebt: { classification: 'not-separately-reported', auditSourceUrl: sourceUrl } } },
  });
  expect(rows.map(row => row.id)).toEqual(['revenue', 'dilutedEps', 'capex', 'currentDebt', 'longTermDebt']);
  expect(rows.find(row => row.id === 'currentDebt')).toMatchObject({
    state: 'unavailable', reasons: ['insufficient-reports', 'missing-fields'],
    cells: [
      { ticker: 'NBIS', status: 'reported' },
      { ticker: 'CRWV', status: 'not-separately-reported', fact: null, missing: { auditSourceUrl: sourceUrl } },
    ],
  });
  expect(rows.find(row => row.id === 'capex').cells.every(cell => cell.status === 'unavailable' && cell.fact === null)).toBe(true);
});

test('a third company with missing evidence prevents a group-level comparability claim', () => {
  const row = financials([revenue('NBIS'), revenue('CRWV')], ['NBIS', 'CRWV', 'IREN'])[0];
  expect(row).toMatchObject({ state: 'not-comparable', reasons: ['missing-fields'] });
});

test('retains stale values and marks both stale reporting periods and stale SEC coverage', () => {
  const old = { periodKind: 'annual', periodStart: '2024-01-01', periodEnd: '2024-12-31', filedAt: '2025-03-01' };
  const row = revenueRow(old, {}, { NBIS: { status: 'ok', lastSuccessAt: '2026-10-20T00:00:00Z' } });
  expect(row.state).toBe('not-comparable');
  expect(row.reasons).toContain('stale');
  expect(row.cells[0]).toMatchObject({ status: 'stale', fact: { classification: 'verified-standard-tag' } });
  expect(row.cells[1]).toMatchObject({ status: 'stale', fact: { classification: 'stale-data', sourceUrl, ...old } });
});

test('invalid SEC source metadata and missing values remain unavailable', () => {
  const row = revenueRow({ sourceUrl: 'https://example.com/not-sec' }, { value: null });
  expect(row.state).toBe('unavailable');
  expect(row.cells.map(cell => cell.fact)).toEqual([null, null]);
});
