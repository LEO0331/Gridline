const { getJson, getText } = require('../server/http');
const config = require('../server/config');

const relevantTag = /revenue|sales|diluted|debt|borrowing|capitallease|financelease|payments.*(?:property|productive|equipment|capital|realestate)|acquireproperty|capitalexpend/i;
const attribute = (text, name) => text.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
const element = (text, name) => text.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([^<]+)<\\/(?:[\\w-]+:)?${name}>`, 'i'))?.[1]?.trim();

function filingFacts(html, cutoff) {
  const contexts = new Map();
  for (const match of html.matchAll(/<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/gi)) {
    const body = match[2];
    contexts.set(attribute(match[1], 'id'), {
      identifier: element(body, 'identifier'), start: element(body, 'startDate'),
      end: element(body, 'endDate'), instant: element(body, 'instant'),
      dimensional: /<(?:xbrldi:)?(?:explicitMember|typedMember)\b/i.test(body),
    });
  }
  const units = new Map();
  for (const match of html.matchAll(/<(?:xbrli:)?unit\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?unit>/gi)) {
    units.set(attribute(match[1], 'id'), element(match[2], 'measure'));
  }
  const unique = new Map();
  for (const match of html.matchAll(/<ix:nonfraction\b([^>]*)>([\s\S]*?)<\/ix:nonfraction>/gi)) {
    const name = attribute(match[1], 'name');
    if (!relevantTag.test(name || '')) continue;
    const contextRef = attribute(match[1], 'contextref'); const context = contexts.get(contextRef);
    const end = context?.instant || context?.end;
    if (!end || end > cutoff) continue;
    const unit = attribute(match[1], 'unitref'); const sign = attribute(match[1], 'sign');
    const scale = Number(attribute(match[1], 'scale') || 0);
    const value = match[2].replace(/<ix:exclude\b[^>]*>[\s\S]*?<\/ix:exclude>/gi, '').replace(/<[^>]*>/g, '').trim();
    const numeric = /^-?\d[\d,]*(?:\.\d+)?$/.test(value) && Number.isInteger(scale) && Math.abs(scale) <= 12;
    const val = numeric ? Number(value.replaceAll(',', '')) * 10 ** scale * (sign === '-' ? -1 : 1) : null;
    const fact = { name, contextRef, ...context, unit, measure: units.get(unit), scale, sign, value,
      val: Number.isFinite(val) ? val : null, nil: /^(true|1)$/i.test(attribute(match[1], '(?:xsi:)?nil') || '') };
    unique.set(JSON.stringify([name, contextRef, unit, value, scale, sign]), fact);
  }
  return [...unique.values()].sort((a, b) => Number(a.dimensional) - Number(b.dimensional) ||
    (b.instant || b.end).localeCompare(a.instant || a.end) || a.name.localeCompare(b.name)).slice(0, 80);
}

async function auditIssuer(ticker, issuer, headers, cutoff) {
  const cik = String(issuer.cik_str).padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const facts = await getJson(url, headers);
  const tags = Object.entries(facts.facts || {}).flatMap(([taxonomy, fields]) => Object.entries(fields)
    .filter(([tag]) => relevantTag.test(tag))
    .map(([tag, field]) => ({ taxonomy, tag, label: field.label, units: Object.entries(field.units || {}).map(([unit, values]) => {
      const eligible = values.filter(item => item.end <= cutoff && item.filed <= cutoff);
      const latest = eligible.sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
      return latest ? { unit, count: eligible.length, start: latest.start, end: latest.end, filed: latest.filed,
        value: latest.val, form: latest.form, accession: latest.accn } : null;
    }).filter(Boolean) })));
  console.log(`SEC_AUDIT ${JSON.stringify({ ticker, url, cutoff, tags })}`);
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const submissions = await getJson(submissionsUrl, headers);
  const recent = submissions.filings?.recent || {};
  const index = (recent.form || []).map((form, i) => ({ form, i, filed: recent.filingDate[i] }))
    .filter(item => ['10-Q', '10-K', '20-F'].includes(item.form) && item.filed <= cutoff)
    .sort((a, b) => b.filed.localeCompare(a.filed))[0]?.i;
  if (index === undefined) {
    console.log(`SEC_FILING_AUDIT ${JSON.stringify({ ticker, submissionsUrl, cutoff, facts: [], error: 'No recent eligible periodic filing.' })}`);
    return;
  }
  if (!/^[\w.%-]+$/.test(recent.primaryDocument[index]) || !/^\d{10}-\d{2}-\d{6}$/.test(recent.accessionNumber[index])) throw new Error('Invalid primary filing path.');
  const filingUrl = `https://www.sec.gov/Archives/edgar/data/${Number(issuer.cik_str)}/${recent.accessionNumber[index].replaceAll('-', '')}/${recent.primaryDocument[index]}`;
  const html = await getText(filingUrl, headers);
  const summaries = filingFacts(html, cutoff);
  console.log(`SEC_FILING_AUDIT ${JSON.stringify({ ticker, filingUrl, form: recent.form[index], filedAt: recent.filingDate[index],
    reportDate: recent.reportDate?.[index], accession: recent.accessionNumber[index], cutoff, facts: summaries,
    revenueFacts: summaries.filter(item => /revenue|sales/i.test(item.name)) })}`);
}

async function main() {
  const input = String(process.argv[2] || 'VNET').toUpperCase();
  const tickers = [...new Set(input === 'ALL' ? config.tickers : input.split(',').map(item => item.trim()))];
  if (!tickers.length || tickers.some(ticker => !config.tickers.includes(ticker))) throw new Error('Unsupported audit ticker.');
  if (!config.secUserAgent) throw new Error('SEC_USER_AGENT is required.');
  const headers = { 'User-Agent': config.secUserAgent };
  const directory = await getJson('https://www.sec.gov/files/company_tickers.json', headers);
  const cutoff = new Date().toISOString().slice(0, 10);
  for (const ticker of tickers) {
    try {
      const issuer = Object.values(directory).find(item => item.ticker === ticker);
      if (!issuer) throw new Error('SEC issuer not found.');
      await auditIssuer(ticker, issuer, headers, cutoff);
    } catch (error) {
      console.log(`SEC_AUDIT_ERROR ${JSON.stringify({ ticker, message: error.message })}`);
      process.exitCode = 1;
    }
  }
}
module.exports = { filingFacts };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
