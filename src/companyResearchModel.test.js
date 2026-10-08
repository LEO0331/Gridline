import { buildCompanyResearch, companyDevelopments } from './companyResearchModel';
import profiles from './data/companyResearch.json';

const source = profiles.find(item => item.ticker === 'VNET').sources[0];
const now = new Date('2026-10-08T12:00:00Z');
const fact = { source: 'sec', type: 'revenue', ticker: 'VNET', value: 0, unit: 'CNY', periodStart: '2025-01-01', periodEnd: '2025-12-31', filedAt: '2026-04-01', form: '20-F', sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1/report.htm' };
const snapshot = { generatedAt: '2026-10-08T00:00:00Z', observations: [fact, { source: 'company-research', type: 'companyDevelopment', ticker: 'VNET', value: { ...source, ticker: 'VNET' }, retrievedAt: '2026-10-08T00:00:00Z' }], sourceHealth: { sec: { tickers: { VNET: { status: 'ok', lastSuccessAt: '2026-10-08T00:00:00Z' } } } } };

test('native units zero values and dates remain explicit for the selected company', () => {
  const result = buildCompanyResearch(snapshot, 'VNET', now);
  expect(result.financials[0]).toMatchObject({ value: 0, unit: 'CNY', form: '20-F' });
  expect(result.events).toHaveLength(1);
  expect(buildCompanyResearch(snapshot, 'GDS', now).events.every(item => item.ticker === 'GDS' && item.url !== source.url)).toBe(true);
});

test('unsupported missing or future evidence cannot become a company outlook', () => {
  expect(buildCompanyResearch({ ...snapshot, observations: [{ ...fact, filedAt: '2027-01-01' }] }, 'VNET', now).financials).toHaveLength(0);
  expect(buildCompanyResearch({ ...snapshot, observations: [{ ...fact, value: null }] }, 'VNET', now).financials).toHaveLength(0);
  expect(companyDevelopments({ ...snapshot, observations: [{ ...snapshot.observations[1], ticker: 'GDS' }] }, 'VNET', now).every(item => item.verificationMethod === 'curated-primary-source-review')).toBe(true);
});

test('retained financial data is dated as stale without being fabricated or removed', () => {
  const result = buildCompanyResearch({ ...snapshot, sourceHealth: { sec: { tickers: { VNET: { status: 'ok', lastSuccessAt: '2026-09-01T00:00:00Z' } } } } }, 'VNET', now);
  expect(result.coverage.status).toBe('stale');
  expect(result.financials).toHaveLength(1);
});
