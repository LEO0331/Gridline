const path = require('path');
const fs = require('fs');
const { DEFAULT_TICKERS, normalizeTickers } = require('./company-universe');

for (const filename of ['.env.local', '.env']) {
  const file = path.resolve(__dirname, '..', filename);
  if (!fs.existsSync(file)) continue;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
}

const root = path.resolve(__dirname, '..');
const parseJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

module.exports = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1',
  apiWriteToken: process.env.API_WRITE_TOKEN || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://leo0331.github.io').split(',').map(value => value.trim()).filter(Boolean),
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  tickers: process.env.TICKERS === undefined ? DEFAULT_TICKERS : normalizeTickers(process.env.TICKERS),
  secUserAgent: process.env.SEC_USER_AGENT || '',
  eiaKey: process.env.EIA_API_KEY || '',
  pjmKey: process.env.PJM_API_KEY || '',
  fercKey: process.env.FERC_API_KEY || '',
  companyIrFeeds: parseJson(process.env.COMPANY_IR_FEEDS, {}),
  priceBaseUrl: process.env.PRICE_BASE_URL || 'https://stooq.com/q/d/l/',
  priceFallbackBaseUrl: process.env.PRICE_FALLBACK_BASE_URL || 'https://query1.finance.yahoo.com/v8/finance/chart',
  cacheMinutes: Number(process.env.CACHE_MINUTES || 60),
  scheduleEnabled: process.env.SCHEDULE_ENABLED !== 'false',
  scheduleSources: (process.env.SCHEDULE_SOURCES || 'sec,prices,eia,events').split(',').map(value => value.trim()).filter(Boolean),
};
