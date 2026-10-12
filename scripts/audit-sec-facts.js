const { getJson } = require('../server/http');
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
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
