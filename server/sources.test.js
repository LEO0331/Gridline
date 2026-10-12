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
  try {
    const sources = require('./sources');
    return await run({ ...sources, sec: config => sources.sec({ asOf: '2026-10-08T00:00:00Z', ...config }) }, requests);
  }
  finally { http.getJson = original; delete require.cache[sourcesPath]; }
}

const entry = (val, end, filed, overrides = {}) => ({ val, end, filed, form: '10-Q', accn: '0001234567-26-000001', ...overrides });

test('VNET extension revenue backfills from consolidated annual XBRL instead of stale standard tags', async () => {
  const http = require('./http'); const originalText = http.getText;
  const html = '<xbrli:context id="all"><xbrli:entity><xbrli:identifier>1508475</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context><xbrli:unit id="cny"><xbrli:measure>iso4217:CNY</xbrli:measure></xbrli:unit><ix:nonFraction name="vnet:HostingAndRelatedServicesRevenue" contextRef="all" unitRef="cny" scale="3">9,949,261</ix:nonFraction>';
  http.getText = async url => { assert.ok(url.endsWith('vnet-report.htm')); return html; };
  try {
    await withJsonFixture({ company_tickers: { 0: { ticker: 'VNET', cik_str: 1508475 } }, submissions: { filings: { recent: { form: ['20-F'], filingDate: ['2026-04-16'], accessionNumber: ['0001104659-26-044361'], primaryDocument: ['vnet-report.htm'] } } }, companyfacts: { facts: { 'us-gaap': { RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [entry(100, '2019-12-31', '2020-04-02', { start: '2019-01-01', form: '20-F' })] } } } } } }, async ({ sec }) => {
      const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['VNET'] });
      const revenue = result.observations.find(item => item.type === 'revenue');
      assert.equal(revenue.value, 9949261000);
      assert.equal(revenue.unit, 'CNY');
      assert.equal(revenue.taxonomy, 'vnet');
      assert.equal(revenue.periodKind, 'annual');
      assert.ok(revenue.sourceUrl.endsWith('vnet-report.htm'));
    });
  } finally { http.getText = originalText; }
});

test('SEC isolates failed issuers and unmatched tickers while retaining native-currency facts', async () => {
  await withJsonFixture({ company_tickers: { 0: { ticker: 'GOOD', cik_str: 1 }, 1: { ticker: 'BAD', cik_str: 2 } }, CIK0000000001: { filings: { recent: {} }, facts: { 'ifrs-full': { Revenue: { units: { CNY: [entry(100, '2025-12-31', '2026-03-01', { form: '20-F', start: '2025-01-01' })] } } } } }, CIK0000000002: new Error('issuer unavailable') }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['GOOD', 'BAD', 'MISSING'] });
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.tickerOutcomes.filter(item => item.status === 'degraded').map(item => item.ticker).sort(), ['BAD', 'MISSING']);
    assert.ok(!result.tickerOutcomes.find(item => item.ticker === 'GOOD').missingFacts.includes('revenue'));
    assert.equal(result.observations.find(item => item.type === 'revenue').unit, 'CNY');
    assert.equal(result.observations[0].ticker, 'GOOD');
    assert.equal(result.tickerOutcomes.find(item => item.ticker === 'GOOD').recordCount, 2);
  });
});

test('SEC matches annual native-currency ADR facts', async () => {
  const facts = { facts: { 'ifrs-full': { Revenue: { units: { CNY: [
    entry(100, '2025-12-31', '2026-04-01', { start: '2025-01-01', form: '20-F' }),
    entry(80, '2024-12-31', '2025-04-01', { start: '2024-01-01', form: '20-F' }),
  ] } } } } };
  await withJsonFixture({ company_tickers: { 0: { ticker: 'ADR', cik_str: 1 } }, submissions: { filings: { recent: {} } }, companyfacts: facts }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['ADR'] });
    assert.equal(result.observations.find(row => row.type === 'revenue').value, 100);
    assert.equal(result.observations.find(row => row.type === 'revenue').periodKind, 'annual');
    assert.equal(result.observations.find(row => row.type === 'revenuePrior').value, 80);
    assert.equal(result.observations.find(row => row.type === 'revenuePrior').unit, 'CNY');
    assert.equal(result.tickerOutcomes[0].factCoverage.revenue.comparison, 'annual');
  });
});

