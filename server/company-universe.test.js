const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { companies, DEFAULT_TICKERS, normalizeTickers } = require('./company-universe');

test('registry includes all requested symbols once and preserves original order', () => {
  assert.equal(companies.length, 20);
  assert.equal(new Set(DEFAULT_TICKERS).size, 20);
  assert.deepEqual(DEFAULT_TICKERS.slice(0, 4), ['NBIS', 'CRWV', 'ORCL', 'AVGO']);
  for (const symbol of 'CRWV APLD IREN CIFR CORZ GDS VNET EQIX DLR IRM VRT ETN ANET AVGO PWR GEV CEG BE'.split(' ')) {
    assert.ok(DEFAULT_TICKERS.includes(symbol));
  }
  for (const company of companies) {
    assert.ok(['compute', 'operators', 'infrastructure', 'energy', 'cloud'].includes(company.category));
    assert.ok(company.description && company.descriptionZh && company.subcategoryZh);
    assert.equal(new URL(company.sourceUrl).protocol, 'https:');
  }
});

test('ticker overrides normalize and deduplicate supported symbols only', () => {
  assert.deepEqual(normalizeTickers(' be,NBIS, be '), ['BE', 'NBIS']);
  assert.throws(() => normalizeTickers('XYZ'), /Unsupported/);
  assert.throws(() => normalizeTickers(' , '), /at least one/);
});

test('fresh and migration SQL allow exactly the shared universe', () => {
  for (const file of ['user-preferences.sql', 'migrations/20261008_expand_watchlist.sql']) {
    const sql = fs.readFileSync(path.join(__dirname, '../supabase', file), 'utf8');
    const symbols = sql.match(/watchlist <@ array\[([^\]]+)\]/)[1].match(/[A-Z]+/g);
    assert.deepEqual(symbols, DEFAULT_TICKERS);
  }
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261008_expand_watchlist.sql'), 'utf8');
  assert.ok(!/delete from|drop table|drop policy|disable row level security/i.test(migration));
});
