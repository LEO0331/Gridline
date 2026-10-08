import relationships from './data/verifiedRelationships.json';
import { infrastructureEvents, eventTitle, REGION_ZH } from './eventModel';
import { formatUsd, marketSignals } from './marketSignals';
import { signalLens } from './signalLenses';
import { companyDevelopments } from './companyResearchModel';
import companyProfiles from './data/companyResearch.json';

const PJM_REGIONS = new Set(['All regions', 'Northern Virginia', 'Ohio', 'PJM region']);
const RELATIONSHIP_HOSTS = Object.fromEntries(companyProfiles.map(profile => [profile.ticker, new Set(profile.officialHosts)]));
const supportedUrl = (value, ticker) => {
  try { const url = new URL(value); return url.protocol === 'https:' && Boolean(RELATIONSHIP_HOSTS[ticker]?.has(url.hostname)); } catch { return false; }
};
const dateOnly = value => value ? String(value).slice(0, 10) : null;

const validRelationship = item => item.facility && item.grid && item.relationship && item.relationshipZh && item.sourceTitle &&
  /^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt) &&
  /^\d{4}-\d{2}-\d{2}$/.test(item.reviewedAt) && supportedUrl(item.sourceUrl, item.ticker);

export function documentedRelationships(ticker, region = 'All regions', records = relationships) {
  return records.filter(item => item.ticker === ticker &&
    (region === 'All regions' || item.region === region) && validRelationship(item));
}

export function buildResearchBrief(snapshot = {}, { ticker, region = 'All regions', now = new Date() } = {}) {
  const execution = signalLens(snapshot, ticker, 'execution', now);
  const grid = PJM_REGIONS.has(region) ? signalLens(snapshot, ticker, 'grid', now) : null;
  const events = infrastructureEvents(snapshot, now).filter(item => region === 'All regions' || item.region === region);
  const latestEvent = events[0] || null;
  const developments = companyDevelopments(snapshot, ticker, now).filter(item => region === 'All regions' || item.region === region);
  const latestCompanyEvent = developments[0] || null;
  const price = marketSignals(snapshot, ticker);
  const relationRecords = documentedRelationships(ticker, region);
  const otherRelationshipTickers = [...new Set(relationships.filter(item => item.ticker !== ticker &&
    (region === 'All regions' || item.region === region) && validRelationship(item)).map(item => item.ticker))];

  return {
    ticker,
    region,
    relationships: relationRecords,
    otherRelationshipTickers,
    lanes: [
      {
        id: 'grid', available: Boolean(grid?.available),
        title: grid?.available ? grid.label : 'No comparable grid-demand series for this selection',
        titleZh: grid?.available ? grid.labelZh : '所選範圍暫無可比較的電網需求資料',
        detail: grid?.available ? 'PJM regional context; no company-specific load attribution.' : 'Only PJM actual load is currently available. Other grids remain unmeasured.',
        detailZh: grid?.available ? 'PJM 區域背景資料；不能歸因於個別公司。' : '目前只有 PJM 實際用電資料；其他電網尚無可用觀察值。',
        observedAt: dateOnly(grid?.observedAt), sourceUrl: grid?.sourceUrl || null, scope: grid?.scope || 'PJM region',
        health: snapshot.sourceHealth?.eia?.status || null,
      },
      {
        id: 'projects', available: Boolean(latestCompanyEvent || latestEvent),
        title: latestCompanyEvent?.title || latestEvent?.title || 'No verified project event for this selection',
        titleZh: latestCompanyEvent ? latestCompanyEvent.titleZh || latestCompanyEvent.title : latestEvent ? eventTitle(latestEvent, 'zh-TW') : '所選範圍暫無已驗證的專案事件',
        detail: latestCompanyEvent ? `${ticker} official disclosure; announced plans and contracted capacity are distinct from delivered capacity.` : latestEvent ? `${events.length} retained record${events.length === 1 ? '' : 's'} in this geography; no company attribution without a documented relationship.` : 'No event in this snapshot; review documented company–facility links below.',
        detailZh: latestCompanyEvent ? `${ticker} 官方揭露；公告規劃與已簽約容量不等同已交付容量。` : latestEvent ? `此地區保留 ${events.length} 筆紀錄；若無文件證明關係，不歸因於個別公司。` : '此快照沒有事件紀錄；下方可查看具來源的公司與設施連結。',
        observedAt: dateOnly(latestCompanyEvent?.publishedAt || latestEvent?.publishedAt), sourceUrl: latestCompanyEvent?.url || latestEvent?.url || null,
        lastVerifiedAt: dateOnly(latestCompanyEvent?.retrievedAt || latestEvent?.retrievedAt), scope: latestCompanyEvent ? ticker : region === 'All regions' ? latestEvent?.region || 'All regions' : region,
        health: latestCompanyEvent ? snapshot.sourceHealth?.['company-research']?.tickers?.[ticker]?.status || null : snapshot.sourceHealth?.events?.status || null,
      },
      {
        id: 'company', available: Boolean(execution.available),
        title: execution.label, titleZh: execution.labelZh,
        detail: 'Period-aware SEC fact; does not isolate data-center revenue.',
        detailZh: '具報告期間的 SEC 資料；無法單獨辨識資料中心營收。',
        observedAt: dateOnly(execution.observedAt), sourceUrl: execution.sourceUrl || null, scope: ticker,
        health: snapshot.sourceHealth?.sec?.tickers?.[ticker]?.status || snapshot.sourceHealth?.sec?.status || null,
      },
      {
        id: 'market', available: Boolean(price),
        title: price ? `${ticker} ${formatUsd(price.close)}` : 'No sourced market close',
        titleZh: price ? `${ticker} ${formatUsd(price.close)}` : '暫無具來源的市場收盤價',
        detail: 'Observed market response; price changes do not identify their cause.',
        detailZh: '已觀察的市場價格；價格變動無法證明成因。',
        observedAt: dateOnly(price?.observedAt), sourceUrl: price?.sourceUrl || null, scope: ticker,
        health: snapshot.sourceHealth?.prices?.status || null,
      },
    ],
  };
}

export function briefRegionLabel(region, language) {
  return language === 'zh-TW' ? REGION_ZH[region] || region : region;
}
