import { companies, COMPANY_CATEGORIES, groupedCompanies, trackedCompanies, categoryLabel } from './companyRegistry';

test('categories partition all companies and support Traditional Chinese', () => {
  const groups = groupedCompanies();
  expect(groups).toHaveLength(COMPANY_CATEGORIES.length);
  expect(groups.flatMap(group => group.companies)).toHaveLength(20);
  expect(categoryLabel(companies[0], 'zh-TW')).toBe('AI 算力與基礎設施轉型');
});

test('explicit enabled subset is honored and legacy snapshots use registry', () => {
  expect(trackedCompanies({ trackedTickers: ['BE', 'NBIS'] }).map(company => company.ticker)).toEqual(['NBIS', 'BE']);
  expect(trackedCompanies({})).toHaveLength(20);
});
