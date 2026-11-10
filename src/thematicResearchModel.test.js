import { companies as registry } from './companyRegistry';
import { marketContext } from './marketContext';
import { buildThematicResearch, selectedThemeTickers, themeCompanies } from './thematicResearchModel';
import { easternParts, isNyseTradingDay } from './us-market-calendar';

const now = new Date('2026-11-09T22:30:00Z');
const generatedAt = '2026-11-09T22:26:16.437Z';
const snapshot = (observations = [], extra = {}) => ({ generatedAt, observations, ...extra });
const days = Array.from({ length: 110 }, (_, index) => new Date(Date.UTC(2026, 10, 9 - index, 17)))
  .filter(day => isNyseTradingDay(easternParts(day))).slice(0, 65).reverse();
const rows = (ticker, step = 1, providerName = 'Fixture Provider') => days.map((day, index) => ({
  id: `${ticker}-${index}`, ticker, source: 'prices', type: 'close', observedAt: day.toISOString().slice(0, 10),
  value: 100 + index * step, sourceUrl: `https://example.com/${ticker}`, providerName,
}));

test('defaults to Neocloud and selects enabled companies in canonical registry order', () => {
  const initial = themeCompanies({}, 'unsupported');
  expect(initial.theme.id).toBe('neocloud');
  expect(selectedThemeTickers(initial.companies)).toEqual(['NBIS', 'CRWV']);
  const power = themeCompanies({}, 'power');
  expect(power.companies).toEqual(registry.filter(company => power.theme.tickers.includes(company.ticker)));
  expect(selectedThemeTickers(power.companies)).toEqual(power.companies.slice(0, 4).map(company => company.ticker));
  const subset = themeCompanies({ trackedTickers: ['NBIS', 'ANET'] }, 'hardware');
  expect(selectedThemeTickers(subset.companies, ['AVGO', 'ANET', 'ANET', 'missing'])).toEqual(['ANET']);
  expect(selectedThemeTickers(themeCompanies({ trackedTickers: ['NBIS'] }, 'hardware').companies)).toEqual([]);
});

test('preserves valid requested companies, removes duplicates and caps or fills the comparison', () => {
  const { companies } = themeCompanies({}, 'power');
  const tickers = companies.map(company => company.ticker);
  expect(selectedThemeTickers(companies, ['BE', 'NBIS', 'BE'])).toEqual([tickers[0], 'BE']);
  expect(selectedThemeTickers(companies, ['NBIS', 'ANET'])).toEqual(tickers.slice(0, 2));
  expect(selectedThemeTickers(companies, [...tickers].reverse())).toEqual(tickers.slice(0, 4));
  expect(selectedThemeTickers(companies, ['BE', 'CEG'])).toEqual(tickers.filter(ticker => ['BE', 'CEG'].includes(ticker)));
});

test('preserves independent market windows and source identities without peer ranks', () => {
  const observations = [...rows('NBIS', 2), ...rows('CRWV', -0.5).filter((_, index) => index !== 60), ...rows('SPY'), ...rows('QQQ', 1.5)];
  const prices = { status: 'partial', tickers: { NBIS: { status: 'ok', checkedAt: generatedAt } } };
  const input = snapshot(observations, { sourceHealth: { prices } });
  const { market } = buildThematicResearch(input, { now });
  const reference = marketContext(input, ['NBIS', 'CRWV'], now);
  expect(market).toMatchObject({ expectedSession: '2026-11-09', above: 1, coverage: 2, total: 2, participation: 50, sourceHealth: prices });
  expect(market.companies.map(company => company.ticker)).toEqual(['NBIS', 'CRWV']);
  expect(market.companies[0]).toMatchObject({ closeStatus: 'current', latest: { id: 'NBIS-64', sourceUrl: 'https://example.com/NBIS' }, sourceHealth: prices.tickers.NBIS });
  expect(market.companies.map(company => company.comparisonCoverage)).toEqual(reference.companies.map(company => company.comparisonCoverage));
  expect(market.differentWindows).toEqual({ SPY: { 20: true, 60: true }, QQQ: { 20: true, 60: true } });
  expect(market.companies[0].comparisons.SPY[60]).toMatchObject({
    end: '2026-11-09', provider: 'Fixture Provider', stockSourceUrl: 'https://example.com/NBIS', benchmarkSourceUrl: 'https://example.com/SPY',
    observationIds: expect.arrayContaining(['NBIS-64', 'SPY-64']),
  });
});

test('qualifies participation against the enabled theme, not only the selected companies', () => {
  const { market } = buildThematicResearch(snapshot(rows('BE')), { themeId: 'power', tickers: ['VRT', 'ETN'], now });
  expect(market).toMatchObject({ above: 1, coverage: 1, total: 6, participation: 100 });
});

