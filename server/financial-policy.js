// Definitions are descriptive; alternate issuer concepts require an audited policy below.
const DEFINITIONS = {
  revenue: ['Reported revenue', '申報營收'],
  dilutedEps: ['Diluted earnings per share', '稀釋每股盈餘'],
  capex: ['Cash expenditure on property, plant and equipment', '不動產、廠房及設備現金支出'],
  currentDebt: ['Current portion of long-term borrowings', '長期借款流動部分'],
  longTermDebt: ['Noncurrent long-term borrowings', '非流動長期借款'],
};

const standard = (tag, conceptLabel, conceptLabelZh) => ({ tags: [['us-gaap', tag]], conceptLabel, conceptLabelZh });
const leaseCurrent = () => standard('LongTermDebtAndCapitalLeaseObligationsCurrent', 'Current long-term debt and finance lease obligations', '長期債務及融資租賃負債流動部分');
const leaseNoncurrent = () => standard('LongTermDebtAndCapitalLeaseObligations', 'Noncurrent long-term debt and finance lease obligations', '非流動長期債務及融資租賃負債');
const productiveAssets = () => standard('PaymentsToAcquireProductiveAssets', 'Cash expenditure on productive assets', '生產性資產現金支出');
const notSeparated = (reason, reasonZh) => ({ classification: 'not-separately-reported', reason, reasonZh });

// Audited against issuer primary filings on 2026-10-12. Keep alternative
// definitions visible rather than silently presenting them as plain PP&E/debt.
const ISSUER_POLICIES = {
  ORCL: {
    currentDebt: standard('NotesPayableCurrent', 'Current notes payable and other borrowings', '流動應付票據及其他借款'),
    longTermDebt: { ...standard('LongTermNotesAndLoans', 'Noncurrent notes payable and other borrowings', '非流動應付票據及其他借款'), tags: [['us-gaap', 'LongTermNotesAndLoans'], ['us-gaap', 'LongTermNotesPayable']], inlineTag: 'us-gaap:LongTermNotesAndLoans', forms: ['10-Q', '10-K'] },
  },
  APLD: {
    capex: productiveAssets(),
    currentDebt: standard('NotesPayableCurrent', 'Current portion of reported debt', '申報債務流動部分'),
    longTermDebt: standard('LongTermNotesPayable', 'Noncurrent reported debt, net', '申報非流動債務淨額'),
  },
  CORZ: { currentDebt: notSeparated('Current borrowings are not separately reported in the reviewed June 2026 balance sheet. This does not establish zero debt.', '已審閱的2026年6月資產負債表未單獨申報流動借款，不代表債務為零。') },
  VNET: { longTermDebt: {
    inlineTag: 'vnet:LongTermBorrowingsNonCurrent', forms: ['20-F', '20-F/A'],
    conceptLabel: 'Reported noncurrent long-term borrowings', conceptLabelZh: '申報非流動長期借款',
  } },
  EQIX: {
    capex: standard('PaymentsToAcquireOtherPropertyPlantAndEquipment', 'Cash expenditure on other PP&E (excludes real estate acquisitions)', '其他不動產、廠房及設備現金支出（不含房地產收購）'),
    longTermDebt: standard('LongTermDebt', 'Reported long-term debt, including current maturities', '申報長期債務（含流動部分）'),
  },
  DLR: {
    capex: { ...standard('PaymentsToDevelopRealEstateAssets', 'Cash real estate development expenditure (not total PP&E)', '房地產開發現金支出（非全部不動產、廠房及設備支出）'), inlineTag: 'us-gaap:PaymentsToDevelopRealEstateAssets', forms: ['10-Q', '10-K'] },
    currentDebt: notSeparated('The reviewed June 2026 balance sheet reports debt by instrument, without a consolidated current/noncurrent split.', '已審閱的2026年6月資產負債表按債務工具申報，未提供合併流動／非流動分類。'),
    longTermDebt: notSeparated('The reviewed June 2026 balance sheet reports debt by instrument, without a consolidated current/noncurrent split.', '已審閱的2026年6月資產負債表按債務工具申報，未提供合併流動／非流動分類。'),
  },
  ANET: {
    currentDebt: notSeparated('Borrowings are not separately reported in the reviewed June 2026 balance sheet; debt securities are investment assets, not borrowings.', '已審閱的2026年6月資產負債表未單獨申報借款；債務證券是投資資產，並非借款。'),
    longTermDebt: notSeparated('Borrowings are not separately reported in the reviewed June 2026 balance sheet; debt securities are investment assets, not borrowings.', '已審閱的2026年6月資產負債表未單獨申報借款；債務證券是投資資產，並非借款。'),
  },
  ETN: { currentDebt: leaseCurrent(), longTermDebt: leaseNoncurrent() },
  PWR: { longTermDebt: leaseNoncurrent() },
  GEV: { capex: productiveAssets(), currentDebt: leaseCurrent(), longTermDebt: leaseNoncurrent() },
};
const AUDIT_FILINGS = {
  ORCL: 'https://www.sec.gov/Archives/edgar/data/1341439/000119312526389274/orcl-20260831.htm',
  APLD: 'https://www.sec.gov/Archives/edgar/data/1144879/000114487926000059/apld-20260831.htm',
  CORZ: 'https://www.sec.gov/Archives/edgar/data/1839341/000183934126000014/core-20260630.htm',
  VNET: 'https://www.sec.gov/Archives/edgar/data/1508475/000110465926044361/vnet-20251231x20f.htm',
  EQIX: 'https://www.sec.gov/Archives/edgar/data/1101239/000110123926000147/eqix-20260630.htm',
  DLR: 'https://www.sec.gov/Archives/edgar/data/1297996/000110465926089296/dlr-20260630x10q.htm',
  ETN: 'https://www.sec.gov/Archives/edgar/data/1551182/000155118226000030/etn-20260630.htm',
  ANET: 'https://www.sec.gov/Archives/edgar/data/1596532/000159653226000175/anet-20260630.htm',
  PWR: 'https://www.sec.gov/Archives/edgar/data/1050915/000105091526000025/pwr-20260630.htm',
  GEV: 'https://www.sec.gov/Archives/edgar/data/1996810/000199681026000148/gev-20260630.htm',
};