test('SEC retains the latest half-year disclosure over an older annual report without a growth comparison', async () => {
  const facts = { facts: { 'ifrs-full': { Revenue: { units: { CNY: [
    entry(100, '2025-12-31', '2026-04-01', { start: '2025-01-01', form: '20-F' }),
    entry(80, '2024-12-31', '2025-04-01', { start: '2024-01-01', form: '20-F' }),
    entry(60, '2026-06-30', '2026-08-01', { start: '2026-01-01', form: '6-K' }),
    entry(40, '2025-06-30', '2025-08-01', { start: '2025-01-01', form: '6-K' }),
  ] } } } } };
  await withJsonFixture({ company_tickers: { 0: { ticker: 'ADR', cik_str: 1 } }, submissions: { filings: { recent: {} } }, companyfacts: facts }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['ADR'], asOf: '2026-10-08' });
    const current = result.observations.find(row => row.type === 'revenue');
    assert.equal(current.value, 60);
    assert.equal(current.periodEnd, '2026-06-30');
    assert.equal(current.periodKind, 'year-to-date');
    assert.equal(result.observations.some(row => row.type === 'revenuePrior'), false);
    assert.equal(result.tickerOutcomes[0].factCoverage.revenue.comparison, null);
  });
});

test('SEC does not use future filings, currency changes or taxonomy changes as comparable annual facts', async () => {
  const facts = { facts: { 'ifrs-full': { Revenue: { units: {
    CNY: [entry(100, '2025-12-31', '2026-04-01', { start: '2025-01-01', form: '20-F' }), entry(999, '2026-12-31', '2027-04-01', { start: '2026-01-01', form: '20-F' })],
    EUR: [entry(80, '2024-12-31', '2025-04-01', { start: '2024-01-01', form: '20-F' })],
  } } }, 'us-gaap': { Revenues: { units: { CNY: [entry(80, '2024-12-31', '2025-04-01', { start: '2024-01-01', form: '20-F' })] } } } } };
  await withJsonFixture({ company_tickers: { 0: { ticker: 'ADR', cik_str: 1 } }, submissions: { filings: { recent: {} } }, companyfacts: facts }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['ADR'], asOf: '2026-10-08' });
    assert.equal(result.observations.find(row => row.type === 'revenue').value, 100);
    assert.equal(result.observations.some(row => row.type === 'revenuePrior'), false);
  });
});

test('SEC retains native capex YTD, debt instant and per-share currency without converting or combining them', async () => {
  const facts = { facts: { 'ifrs-full': {
    PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities: { units: { CNY: [
      entry(10, '2025-12-31', '2026-04-01', { start: '2025-01-01', form: '20-F' }),
      entry(8, '2026-06-30', '2026-08-01', { start: '2026-01-01', form: '6-K' }),
    ] } },
    CurrentBorrowings: { units: { CNY: [entry(3, '2026-06-30', '2026-08-01', { form: '6-K' })] } },
    NoncurrentBorrowings: { units: { CNY: [entry(30, '2026-06-30', '2026-08-01', { form: '6-K' })] } },
    DilutedEarningsLossPerShare: { units: { 'CNY/shares': [entry(-2, '2025-12-31', '2026-04-01', { start: '2025-01-01', form: '20-F' })], shares: [entry(999, '2025-12-31', '2026-04-01', { form: '20-F' })] } },
  } } };
  await withJsonFixture({ company_tickers: { 0: { ticker: 'ADR', cik_str: 1 } }, submissions: { filings: { recent: {} } }, companyfacts: facts }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['ADR'], asOf: '2026-10-08' });
    assert.equal(result.observations.find(row => row.type === 'capex').value, 8);
    assert.equal(result.observations.find(row => row.type === 'capex').periodKind, 'year-to-date');
    assert.equal(result.observations.find(row => row.type === 'currentDebt').value, 3);
    assert.equal(result.observations.find(row => row.type === 'longTermDebt').periodKind, 'instant');
    assert.equal(result.observations.find(row => row.type === 'dilutedEps').unit, 'CNY/shares');
    assert.equal(result.observations.find(row => row.type === 'dilutedEps').value, -2);
    assert.deepEqual(result.tickerOutcomes[0].missingFacts, ['revenue']);
  });
});

