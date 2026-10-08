import companies from './data/companyExposure.json';

export { companies };
export const COMPANY_CATEGORIES = [
  { id: 'compute', label: 'AI compute & transition', labelZh: 'AI 算力與基礎設施轉型' },
  { id: 'operators', label: 'Data-center operators', labelZh: '資料中心營運商' },
  { id: 'infrastructure', label: 'Infrastructure suppliers', labelZh: '電力、散熱、網路與施工' },
  { id: 'energy', label: 'Generation & energy', labelZh: '發電與能源' },
  { id: 'cloud', label: 'Diversified cloud', labelZh: '多元雲端業務' },
];

export function categoryLabel(company, language = 'en') {
  const category = COMPANY_CATEGORIES.find(item => item.id === company.category);
  return category ? (language === 'zh-TW' ? category.labelZh : category.label) : company.category || '';
}

export function groupedCompanies(list = companies) {
  return COMPANY_CATEGORIES.map(category => ({ category, companies: list.filter(company => company.category === category.id) }))
    .filter(group => group.companies.length);
}

export function trackedCompanies(snapshot = {}) {
  return Array.isArray(snapshot.trackedTickers) && snapshot.trackedTickers.length && snapshot.trackedTickers.every(ticker => companies.some(company => company.ticker === ticker))
    ? companies.filter(company => snapshot.trackedTickers.includes(company.ticker))
    : companies;
}