function financialPolicy(ticker, field) {
  const [conceptLabel, conceptLabelZh] = DEFINITIONS[field];
  return { conceptLabel, conceptLabelZh, ...(AUDIT_FILINGS[ticker] ? { auditSourceUrl: AUDIT_FILINGS[ticker] } : {}), ...(ISSUER_POLICIES[ticker]?.[field] || {}) };
}

function financialMetadata(ticker, field, fact) {
  const policy = financialPolicy(ticker, field);
  const method = fact?.extractionMethod || 'sec-companyfacts';
  // IFRS CurrentBorrowings includes short-term borrowings, unlike LongTermDebtCurrent.
  const definition = fact?.tag === 'CurrentBorrowings'
    ? { conceptLabel: 'Current borrowings', conceptLabelZh: '流動借款' } : {};
  return {
    conceptLabel: policy.conceptLabel, conceptLabelZh: policy.conceptLabelZh, ...definition,
    classification: fact ? Number(fact.val) === 0 ? 'reported-zero' : !['us-gaap', 'ifrs-full'].includes(fact.taxonomy) ? 'verified-issuer-extension' : 'verified-standard-tag' : policy.classification || 'unavailable',
    extractionMethod: fact ? method : null,
    ...(policy.auditSourceUrl ? { auditSourceUrl: policy.auditSourceUrl, auditReviewedAt: '2026-10-12' } : {}),
    ...(policy.reason ? { reason: policy.reason, reasonZh: policy.reasonZh } : {}),
  };
}

module.exports = { financialPolicy, financialMetadata };