test('preserves stale closes but withholds eligible MA20 and benchmark-relative results', () => {
  const { market } = buildThematicResearch(snapshot([...rows('NBIS'), ...rows('SPY')]), { now: '2026-11-10T22:00:00Z' });
  expect(market).toMatchObject({ expectedSession: '2026-11-10', coverage: 0, participation: null });
  expect(market.companies[0]).toMatchObject({ closeStatus: 'retained', latest: { date: '2026-11-09' }, above: null });
  expect(market.companies[0].comparisonCoverage.SPY[20]).toMatchObject({ reason: 'stale-endpoint', comparison: null });
  expect(market.companies[1]).toMatchObject({ closeStatus: 'unavailable', above: null });
});

test('preserves missing, thin overlap and incompatible-provider explanations', () => {
  const observations = [...rows('NBIS'), ...rows('CRWV').slice(-8), ...rows('SPY', 1, 'Different provider')];
  const { market } = buildThematicResearch(snapshot(observations), { now });
  expect(market.companies[0].comparisonCoverage.QQQ[20].reason).toBe('missing-observations');
  expect(market.companies[0].comparisonCoverage.SPY[20].reason).toBe('incompatible-provider');
  expect(market.companies[1].comparisonCoverage.SPY[20]).toMatchObject({
    reason: 'insufficient-overlap', overlappingObservations: 8, requiredObservations: 21, comparison: null,
  });
  expect(market.differentWindows.SPY[20]).toBe(false);
});

test('a non-session row does not appear as the latest eligible close', () => {
  const saturday = { ...rows('NBIS').at(-1), id: 'weekend', observedAt: '2026-11-07', value: 999 };
  const observations = [...rows('NBIS').slice(0, -1), saturday];
  const result = buildThematicResearch(snapshot(observations), { now });
  expect(result.market.companies[0]).toMatchObject({ closeStatus: 'retained', latest: { date: '2026-11-06' } });
});

test('keeps validated developments, their verification dates, and older retained reviewed evidence', () => {
  const publishedAt = '2026-11-04T00:00:00Z';
  const retrievedAt = '2026-11-05T00:00:00Z';
  const url = 'https://nebius.com/test-fixture';
  const development = { source: 'company-research', type: 'companyDevelopment', ticker: 'NBIS', retrievedAt,
    value: { ticker: 'NBIS', title: 'Synthetic test disclosure', publishedAt, url } };
  const { evidence, questions } = buildThematicResearch(snapshot([development]), { now });
  expect(evidence[0].research.events[0]).toMatchObject({ url, publishedAt, retrievedAt, automaticVerifiedAt: retrievedAt, verificationStatus: 'primary-verified', archived: false });
  expect(evidence[1].research.events[0]).toMatchObject({ verificationStatus: 'retained-reviewed', archived: true });
  expect(evidence.every(item => item.relationships.length === 0)).toBe(true);
  expect(questions[0]).toMatchObject({ ticker: 'NBIS', sourceUrl: url, supportEn: evidence[0].research.profile.risks });
});

test('asks about documented relationships without inferring an operational milestone', () => {
  const { evidence, questions } = buildThematicResearch(snapshot(), { themeId: 'compute', now });
  const cipher = evidence.find(item => item.ticker === 'CIFR');
  expect(cipher.relationships).toHaveLength(1);
  expect(cipher.relationships[0]).toMatchObject({ grid: 'ERCOT', facility: 'Apollo development site' });
  expect(evidence.find(item => item.ticker === 'IREN').relationships).toEqual([]);
  expect(questions[0]).toMatchObject({
    ticker: 'CIFR', en: 'What dated official evidence would establish the next milestone for Apollo development site?',
    supportEn: expect.stringContaining('not operating or energized capacity'),
    sourceUrl: cipher.relationships[0].sourceUrl,
  });
  expect(questions).toHaveLength(3);
});

test('asks about a missing financial field only when the reviewed gap has a supported audit source', () => {
  const auditSourceUrl = 'https://www.sec.gov/Archives/edgar/data/1513845/test';
  const sourceHealth = { sec: { tickers: { NBIS: { missingFacts: ['currentDebt'], factCoverage: {
    currentDebt: { classification: 'not-separately-reported', auditSourceUrl },
  } } } } };
  const { questions } = buildThematicResearch(snapshot([], { sourceHealth }), { now });
  expect(questions[0]).toMatchObject({ ticker: 'NBIS', en: expect.stringMatching(/official filing/), sourceUrl: auditSourceUrl });
});

test('keeps developments and questions empty without qualifying dated evidence', () => {
  const { evidence, questions } = buildThematicResearch({ generatedAt: '2026-09-01T12:00:00Z' }, { now });
  expect(evidence.map(item => item.research.events)).toEqual([[], []]);
  expect(questions).toEqual([]);
});