test('SEC chooses a newer native reporting quarter before older USD, and USD only for the same period', async () => {
  const responses = { company_tickers: { 0: { ticker: 'ADR', cik_str: 1 } }, submissions: { filings: { recent: {} } }, companyfacts: { facts: { 'us-gaap': { Revenues: { units: {
    USD: [entry(30, '2025-12-31', '2026-04-01', { start: '2025-01-01', form: '20-F' }), entry(28, '2024-12-31', '2025-04-01', { start: '2024-01-01', form: '20-F' })],
    CNY: [entry(100, '2026-06-30', '2026-08-01', { start: '2026-04-01', form: '6-K' }), entry(180, '2026-06-30', '2026-08-01', { start: '2026-01-01', form: '6-K' }), entry(80, '2025-06-30', '2025-08-01', { start: '2025-04-01', form: '6-K' })],
  } } } } } };
  await withJsonFixture(responses, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['ADR'], asOf: '2026-10-08' });
    const current = result.observations.find(row => row.type === 'revenue');
    assert.equal(current.unit, 'CNY');
    assert.equal(current.value, 100);
    assert.equal(current.periodStart, '2026-04-01');
    assert.equal(result.observations.find(row => row.type === 'revenuePrior').unit, 'CNY');
  });
  responses.companyfacts.facts['us-gaap'].Revenues.units.USD.push(entry(14, '2026-06-30', '2026-08-01', { start: '2026-04-01', form: '6-K' }));
  await withJsonFixture(responses, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['ADR'], asOf: '2026-10-08' });
    assert.equal(result.observations.find(row => row.type === 'revenue').unit, 'USD');
    assert.equal(result.observations.some(row => row.type === 'revenuePrior'), false);
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
    assert.equal(result.observations.find(item => item.type === 'filings').value[0].sourceUrl, revenue.sourceUrl);
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

test('financial coverage distinguishes explicitly reported zero, stale and unavailable without inventing totals', async () => {
  const facts = { facts: { 'us-gaap': {
    LongTermDebtCurrent: { units: { USD: [entry(0, '2026-06-30', '2026-08-01')] } },
    LongTermDebtNoncurrent: { units: { USD: [entry(200, '2023-12-31', '2024-03-01')] } },
  } } };
  await withJsonFixture({ company_tickers: { 0: { ticker: 'TEST', cik_str: 1 } }, submissions: { filings: { recent: {} } }, companyfacts: facts }, async ({ sec }) => {
    const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['TEST'] });
    const coverage = result.tickerOutcomes[0].factCoverage;
    assert.equal(coverage.currentDebt.classification, 'reported-zero');
    assert.equal(coverage.currentDebt.conceptLabel, 'Current portion of long-term borrowings');
    assert.equal(result.observations.find(row => row.type === 'currentDebt').value, 0);
    assert.equal(coverage.longTermDebt.classification, 'stale-data');
    assert.equal(coverage.longTermDebt.periodEnd, '2023-12-31');
    assert.equal(coverage.capex.classification, 'unavailable');
    assert.equal(coverage.capex.available, false);
    assert.equal(result.observations.some(row => row.type === 'capex' || row.type === 'longTermDebt'), false);
  });
});

test('audited standard alternatives retain their definitions and never combine totals', async () => {
  const cases = [
    ['ORCL', 'currentDebt', 'NotesPayableCurrent', 7625000000, 'other borrowings'],
    ['ORCL', 'longTermDebt', 'LongTermNotesPayable', 122342000000, 'other borrowings'],
    ['APLD', 'currentDebt', 'NotesPayableCurrent', 112645000, 'reported debt'],
    ['APLD', 'longTermDebt', 'LongTermNotesPayable', 6263947000, 'reported debt'],
    ['APLD', 'capex', 'PaymentsToAcquireProductiveAssets', 2074698000, 'productive assets', '2026-06-01', '2026-08-31'],
    ['EQIX', 'capex', 'PaymentsToAcquireOtherPropertyPlantAndEquipment', 2834000000, 'excludes real estate', '2026-01-01'],
    ['EQIX', 'longTermDebt', 'LongTermDebt', 19873000000, 'including current'],
    ['ETN', 'currentDebt', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 11000000, 'finance lease'],
    ['ETN', 'longTermDebt', 'LongTermDebtAndCapitalLeaseObligations', 18509000000, 'finance lease'],
    ['PWR', 'longTermDebt', 'LongTermDebtAndCapitalLeaseObligations', 5421862000, 'finance lease'],
    ['GEV', 'capex', 'PaymentsToAcquireProductiveAssets', 783000000, 'productive assets', '2026-01-01'],
    ['GEV', 'currentDebt', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 55000000, 'finance lease'],
    ['GEV', 'longTermDebt', 'LongTermDebtAndCapitalLeaseObligations', 2794000000, 'finance lease'],
  ];
  for (const [ticker, field, tag, value, label, start, end = '2026-06-30'] of cases) {
    const facts = { facts: { 'us-gaap': { [tag]: { units: { USD: [entry(value, end, '2026-09-01', { ...(start ? { start } : {}) })] } } } } };
    await withJsonFixture({ company_tickers: { 0: { ticker, cik_str: 1 } }, submissions: { filings: { recent: {} } }, companyfacts: facts }, async ({ sec }) => {
      const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: [ticker] });
      const selected = result.observations.find(row => row.type === field);
      assert.equal(selected.value, value, `${ticker} ${field}`);
      assert.equal(selected.factTag, tag);
      assert.ok(selected.conceptLabel.includes(label));
      assert.equal(selected.classification, 'verified-standard-tag');
      assert.equal(selected.extractionMethod, 'sec-companyfacts');
      assert.ok(selected.auditSourceUrl.startsWith('https://www.sec.gov/Archives/'));
      assert.equal(selected.periodStart, start || null);
    });
  }
});

