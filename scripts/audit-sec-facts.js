const { getJson, getText } = require('../server/http');
const config = require('../server/config');

async function main() {
  const ticker = String(process.argv[2] || 'VNET').toUpperCase();
  if (!config.tickers.includes(ticker)) throw new Error('Unsupported audit ticker.');
  if (!config.secUserAgent) throw new Error('SEC_USER_AGENT is required.');
  const headers = { 'User-Agent': config.secUserAgent };
  const directory = await getJson('https://www.sec.gov/files/company_tickers.json', headers);
  const issuer = Object.values(directory).find(item => item.ticker === ticker);
  if (!issuer) throw new Error('SEC issuer not found.');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(issuer.cik_str).padStart(10, '0')}.json`;
  const facts = await getJson(url, headers);
  const cutoff = new Date().toISOString().slice(0, 10);
  const tags = Object.entries(facts.facts || {}).flatMap(([taxonomy, fields]) => Object.entries(fields)
    .filter(([tag]) => /revenue|sales|diluted|longtermdebt|borrowings|acquireproperty|capitalexpend/i.test(tag))
    .map(([tag, field]) => ({ taxonomy, tag, label: field.label, units: Object.entries(field.units || {}).map(([unit, values]) => {
      const latest = values.filter(item => item.end <= cutoff && item.filed <= cutoff).sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
      return latest ? { unit, end: latest.end, filed: latest.filed } : null;
    }).filter(Boolean) })));
  console.log(`SEC_AUDIT ${JSON.stringify({ ticker, url, tags })}`);
  const submissions = await getJson(`https://data.sec.gov/submissions/CIK${String(issuer.cik_str).padStart(10, '0')}.json`, headers);
  const recent = submissions.filings?.recent || {};
  const index = (recent.form || []).findIndex((form, i) => ['20-F', '10-K'].includes(form) && recent.filingDate[i] <= cutoff);
  if (index >= 0 && /^[\w.%-]+$/.test(recent.primaryDocument[index]) && /^\d{10}-\d{2}-\d{6}$/.test(recent.accessionNumber[index])) {
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${Number(issuer.cik_str)}/${recent.accessionNumber[index].replaceAll('-', '')}/${recent.primaryDocument[index]}`;
    const html = await getText(filingUrl, headers);
    const revenueFacts = [...html.matchAll(/<ix:nonfraction\b([^>]+)>([\s\S]*?)<\/ix:nonfraction>/gi)]
      .map(match => ({ name: match[1].match(/\bname=["']([^"']+)["']/i)?.[1], context: match[1].match(/\bcontextref=["']([^"']+)["']/i)?.[1], unit: match[1].match(/\bunitref=["']([^"']+)["']/i)?.[1], scale: match[1].match(/\bscale=["']([^"']+)["']/i)?.[1], value: match[2].replace(/<[^>]*>/g, '').trim() }))
      .filter(item => /revenue|sales/i.test(item.name || '') && !/deferred|unearned|recognized|cost|percent|growth|proforma|contractwithcustomerliability/i.test(item.name));
    console.log(`SEC_FILING_AUDIT ${JSON.stringify({ ticker, filingUrl, form: recent.form[index], filedAt: recent.filingDate[index], revenueFacts: revenueFacts.slice(0, 60) })}`);
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
