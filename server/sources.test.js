const test = require('node:test');
const assert = require('node:assert/strict');

async function withJsonFixture(responses, run) {
  const httpPath = require.resolve('./http');
  const sourcesPath = require.resolve('./sources');
  const http = require(httpPath);
  const original = http.getJson;
  const requests = [];
  http.getJson = async url => {
    requests.push(url);
    const key = Object.keys(responses).find(part => url.includes(part));
    if (!key) throw new Error(`Unexpected request: ${url}`);
    if (responses[key] instanceof Error) throw responses[key];
    return responses[key];
  };
  delete require.cache[sourcesPath];
  try { return await run(require('./sources'), requests); }
  finally { http.getJson = original; delete require.cache[sourcesPath]; }
}

const entry = (val, end, filed, overrides = {}) => ({ val, end, filed, form: '10-Q', accn: '0001234567-26-000001', ...overrides });

test('SEC isolates failed issuers, unmatched tickers and unavailable non-USD facts', async () => {
  await withJsonFixture({ company_tickers: { 0: { ticker: 'GOOD', cik_str: 1 }, 1: { ticker: 'BAD', cik_str: 2 } }, CIK0000000001: { filings: { recent: {} }, facts: { 'ifrs-full': { Revenue: { units: { CNY: [entry(100, '2025-12-31', '2026-03-01', { form: '20-F', start: '2025-01-01' })] } } } } }, CIK0000000002: new Error('issuer unavailable') }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['GOOD', 'BAD', 'MISSING'] });
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.tickerOutcomes.filter(item => item.status === 'degraded').map(item => item.ticker).sort(), ['BAD', 'MISSING']);
    assert.ok(result.tickerOutcomes.find(item => item.ticker === 'GOOD').missingFacts.includes('revenue'));
    assert.equal(result.observations.some(item => item.type === 'revenue'), false);
    assert.equal(result.observations[0].ticker, 'GOOD');
    assert.equal(result.tickerOutcomes.find(item => item.ticker === 'GOOD').recordCount, 1);
  });
});

test('price ingestion reports successful, partial and total ticker failures independently', async () => {
  const history = require('./price-history');
  const original = history.fetchTickerHistory;
  const sourcesPath = require.resolve('./sources');
  try {
    for (const failed of [[], ['AVGO'], ['NBIS', 'AVGO']]) {
      history.fetchTickerHistory = async ({ ticker }) => {
        if (failed.includes(ticker)) throw new Error('provider timeout');
        return { provider: 'fixture', providerUrl: 'https://example.com/prices', rows: [{ date: '2026-10-07', close: 100 }] };
      };
      delete require.cache[sourcesPath];
      const result = await require('./sources').prices({ tickers: ['NBIS', 'AVGO'] });
      assert.equal(result.status, failed.length === 0 ? 'ok' : failed.length === 2 ? 'degraded' : 'partial');
      assert.equal(result.observations.length, 2 - failed.length);
      assert.deepEqual(result.tickerOutcomes.filter(item => item.status === 'degraded').map(item => item.ticker), failed);
    }
  } finally { history.fetchTickerHistory = original; delete require.cache[sourcesPath]; }
});

test('SEC selects the latest fact period, retains its unit and links the exact filing', async () => {
  const facts = { facts: { 'us-gaap': {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
      entry(90, '2025-06-30', '2026-08-20', { start: '2025-04-01', fp: 'Q2' }),
      entry(88, '2025-06-30', '2025-08-10', { start: '2025-04-01', fp: 'Q2', accn: '0001234567-25-000001' }),
      entry(220, '2025-06-30', '2025-08-10', { start: '2025-01-01', fp: 'Q2', accn: '0001234567-25-000001' }),
      entry(130, '2026-06-30', '2026-08-10', { start: '2026-04-01', fp: 'Q2' }),
      entry(240, '2026-06-30', '2026-08-10', { start: '2026-01-01', fp: 'Q2' }),
    ], EUR: [entry(150, '2026-09-30', '2026-10-10', { start: '2026-07-01' })] } },
    EarningsPerShareDiluted: { units: { 'USD/shares': [
      entry(2.4, '2026-06-30', '2026-08-10', { start: '2026-04-01' }),
      entry(1.8, '2025-06-30', '2025-08-10', { start: '2025-04-01', accn: '0001234567-25-000001' }),
    ] } },
  } } };
  const submissions = { filings: { recent: { form: ['10-Q', '10-Q'], filingDate: ['2026-08-10', '2025-08-10'], accessionNumber: ['0001234567-26-000001', '0001234567-25-000001'], primaryDocument: ['report.htm', 'prior.htm'] } } };
  await withJsonFixture({ company_tickers: { 0: { ticker: 'TEST', cik_str: 1234567 } }, submissions: submissions, companyfacts: facts }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['TEST'] });
    assert.equal(result.tickerOutcomes[0].recordCount, result.observations.length);
    const revenue = result.observations.find(item => item.type === 'revenue');
    assert.equal(revenue.value, 130);
    assert.equal(revenue.unit, 'USD');
    assert.equal(revenue.periodStart, '2026-04-01');
    assert.equal(revenue.periodEnd, '2026-06-30');
    assert.equal(revenue.filedAt, '2026-08-10');
    assert.equal(revenue.sourceUrl, 'https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/report.htm');
    const eps = result.observations.find(item => item.type === 'dilutedEps');
    assert.equal(eps.value, 2.4);
    assert.equal(eps.unit, 'USD/shares');
    const priorRevenue = result.observations.find(item => item.type === 'revenuePrior');
    assert.equal(priorRevenue.value, 88);
    assert.equal(priorRevenue.periodStart, '2025-04-01');
    assert.equal(priorRevenue.periodEnd, '2025-06-30');
    assert.equal(priorRevenue.filedAt, '2025-08-10');
    assert.equal(priorRevenue.observedAt, '2025-08-10T00:00:00.000Z');
    assert.equal(priorRevenue.unit, 'USD');
    assert.equal(priorRevenue.sourceUrl, 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/prior.htm');
    const priorEps = result.observations.find(item => item.type === 'dilutedEpsPrior');
    assert.equal(priorEps.value, 1.8);
    assert.equal(priorEps.unit, 'USD/shares');
  });
});

