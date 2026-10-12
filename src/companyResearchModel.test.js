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

test('published snapshot provides revenue EPS filings and sourced research for all20 tracked companies', () => {
  const published = require('../public/data/dashboard-snapshot.json');
  const asOf = new Date(published.generatedAt);
  for (const ticker of published.trackedTickers) {
    const research = buildCompanyResearch(published, ticker, asOf);
    expect(research.financials.map(item => item.id)).toEqual(expect.arrayContaining(['revenue', 'dilutedEps']));
    expect(research.filings.length).toBeGreaterThan(0);
    expect(research.events.length).toBeGreaterThan(0);
    expect(research.events.every(item => item.ticker === ticker)).toBe(true);
  }
  expect(buildCompanyResearch(published, 'GDS', asOf).financials.find(item => item.id === 'revenue').unit).toBe('CNY');
});

test('field definitions and audited missing classifications remain explicit', () => {
  const result = buildCompanyResearch({ ...snapshot, observations: [{ ...fact, type: 'currentDebt', value: 15, conceptLabel: 'Current portion of long-term debt', conceptLabelZh: '一年內到期長期借款', classification: 'verified-issuer-extension', extractionMethod: 'inline-xbrl' }], sourceHealth: { sec: { tickers: { VNET: { factCoverage: { capex: { classification: 'not-separately-reported', sourceUrl: fact.sourceUrl, periodEnd: fact.periodEnd } } } } } } }, 'VNET', now);
  expect(result.financials[0]).toMatchObject({ label: 'Current portion of long-term debt', labelZh: '一年內到期長期借款', classification: 'verified-issuer-extension', extractionMethod: 'inline-xbrl' });
  expect(result.coverage.missingFields[0]).toMatchObject({ id: 'capex', classification: 'not-separately-reported', sourceUrl: fact.sourceUrl });
});

test('SEC mirrors bind to the tracked issuer accession and retain original source and review date', () => {
  const profile = profiles.find(item => item.ticker === 'VNET');
  const accession = '0001104659-26-000001';
  const item = { ...source, ticker: 'VNET', issuerCik: profile.issuerCik, accession, verificationStatus: 'official-fallback-verified', originalSourceUrl: source.url, url: `https://www.sec.gov/Archives/edgar/data/${Number(profile.issuerCik)}/${accession.replace(/-/g, '')}/release.htm` };
  const record = { source: 'company-research', type: 'companyDevelopment', ticker: 'VNET', value: item, retrievedAt: '2026-10-08T00:00:00Z' };
  const result = companyDevelopments({ ...snapshot, observations: [record] }, 'VNET', now);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ url: item.url, originalSourceUrl: source.url, verificationStatus: 'official-fallback-verified', automaticVerifiedAt: record.retrievedAt, reviewedAt: profile.reviewedAt });
  expect(companyDevelopments({ ...snapshot, observations: [{ ...record, value: { ...item, issuerCik: '123' } }] }, 'VNET', now)[0].verificationStatus).toBe('retained-reviewed');
  expect(companyDevelopments({ ...snapshot, observations: [{ ...record, value: { ...item, url: item.url.replace(accession.replace(/-/g, ''), '999') } }] }, 'VNET', now)[0].verificationStatus).toBe('retained-reviewed');
});

test('manual review is never labeled as an automatic verification', () => {
  const item = companyDevelopments({ ...snapshot, observations: [] }, 'VNET', now)[0];
  expect(item.verificationStatus).toBe('retained-reviewed');
  expect(item.reviewedAt).toBeTruthy();
  expect(item.automaticVerifiedAt).toBeUndefined();
});

test('old supported values retain their source and period with an explicit stale classification', () => {
  const result = buildCompanyResearch({ ...snapshot, observations: [{ ...fact, periodEnd: '2024-12-31', filedAt: '2025-04-01' }] }, 'VNET', now);
  expect(result.financials[0]).toMatchObject({ classification: 'stale-data', value: 0, unit: 'CNY', periodEnd: '2024-12-31', sourceUrl: fact.sourceUrl });
});
