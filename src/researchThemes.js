const RESEARCH_THEMES = [
  { id: 'neocloud', label: 'Neocloud / GPU Cloud', labelZh: '新型雲端／GPU 雲端', tickers: ['NBIS', 'CRWV'] },
  { id: 'compute', label: 'Compute Infrastructure & Transition', labelZh: '運算基礎設施與轉型', tickers: ['APLD', 'IREN', 'CIFR', 'CORZ'] },
  { id: 'hardware', label: 'Networking & AI Hardware', labelZh: '網路與 AI 硬體', tickers: ['AVGO', 'ANET'] },
  { id: 'power', label: 'Power, Cooling & Grid Infrastructure', labelZh: '電力、冷卻與電網基礎設施', tickers: ['VRT', 'ETN', 'PWR', 'GEV', 'CEG', 'BE'] },
];

function filterResearchCompanies(companies, { theme, category, search }) {
  const membership = RESEARCH_THEMES.find(item => item.id === theme);
  const query = search.trim().toLowerCase();
  return companies.filter(company => (!membership || membership.tickers.includes(company.ticker))
    && (category === 'all' || company.category === category)
    && `${company.ticker} ${company.name} ${company.nameZh || ''}`.toLowerCase().includes(query));
}

module.exports = { RESEARCH_THEMES, filterResearchCompanies };