test('SEC includes 20-F and 6-K issuers and uses the CompanyFacts endpoint when filing path is unavailable', async () => {
  const facts = { facts: { 'ifrs-full': {
    Revenue: { units: { USD: [entry(100, '2025-12-31', '2026-03-01', { form: '20-F', accn: '0000000001-26-000009', start: '2025-01-01' })] } },
    DilutedEarningsLossPerShare: { units: { 'USD/shares': [entry(1.5, '2026-06-30', '2026-08-01', { form: '6-K', accn: '0000000001-26-000010', start: '2026-04-01' })] } },
  } } };
  const submissions = { filings: { recent: { form: ['20-F'], filingDate: ['2026-03-01'], accessionNumber: ['0000000001-26-000009'], primaryDocument: ['annual.htm'] } } };
  await withJsonFixture({ company_tickers: { 0: { ticker: 'ADR', cik_str: 1 } }, submissions, companyfacts: facts }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['ADR'] });
    assert.ok(result.observations.find(item => item.type === 'filings').value.some(item => item.form === '20-F'));
    assert.equal(result.observations.find(item => item.type === 'revenue').sourceUrl, 'https://www.sec.gov/Archives/edgar/data/1/000000000126000009/annual.htm');
    assert.equal(result.observations.find(item => item.type === 'dilutedEps').sourceUrl, 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json');
    assert.equal(result.observations.some(item => item.type === 'revenuePrior' || item.type === 'dilutedEpsPrior'), false);
  });
});

test('SEC omits prior-year comparison when only a mismatched duration is available', async () => {
  const facts = { facts: { 'us-gaap': {
    Revenues: { units: { USD: [
      entry(100, '2026-06-30', '2026-08-10', { start: '2026-04-01' }),
      entry(200, '2025-06-30', '2025-08-10', { start: '2025-01-01', accn: '0001234567-25-000001' }),
    ] } },
  } } };
  await withJsonFixture({ company_tickers: { 0: { ticker: 'TEST', cik_str: 1234567 } }, submissions: { filings: { recent: {} } }, companyfacts: facts }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['TEST'] });
    assert.equal(result.observations.find(item => item.type === 'revenue').value, 100);
    assert.equal(result.observations.some(item => item.type === 'revenuePrior'), false);
  });
});

test('EIA requests actual PJM demand and excludes other returned measures', async () => {
  const payload = { response: { data: [
    { respondent: 'PJM', type: 'D', value: '100', period: '2026-09-22T23', 'value-units': 'megawatthours' },
    { respondent: 'PJM', type: 'DF', value: '120', period: '2026-09-22T23', 'value-units': 'megawatthours' },
    { respondent: 'OTHER', type: 'D', value: '50', period: '2026-09-22T23', 'value-units': 'megawatthours' },
    { respondent: 'PJM', type: 'D', value: 'unavailable', period: '2026-09-22T22', 'value-units': 'megawatthours' },
    { respondent: 'PJM', type: 'D', value: null, period: '2026-09-22T21', 'value-units': 'megawatthours' },
  ] } };
  await withJsonFixture({ 'region-data/data/': payload }, async ({ eia }, requests) => {
    const result = await eia({ eiaKey: 'secret' });
    assert.match(requests[0], /facets\[type\]\[\]=D/);
    assert.match(requests[0], /length=336/);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].value, 100);
    assert.equal(result.observations[0].type, 'rtoDemandActual');
    assert.equal(result.observations[0].observedAt, '2026-09-22T23:00:00.000Z');
    assert.equal(result.observations[0].sourcePeriod, '2026-09-22T23');
    assert.equal(result.observations[0].dataType, 'D');
    assert.equal(result.observations[0].sourceUrl.includes('api_key'), false);
    assert.match(result.observations[0].sourceUrl, /facets\[type\]\[\]=D/);
    assert.match(result.observations[0].sourceUrl, /start=2026-09-22T23&end=2026-09-22T23/);
  });
});
