const { getJson, getText } = require('./http');
const { fetchTickerHistory } = require('./price-history');
const { ingestEvents } = require('./event-ingestion');
const { ingestCompanyResearch } = require('./company-research');

const SEC_TICKERS = 'https://www.sec.gov/files/company_tickers.json';
const SEC_SUBMISSIONS = cik => `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`;
const SEC_FACTS = cik => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
const now = () => new Date().toISOString();
const observation = (source, type, value, extra = {}) => ({ id: `${source}:${type}:${extra.ticker || extra.region || 'all'}`, source, type, value, observedAt: extra.observedAt || now(), retrievedAt: now(), ...extra });
const SEC_FORMS = new Set(['10-K', '10-Q', '10-K/A', '10-Q/A', '20-F', '20-F/A', '6-K', '6-K/A']);
const FACT_TAGS = {
  revenue: [['us-gaap', 'RevenueFromContractWithCustomerExcludingAssessedTax'], ['us-gaap', 'Revenues'], ['us-gaap', 'SalesRevenueNet'], ['ifrs-full', 'Revenue']],
  capex: [['us-gaap', 'PaymentsToAcquirePropertyPlantAndEquipment'], ['ifrs-full', 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities']],
  currentDebt: [['us-gaap', 'LongTermDebtCurrent'], ['ifrs-full', 'CurrentBorrowings']],
  longTermDebt: [['us-gaap', 'LongTermDebtNoncurrent'], ['ifrs-full', 'NoncurrentBorrowings']],
  dilutedEps: [['us-gaap', 'EarningsPerShareDiluted'], ['ifrs-full', 'DilutedEarningsLossPerShare']],
};

function factCandidates(facts, tags, requiredUnit, cutoff = now().slice(0, 10)) {
  const candidates = tags.flatMap(([taxonomy, tag]) => Object.entries(facts?.facts?.[taxonomy]?.[tag]?.units || {})
    .flatMap(([unit, entries]) => entries.map(item => ({ ...item, unit, taxonomy, tag }))));
  return candidates.filter(item => (!requiredUnit || item.unit === requiredUnit) && SEC_FORMS.has(item.form) && /^\d{4}-\d{2}-\d{2}$/.test(item.end || '') && /^\d{4}-\d{2}-\d{2}$/.test(item.filed || '') && item.end <= cutoff && item.filed <= cutoff && item.val !== null && item.val !== '' && Number.isFinite(Number(item.val)));
}

function latestFact(facts, tags, requiredUnit, cutoff, preferComparable = false) {
  const candidates = factCandidates(facts, tags, null, cutoff).filter(item => requiredUnit.endsWith('/shares') ? /^[A-Z]{3}\/shares$/.test(item.unit) : /^[A-Z]{3}$/.test(item.unit));
  // A current interim disclosure must not be replaced by an older annual/quarterly period.
  const latestEnd = candidates.reduce((end, item) => item.end > end ? item.end : end, '');
  const latestPeriods = candidates.filter(item => item.end === latestEnd);
  // At that date, prefer actual quarter/annual revenue or EPS over a same-end YTD total.
  const comparablePeriods = preferComparable ? latestPeriods.filter(item => quarterly(item) || annual(item)) : [];
  const valid = comparablePeriods.length ? comparablePeriods : latestPeriods;
  // Compare reporting periods before filing dates; a later filing may repeat an older comparative value.
  // Prefer USD only when both reporting-period dates match, never over a newer native-currency period.
  valid.sort((a, b) => b.end.localeCompare(a.end) || String(b.start || '').localeCompare(String(a.start || ''))
    || Number(b.unit === requiredUnit) - Number(a.unit === requiredUnit) || b.filed.localeCompare(a.filed));
  return valid[0];
}

const daysBetween = (start, end) => (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
const quarterly = fact => /^\d{4}-\d{2}-\d{2}$/.test(fact?.start || '') && daysBetween(fact.start, fact.end) >= 60 && daysBetween(fact.start, fact.end) <= 120;
const annual = fact => /^\d{4}-\d{2}-\d{2}$/.test(fact?.start || '') && daysBetween(fact.start, fact.end) >= 330 && daysBetween(fact.start, fact.end) <= 400;
const periodKind = fact => quarterly(fact) ? 'quarter' : annual(fact) ? 'annual' : fact.start ? 'year-to-date' : 'instant';

function priorYearPeriod(facts, tags, current) {
  const matchesPeriod = quarterly(current) ? quarterly : annual(current) ? annual : null;
  if (!matchesPeriod) return null;
  const duration = daysBetween(current.start, current.end);
  const comparable = factCandidates(facts, tags, current.unit, current.filed).filter(item => item.taxonomy === current.taxonomy && item.tag === current.tag && matchesPeriod(item)
    && Math.abs(daysBetween(item.start, item.end) - duration) <= 14
    && Math.abs(daysBetween(item.end, current.end) - 365) <= 35
    && Math.abs(daysBetween(item.start, current.start) - 365) <= 35
    && item.filed <= current.filed);
  // The first filing of the old period is the point-in-time value; later filings often repeat it as a comparative.
  comparable.sort((a, b) => Math.abs(daysBetween(a.end, current.end) - 365) - Math.abs(daysBetween(b.end, current.end) - 365)
    || a.filed.localeCompare(b.filed));
  return comparable[0] || null;
}

function filingUrl(cik, fact, documents) {
  const document = documents.get(fact.accn);
  if (document && /^\d{10}-\d{2}-\d{6}$/.test(fact.accn) && /^[\w.%-]+$/.test(document)) {
    return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${fact.accn.replaceAll('-', '')}/${document}`;
  }
  return SEC_FACTS(cik);
}

function factObservation(cik, ticker, type, fact, documents) {
  return observation('sec', type, Number(fact.val), {
    ticker, unit: fact.unit, periodStart: fact.start || null, periodEnd: fact.end, periodKind: periodKind(fact),
    filedAt: fact.filed, observedAt: `${fact.filed}T00:00:00.000Z`, form: fact.form, accession: fact.accn,
    fiscalYear: fact.fy, fiscalPeriod: fact.fp, frame: fact.frame, taxonomy: fact.taxonomy, factTag: fact.tag,
    sourceUrl: filingUrl(cik, fact, documents),
  });
}

async function ingestSec(config) {
  if (!config.secUserAgent) throw new Error('SEC_USER_AGENT is required for SEC requests.');
  const headers = { 'User-Agent': config.secUserAgent, 'Accept-Encoding': 'gzip, deflate' };
  const directory = await getJson(SEC_TICKERS, headers); const matches = Object.values(directory).filter(item => config.tickers.includes(item.ticker));
  const payload = []; const observations = []; const tickerOutcomes = [];
  for (const ticker of config.tickers.filter(ticker => !matches.some(company => company.ticker === ticker))) {
    tickerOutcomes.push({ ticker, status: 'degraded', recordCount: 0, message: 'No matching SEC issuer.' });
  }
  for (const company of matches) {
    const firstObservation = observations.length;
    try {
      const [submissions, facts] = await Promise.all([getJson(SEC_SUBMISSIONS(company.cik_str, headers), headers), getJson(SEC_FACTS(company.cik_str), headers)]);
      payload.push({ ticker: company.ticker, submissions, facts });
      const filings = submissions.filings?.recent || {}; const allForms = (filings.form || []).map((form, index) => ({ form, filed: filings.filingDate?.[index], accession: filings.accessionNumber?.[index], primaryDocument: filings.primaryDocument?.[index] }));
      const documents = new Map(allForms.filter(item => item.accession && item.primaryDocument).map(item => [item.accession, item.primaryDocument]));
      const cutoff = String(config.asOf || now()).slice(0, 10);
      const forms = allForms.filter(item => (SEC_FORMS.has(item.form) || item.form === '8-K') && item.filed <= cutoff).slice(0, 12)
        .map(item => ({ ...item, sourceUrl: filingUrl(company.cik_str, { accn: item.accession }, documents) }));
      observations.push(observation('sec', 'filings', forms, { ticker: company.ticker, sourceUrl: SEC_SUBMISSIONS(company.cik_str) }));
      const missingFacts = []; const factCoverage = {};
      for (const [label, tags] of Object.entries(FACT_TAGS)) {
        const unit = label === 'dilutedEps' ? 'USD/shares' : 'USD';
        const fact = latestFact(facts, tags, unit, cutoff, label === 'revenue' || label === 'dilutedEps');
        if (!fact) { missingFacts.push(label); factCoverage[label] = { available: false }; continue; }
        factCoverage[label] = { available: true, unit: fact.unit, periodKind: periodKind(fact), periodEnd: fact.end, comparison: null };
        observations.push(factObservation(company.cik_str, company.ticker, label, fact, documents));
        if (label === 'revenue' || label === 'dilutedEps') {
          const prior = priorYearPeriod(facts, tags, fact);
          if (prior) factCoverage[label].comparison = periodKind(fact);
          if (prior) observations.push(factObservation(company.cik_str, company.ticker, `${label}Prior`, prior, documents));
        }
      }
      tickerOutcomes.push({ ticker: company.ticker, status: 'ok', recordCount: observations.length - firstObservation, missingFacts, factCoverage, message: missingFacts.length ? `Issuer ingested; unavailable reported facts: ${missingFacts.join(', ')}` : 'Issuer facts ingested in reported units.' });
    } catch (error) {
      observations.splice(firstObservation);
      tickerOutcomes.push({ ticker: company.ticker, status: 'degraded', recordCount: 0, message: error.message });
    }
  }
  const succeeded = tickerOutcomes.filter(item => item.status === 'ok').length;
  return { payload, observations, tickerOutcomes, status: succeeded === config.tickers.length ? 'ok' : succeeded ? 'partial' : 'degraded', message: `${succeeded}/${config.tickers.length} tracked issuers ingested; ${tickerOutcomes.filter(item => item.status === 'degraded').length} unavailable` };
}
async function ingestEia(config) {
  if (!config.eiaKey) throw new Error('EIA_API_KEY is not configured.');
  const datasetUrl = 'https://api.eia.gov/v2/electricity/rto/region-data/data/?frequency=hourly&data[0]=value&facets[respondent][]=PJM&facets[type][]=D';
  const url = `${datasetUrl}&length=336&sort[0][column]=period&sort[0][direction]=desc&api_key=${encodeURIComponent(config.eiaKey)}`;
  const payload = await getJson(url); const rows = payload.response?.data || [];
  const actualDemand = rows.filter(row => row.respondent === 'PJM' && row.type === 'D' && /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(row.period || '') && row.value !== null && row.value !== '' && Number.isFinite(Number(row.value)))
    .map(row => ({ ...row, observedAt: new Date(`${row.period}:00:00Z`).toISOString() }));
  if (!actualDemand.length) throw new Error('EIA returned no verified PJM actual-demand records.');
  return { payload, observations: actualDemand.map(row => observation('eia', 'rtoDemandActual', Number(row.value), {
    region: 'PJM', dataType: 'D', unit: row['value-units'], observedAt: row.observedAt, sourcePeriod: row.period,
    sourceUrl: `${datasetUrl}&start=${row.period}&end=${row.period}`,
  })), message: `${actualDemand.length} EIA actual-demand records ingested` };
}
async function ingestPjm(config) {
  if (!config.pjmKey) throw new Error('PJM_API_KEY is not configured.');
  const url = `https://api.pjm.com/api/v1/gen_by_fuel?rowCount=48&startRow=1&subscription-key=${encodeURIComponent(config.pjmKey)}`;
  const payload = await getJson(url); const rows = payload.items || [];
  const validRows = rows.filter(row => Number.isFinite(Number(row.mw ?? row.generation_mw)) && Number(row.mw ?? row.generation_mw) > 0 && row.datetime_beginning_utc);
  return { payload, observations: validRows.map(row => observation('pjm', 'generationByFuel', Number(row.mw ?? row.generation_mw), { region: 'PJM', fuel: row.fuel_type || row.fuel, observedAt: row.datetime_beginning_utc })), message: `${validRows.length} PJM records ingested` };
}
async function ingestFerc(config) {
  if (!config.fercKey) throw new Error('FERC_API_KEY is not configured.');
  const payload = await getJson('https://api.data.ferc.gov/v1/dataset/0/details/', { 'X-Api-Key': config.fercKey });
  return { payload, observations: [], message: 'FERC dataset catalog checked; no selected dataset connector provides a usable observation yet.' };
}
async function ingestIr(config) {
  const feeds = Object.entries(config.companyIrFeeds); if (!feeds.length) throw new Error('COMPANY_IR_FEEDS has no configured official feed URLs.');
  const payload = []; const observations = [];
  for (const [ticker, url] of feeds) { const text = await getText(url, { 'User-Agent': config.secUserAgent || 'Gridline research client' }); payload.push({ ticker, url, text }); observations.push(observation('company-ir', 'officialFeed', { url }, { ticker, sourceUrl: url })); }
  return { payload, observations, message: `${feeds.length} official IR feeds ingested` };
}
async function ingestPrices(config) {
  const payload = [];
  const observations = [];
  const providerCounts = new Map();
  const tickerOutcomes = [];
  const tickers = config.tickers || [];
  if (!tickers.length) throw new Error('No tracked tickers are configured for price ingestion.');

  for (const ticker of tickers) {
    try {
      const history = await fetchTickerHistory({
        ticker,
        priceBaseUrl: config.priceBaseUrl,
        priceFallbackBaseUrl: config.priceFallbackBaseUrl,
        getText,
        getJson,
      });
      const rows = history.rows.slice(-260);
      if (!rows.length) throw new Error('Provider returned no usable daily history.');
      payload.push({ ticker, provider: history.provider, providerUrl: history.providerUrl, rows });
      providerCounts.set(history.provider, (providerCounts.get(history.provider) || 0) + 1);
      rows.forEach(row => observations.push(observation('prices', 'close', row.close, {
        ticker,
        currency: 'USD',
        observedAt: `${row.date}T00:00:00.000Z`,
        providerName: history.provider,
        sourceUrl: history.providerUrl,
      })));
      tickerOutcomes.push({ ticker, status: 'ok', recordCount: rows.length, latestSession: rows.at(-1).date, provider: history.provider });
    } catch (error) { tickerOutcomes.push({ ticker, status: 'degraded', recordCount: 0, message: error.message }); }
  }

  const coveredTickers = new Set(observations.map(item => item.ticker));
  const missing = tickers.filter(ticker => !coveredTickers.has(ticker));
  const providers = [...providerCounts.entries()].map(([provider, count]) => `${provider}:${count}`).join(', ');
  return {
    payload,
    observations,
    tickerOutcomes,
    status: missing.length === 0 ? 'ok' : coveredTickers.size ? 'partial' : 'degraded',
    message: `${observations.length} daily price observations ingested across ${coveredTickers.size}/${tickers.length} tickers (${providers})${missing.length ? `; unavailable: ${missing.join(', ')}` : ''}`,
  };
}
module.exports = { sec: ingestSec, eia: ingestEia, pjm: ingestPjm, ferc: ingestFerc, 'company-ir': ingestIr, prices: ingestPrices, events: ingestEvents, 'company-research': ingestCompanyResearch };