test('audited unreported debt stays unavailable instead of using investment assets or old zeros', async () => {
  for (const ticker of ['ANET', 'CORZ', 'DLR']) {
    const facts = { facts: { 'us-gaap': {
      LongTermDebtCurrent: { units: { USD: [entry(0, '2014-06-30', '2014-08-01')] } },
      AvailableForSaleSecuritiesDebtSecuritiesCurrent: { units: { USD: [entry(11053100000, '2026-06-30', '2026-08-01')] } },
    } } };
    await withJsonFixture({ company_tickers: { 0: { ticker, cik_str: 1 } }, submissions: { filings: { recent: {} } }, companyfacts: facts }, async ({ sec }) => {
      const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: [ticker] });
      assert.equal(result.observations.some(row => row.type === 'currentDebt'), false);
      assert.equal(result.tickerOutcomes[0].factCoverage.currentDebt.classification, 'not-separately-reported');
      assert.ok(result.tickerOutcomes[0].factCoverage.currentDebt.reason);
    });
  }
});

test('audited DLR development cash spending can refresh a lagging standard tag and retains its distinct definition', async () => {
  const http = require('./http'); const originalText = http.getText;
  const html = '<xbrli:context id="all"><xbrli:entity><xbrli:identifier>1297996</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context><xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit><ix:nonFraction name="us-gaap:PaymentsToDevelopRealEstateAssets" contextRef="all" unitRef="usd" scale="3">1,784,229</ix:nonFraction>';
  http.getText = async () => html;
  try {
    await withJsonFixture({ company_tickers: { 0: { ticker: 'DLR', cik_str: 1297996 } }, submissions: { filings: { recent: { form: ['10-Q'], filingDate: ['2026-08-01'], accessionNumber: ['0001104659-26-089296'], primaryDocument: ['dlr-20260630x10q.htm'] } } }, companyfacts: { facts: { 'us-gaap': { PaymentsToDevelopRealEstateAssets: { units: { USD: [entry(870038000, '2026-03-31', '2026-05-01', { start: '2026-01-01' })] } } } } } }, async ({ sec }) => {
      const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['DLR'] });
      const selected = result.observations.find(row => row.type === 'capex');
      assert.equal(selected.value, 1784229000);
      assert.equal(selected.periodKind, 'year-to-date');
      assert.equal(selected.classification, 'verified-standard-tag');
      assert.equal(selected.extractionMethod, 'sec-inline-xbrl');
      assert.ok(selected.conceptLabel.includes('not total PP&E'));
    });
  } finally { http.getText = originalText; }
});

test('VNET audited noncurrent extension remains native CNY and ignores segment balances', async () => {
  const http = require('./http'); const originalText = http.getText;
  const context = '<xbrli:context id="all"><xbrli:entity><xbrli:identifier>1508475</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context>';
  const html = context + '<xbrli:unit id="cny"><xbrli:measure>iso4217:CNY</xbrli:measure></xbrli:unit><ix:nonFraction name="vnet:LongTermBorrowingsNonCurrent" contextRef="all" unitRef="cny" scale="3">11,579,664</ix:nonFraction>';
  http.getText = async () => html;
  try {
    await withJsonFixture({ company_tickers: { 0: { ticker: 'VNET', cik_str: 1508475 } }, submissions: { filings: { recent: { form: ['20-F'], filingDate: ['2026-04-16'], accessionNumber: ['0001104659-26-044361'], primaryDocument: ['vnet-20251231x20f.htm'] } } }, companyfacts: { facts: {} } }, async ({ sec }) => {
      const result = await sec({ secUserAgent: 'Researcher test@example.org', tickers: ['VNET'] });
      const selected = result.observations.find(row => row.type === 'longTermDebt');
      assert.equal(selected.value, 11579664000);
      assert.equal(selected.unit, 'CNY');
      assert.equal(selected.periodKind, 'instant');
      assert.equal(selected.classification, 'verified-issuer-extension');
      assert.equal(selected.extractionMethod, 'sec-inline-xbrl');
    });
  } finally { http.getText = originalText; }
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
