const companies = require('../src/data/companyExposure.json');
const DEFAULT_TICKERS = companies.map(company => company.ticker);

function normalizeTickers(value) {
  const tickers = [...new Set(String(value).split(',').map(item => item.trim().toUpperCase()).filter(Boolean))];
  if (!tickers.length) throw new Error('TICKERS must include at least one supported symbol.');
  const unknown = tickers.filter(ticker => !DEFAULT_TICKERS.includes(ticker));
  if (unknown.length) throw new Error(`Unsupported TICKERS: ${unknown.join(', ')}`);
  return tickers;
}

module.exports = { companies, DEFAULT_TICKERS, normalizeTickers };
