import { trackedCompanies } from './companyRegistry';
import { buildCompanyResearch } from './companyResearchModel';
import { marketContext } from './marketContext';
import { documentedRelationships } from './researchBriefModel';
import { RESEARCH_THEMES } from './researchThemes';
import { summarizeSnapshot } from './snapshotMeta';
import { buildThematicFinancials } from './thematicFinancials';
import { easternParts, isNyseTradingDay, latestExpectedPriceSession } from './us-market-calendar';

export function themeCompanies(snapshot, themeId) {
  const theme = RESEARCH_THEMES.find(item => item.id === themeId) || RESEARCH_THEMES[0];
  return { theme, companies: trackedCompanies(snapshot).filter(company => theme.tickers.includes(company.ticker)) };
}

export function selectedThemeTickers(companies, requested) {
  const eligible = companies.map(company => company.ticker);
  if (!Array.isArray(requested)) return eligible.slice(0, 4);
  const selected = eligible.filter(ticker => requested.includes(ticker)).slice(0, 4);
  const minimum = Math.min(2, eligible.length);
  for (const ticker of eligible) {
    if (selected.length >= minimum) break;
    if (!selected.includes(ticker)) selected.push(ticker);
  }
  return eligible.filter(ticker => selected.includes(ticker));
}

function themeMarket(snapshot, companies, selectedTickers, now) {
  const context = marketContext(snapshot, companies.map(company => company.ticker), now);
  const expectedSession = Number.isFinite(now.getTime()) ? latestExpectedPriceSession(now) : null;
  const sourceHealth = snapshot.sourceHealth?.prices || null;
  const sessions = new Map();
  const eligible = row => {
    const date = row?.date;
    if (!date || !expectedSession || date > expectedSession) return false;
    if (!sessions.has(date)) sessions.set(date, isNyseTradingDay(easternParts(new Date(`${date}T17:00:00Z`))));
    return sessions.get(date);
  };
  const differentWindows = Object.fromEntries(context.benchmarks.map(({ ticker }) => [ticker,
    Object.fromEntries([20, 60].map(horizon => {
      const windows = context.companies
        .filter(company => selectedTickers.includes(company.ticker))
        .map(company => company.comparisons[ticker][horizon]).filter(Boolean)
        .map(({ start, end }) => `${start}/${end}`);
      return [horizon, new Set(windows).size > 1];
    })),
  ]));
  return {
    ...context, expectedSession, differentWindows, sourceHealth,
    companies: context.companies.map(company => {
      const latest = eligible(company.latest) ? company.latest : [...company.rows].reverse().find(eligible);
      return {
        ...company, latest,
        closeStatus: !latest ? 'unavailable' : latest.date === expectedSession ? 'current' : 'retained',
        sourceHealth: sourceHealth?.tickers?.[company.ticker] || null,
      };
    }),
  };
}

const date = value => Date.parse(value || '');
const reviewedBy = (value, cutoff) => date(value) <= cutoff;
const officialSecUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && ['www.sec.gov', 'data.sec.gov'].includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
};
const first = value => Array.isArray(value) ? value[0] : value;

function researchQuestion({ ticker, company, research, relationships }, cutoff) {
  const relation = relationships[0];
  if (relation) return {
    priority: 0, ticker,
    en: `What dated official evidence would establish the next milestone for ${relation.facility}?`,
    zh: `哪些具日期的官方證據可確認 ${relation.facilityZh || relation.facility} 的下一個里程碑？`,
    supportEn: relation.relationship, supportZh: relation.relationshipZh, sourceUrl: relation.sourceUrl,
  };
  const field = research.coverage.missingFields.find(item =>
    ['not-separately-reported', 'unavailable'].includes(item.classification)
    && officialSecUrl(item.auditSourceUrl || item.sourceUrl));
  if (field) return {
    priority: 1, ticker,
    en: `Is ${field.label} available as a separate figure in a more recent official filing?`,
    zh: `較近期的官方申報是否單獨揭露「${field.labelZh}」數值？`,
    supportEn: field.reason || 'The reviewed financial coverage records a gap for this field.',
    supportZh: field.reasonZh || '已審閱的財務涵蓋資料顯示此欄位有缺口。',
    sourceUrl: officialSecUrl(field.auditSourceUrl || field.sourceUrl),
  };
  const profile = research.profile;
  if (reviewedBy(profile?.reviewedAt, cutoff) && first(profile.risks) && first(profile.risksZh)) return {
    priority: 2, ticker,
    en: `What dated company evidence addresses this reviewed research risk for ${ticker}?`,
    zh: `哪些具日期的公司證據可釐清 ${ticker} 的這項已審閱研究風險？`,
    supportEn: first(profile.risks), supportZh: first(profile.risksZh),
    sourceUrl: research.events[0]?.originalSourceUrl || research.events[0]?.url || profile.listingUrl || company.sourceUrl,
  };
  const event = research.events[0];
  if (event) return {
    priority: 3, ticker,
    en: `What subsequent official evidence adds context to ${ticker}’s ${event.publishedAt.slice(0, 10)} disclosure?`,
    zh: `哪些後續官方證據可補充 ${ticker} 於 ${event.publishedAt.slice(0, 10)} 發布的揭露？`,
    supportEn: event.title, supportZh: event.titleZh || `${ticker} 官方揭露`,
    sourceUrl: event.originalSourceUrl || event.url,
  };
  return null;
}

export function buildThematicResearch(snapshot = {}, { themeId, tickers, now = new Date(), language = 'en' } = {}) {
  const clock = new Date(now);
  const { theme, companies } = themeCompanies(snapshot, themeId);
  const selectedTickers = selectedThemeTickers(companies, tickers);
  const evidence = companies.filter(company => selectedTickers.includes(company.ticker)).map(company => {
    const { ticker } = company;
    const research = buildCompanyResearch(snapshot, ticker, clock);
    const relationships = documentedRelationships(ticker).filter(item =>
      reviewedBy(item.publishedAt, clock.getTime()) && reviewedBy(item.reviewedAt, clock.getTime()));
    return { ticker, company, research, relationships };
  });
  const cutoff = Math.min(clock.getTime(), date(snapshot.generatedAt));
  const questions = evidence.map(item => researchQuestion(item, cutoff)).filter(Boolean)
    .sort((a, b) => a.priority - b.priority).slice(0, 3)
    .map(({ ticker, en, zh, supportEn, supportZh, sourceUrl }) => ({ ticker, en, zh, supportEn, supportZh, sourceUrl }));
  return {
    theme, companies, selectedTickers, evidence, questions,
    market: themeMarket(snapshot, companies, selectedTickers, clock),
    financials: buildThematicFinancials(evidence, { now: clock }),
    snapshotMeta: summarizeSnapshot(snapshot, language, undefined, clock),
  };
}
