const test = require('node:test');
const assert = require('node:assert/strict');
const { inlineRevenueFacts, inlineFinancialFacts } = require('./inline-sec-facts');
const metadata = { cik: 1508475, qualifiedTag: 'vnet:HostingAndRelatedServicesRevenue', form: '20-F', filed: '2026-04-16', accn: '0001104659-26-044361', cutoff: '2026-10-12' };
const context = (id, dimension = '') => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">1508475</xbrli:identifier>${dimension}</xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>`;
const unit = '<xbrli:unit id="cny"><xbrli:measure>iso4217:CNY</xbrli:measure></xbrli:unit>';
const fact = (ref, value = '9,949,261', attrs = '') => `<ix:nonFraction name="vnet:HostingAndRelatedServicesRevenue" contextRef="${ref}" unitRef="cny" scale="3" ${attrs}>${value}</ix:nonFraction>`;

test('audited issuer extension retains consolidated context native currency and scale', () => {
  const rows = inlineRevenueFacts(context('all') + unit + fact('all'), metadata);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].val, 9949261000);
  assert.equal(rows[0].unit, 'CNY');
  assert.equal(rows[0].tag, 'HostingAndRelatedServicesRevenue');
});

test('segment related-party nil and future facts cannot replace consolidated revenue', () => {
  const dimension = '<xbrli:segment><xbrldi:explicitMember dimension="party">RelatedParty</xbrldi:explicitMember></xbrli:segment>';
  const html = context('segment', dimension) + context('all') + unit + fact('segment', '938') + fact('all', 'nil');
  assert.equal(inlineRevenueFacts(html, metadata).length, 0);
  assert.equal(inlineRevenueFacts(context('all') + unit + fact('all'), { ...metadata, cutoff: '2025-01-01' }).length, 0);
});

test('wrong entity and conflicting repeated totals are withheld', () => {
  assert.equal(inlineRevenueFacts(context('all').replace('1508475', '1') + unit + fact('all'), metadata).length, 0);
  assert.equal(inlineRevenueFacts(context('all') + unit + fact('all') + fact('all', '123'), metadata).length, 0);
});

test('instant debt extraction preserves explicit zero and rejects dimension and duration contexts', () => {
  const instant = context('all').replace('<xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate>', '<xbrli:instant>2025-12-31</xbrli:instant>');
  const options = { ...metadata, qualifiedTag: 'issuer:DebtAndFinanceLeasesCurrent', contextKind: 'instant' };
  const debt = fact('all', '0').replace('vnet:HostingAndRelatedServicesRevenue', options.qualifiedTag);
  const rows = inlineFinancialFacts(instant + unit + debt, options);
  assert.equal(rows[0].val, 0);
  assert.equal(rows[0].start, undefined);
  assert.equal(rows[0].extractionMethod, 'sec-inline-xbrl');
  assert.equal(inlineFinancialFacts(context('all') + unit + debt, options).length, 0);
  const dimension = '<xbrli:segment><xbrldi:explicitMember dimension="facility">FacilityA</xbrldi:explicitMember></xbrli:segment>';
  assert.equal(inlineFinancialFacts(instant.replace('</xbrli:entity>', dimension + '</xbrli:entity>') + unit + debt, options).length, 0);
  assert.equal(inlineFinancialFacts(instant + unit + debt + debt.replace('>0<', '>1<'), options).length, 0);
});

test('capex duration retains YTD scale sign and ignores nil values', () => {
  const options = { ...metadata, qualifiedTag: 'issuer:PaymentsForCapitalAssets' };
  const ytd = context('all').replace('2025-12-31', '2025-06-30');
  const capex = fact('all', '12', 'sign="-"').replace('vnet:HostingAndRelatedServicesRevenue', options.qualifiedTag);
  const rows = inlineFinancialFacts(ytd + unit + capex, options);
  assert.equal(rows[0].val, -12000);
  assert.equal(rows[0].start, '2025-01-01');
  assert.equal(rows[0].end, '2025-06-30');
  assert.equal(inlineFinancialFacts(ytd + unit + capex.replace('sign="-"', 'xsi:nil="true"'), options).length, 0);
});
