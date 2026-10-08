import { infrastructureEvents, eventTitle, REGION_ZH } from './eventModel';
import {
  DEFAULT_SIGNAL_METHOD_ID,
  evaluateSnapshotSignalMethod,
  getSignalMethod,
} from './signals/registry';
import { signalStateLabel } from './signals/presentation';
import { companyDevelopments } from './companyResearchModel';

export const SIGNAL_LENSES = [
  { id: 'momentum', name: 'Market signals', nameZh: '市場訊號' },
  { id: 'execution', name: 'Company financials', nameZh: '公司財務' },
  { id: 'grid', name: 'Grid demand', nameZh: '電網需求' },
  { id: 'milestones', name: 'Project milestones', nameZh: '專案里程碑' },
];

const secureUrl = value => {
  try { return new URL(value).protocol === 'https:' ? value : null; } catch { return null; }
};

function recentFact(snapshot, ticker, type) {
  const cutoff = Date.parse(snapshot?.generatedAt || '');
  return (snapshot?.observations || [])
    .filter(row => row.source === 'sec' && row.type === type && row.ticker === ticker &&
      (type.startsWith('dilutedEps') ? /^[A-Z]{3}\/shares$/.test(row.unit) : /^[A-Z]{3}$/.test(row.unit)) &&
      row.value !== null && row.value !== '' && Number.isFinite(Number(row.value)) && Number.isFinite(Date.parse(row.periodEnd)) &&
      Number.isFinite(Date.parse(row.filedAt)) && Date.parse(row.filedAt) <= cutoff && Date.parse(row.periodEnd) <= cutoff &&
      cutoff - Date.parse(row.periodEnd) <= (type.endsWith('Prior') ? 800 : 400) * 86400000 &&
      secureUrl(row.sourceUrl || row.provenance?.originUrl) &&
      !String(row.sourceUrl || row.provenance?.originUrl).includes('/edgar/search/'))
    .sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd)) || String(b.filedAt).localeCompare(String(a.filedAt)))[0] || null;
}

function financialPeriod(fact) {
  if (!fact?.periodStart) return 'instant';
  const duration = (Date.parse(fact.periodEnd) - Date.parse(fact.periodStart)) / 86400000;
  return duration >= 60 && duration <= 120 ? 'quarter' : duration >= 330 && duration <= 400 ? 'annual' : 'year-to-date';
}

function comparable(current, previous) {
  if (!current || !previous || Number(previous.value) <= 0) return false;
  const yearGap = (Date.parse(current.periodEnd) - Date.parse(previous.periodEnd)) / 86400000;
  const currentDuration = (Date.parse(current.periodEnd) - Date.parse(current.periodStart)) / 86400000;
  const previousDuration = (Date.parse(previous.periodEnd) - Date.parse(previous.periodStart)) / 86400000;
  const kind = financialPeriod(current);
  return current.unit === previous.unit && Boolean(current.taxonomy && current.factTag) &&
    current.taxonomy === previous.taxonomy && current.factTag === previous.factTag &&
    previous.filedAt <= current.filedAt && yearGap >= 330 && yearGap <= 400 &&
    (kind === 'quarter' || kind === 'annual') && kind === financialPeriod(previous) && Math.abs(currentDuration - previousDuration) <= 14;
}

function gridDemandSignal(snapshot) {
  const days = new Map();
  const cutoff = Date.parse(snapshot?.generatedAt || '');
  for (const row of snapshot?.observations || []) {
    if (row.source !== 'eia' || row.type !== 'rtoDemandActual' || row.dataType !== 'D' || row.region !== 'PJM' ||
      !Number.isFinite(Date.parse(row.observedAt)) || Date.parse(row.observedAt) > cutoff || !Number.isFinite(Number(row.value)) || Number(row.value) <= 0 ||
      !secureUrl(row.sourceUrl || row.provenance?.originUrl)) continue;
    const day = String(row.observedAt).slice(0, 10);
    const hour = String(row.observedAt).slice(11, 13);
    if (!days.has(day)) days.set(day, new Map());
    days.get(day).set(hour, row);
  }
  const complete = [...days.entries()].filter(([, hours]) => hours.size === 24).sort(([a], [b]) => b.localeCompare(a));
  for (const [day, hours] of complete) {
    const priorDay = new Date(`${day}T00:00:00Z`);
    priorDay.setUTCDate(priorDay.getUTCDate() - 7);
    const prior = days.get(priorDay.toISOString().slice(0, 10));
    if (!prior || prior.size !== 24) continue;
    const sourceUrls = [...hours.values(), ...prior.values()].map(row => row.sourceUrl || row.provenance?.originUrl);
    const units = new Set([...hours.values(), ...prior.values()].map(row => row.unit));
    if (sourceUrls.some(url => !secureUrl(url)) || units.size !== 1) continue;
    const source = new URL(sourceUrls[0]);
    source.searchParams.set('start', `${priorDay.toISOString().slice(0, 10)}T00`);
    source.searchParams.set('end', `${day}T23`);
    source.searchParams.set('length', '336');
    const average = values => [...values.values()].reduce((sum, row) => sum + Number(row.value), 0) / 24;
    const current = average(hours);
    const baseline = average(prior);
    return {
      available: true,
      label: current > baseline ? 'PJM actual demand above prior week' : current < baseline ? 'PJM actual demand below prior week' : 'PJM actual demand unchanged from prior week',
      labelZh: current > baseline ? 'PJM 實際用電需求高於前一週' : current < baseline ? 'PJM 實際用電需求低於前一週' : 'PJM 實際用電需求與前一週持平',
      method: `Compared PJM's reported actual demand on ${day} with the same weekday a week earlier. Regional load does not isolate data centers.`,
      methodZh: `比較 ${day} 與前一週同日的 PJM 實際用電量。區域用電量無法單獨辨識資料中心需求。`,
      observedAt: `${day}T23:00:00Z`,
      sourceUrl: 'https://www.eia.gov/electricity/gridmonitor/dashboard/electric_overview/balancing_authority/PJM',
      sourceLabel: 'EIA PJM dashboard', sourceLabelZh: 'EIA PJM 電網儀表板', datasetUrl: source.toString(), scope: 'PJM region', scopeZh: 'PJM 區域',
    };
  }
  return { available: false, label: 'Grid-demand comparison unavailable', labelZh: '暫無可比較的電網需求資料', method: 'Requires two complete 24-hour PJM actual-demand days, seven days apart, with an explicit EIA data type and one linked source. Regional load cannot establish data-center demand or secured power.', methodZh: '須有相隔七天、各涵蓋完整 24 小時的 PJM 實際需求資料，並標明 EIA 資料類型及來源連結。區域用電量無法證明資料中心需求或已取得電力。', scope: 'PJM region', scopeZh: 'PJM 區域' };
}

export function signalLens(snapshot, ticker, lensId, now = new Date(), signalMethodId = DEFAULT_SIGNAL_METHOD_ID) {
  if (lensId === 'momentum') {
    const method = getSignalMethod(signalMethodId) || getSignalMethod(DEFAULT_SIGNAL_METHOD_ID);
    const signal = evaluateSnapshotSignalMethod(method.id, snapshot, ticker);
    const available = signal.state !== 'unavailable' && Boolean(signal.evidence.sourceUrl);
    const methodEn = method.copy.en;
    const methodZh = method.copy['zh-TW'];
    return {
      available,
      label: signalStateLabel(method.id, signal.state, 'en'),
      labelZh: signalStateLabel(method.id, signal.state, 'zh-TW'),
      method: available
        ? `${methodEn.whatItMeasures} This descriptive signal does not establish future returns.`
        : `Requires at least ${signal.requirements.minimumObservations} dated closes from one continuous provider segment.`,
      methodZh: available
        ? `${methodZh.whatItMeasures} 此描述性訊號不能證明未來報酬。`
        : `至少需要同一連續資料來源區段的 ${signal.requirements.minimumObservations} 筆有日期收盤價。`,
      observedAt: signal.observedAt,
      sourceUrl: signal.evidence.sourceUrl,
      sourceLabel: signal.evidence.provider || null,
      sourceLabelZh: signal.evidence.provider || null,
      scope: ticker,
      scopeZh: ticker,
      signalMethodId: method.id,
      signalMethod: signal,
    };
  }
  if (lensId === 'execution') {
    const eps = recentFact(snapshot, ticker, 'dilutedEps');
    const revenue = recentFact(snapshot, ticker, 'revenue');
    const epsPrior = recentFact(snapshot, ticker, 'dilutedEpsPrior');
    const revenuePrior = recentFact(snapshot, ticker, 'revenuePrior');
    if (!eps && !revenue) return { available: false, label: 'Company execution evidence unavailable', labelZh: '暫無可用的公司財務揭露資料', method: 'Requires a recent period-aware SEC revenue or diluted EPS fact with an exact source link. No growth claim is made without a comparable prior period.', methodZh: '須有近期、標明報告期間且附有原始連結的 SEC 營收或稀釋每股盈餘資料。缺少可比較的去年同期資料時，不判定成長。', scope: ticker, scopeZh: ticker };
    const pair = [[eps, epsPrior, 'Diluted EPS'], [revenue, revenuePrior, 'Revenue']]
      .filter(([current, prior]) => comparable(current, prior))
      .sort(([a], [b]) => Number(financialPeriod(b) === 'quarter') - Number(financialPeriod(a) === 'quarter'))[0];
    if (pair) {
      const [current, prior, name] = pair;
      const direction = Number(current.value) > Number(prior.value) ? 'increased' : Number(current.value) < Number(prior.value) ? 'decreased' : 'was unchanged';
      const nameZh = name === 'Diluted EPS' ? '稀釋每股盈餘' : '營收';
      const directionZh = Number(current.value) > Number(prior.value) ? '增加' : Number(current.value) < Number(prior.value) ? '減少' : '持平';
      const annual = financialPeriod(current) === 'annual';
      return { available: true, label: `${name} ${direction} versus comparable ${annual ? 'prior year' : 'prior-year quarter'}`,
        labelZh: `${nameZh}較${annual ? '前一年度' : '去年同期'}${directionZh}`,
        method: `Matched ${current.periodStart}–${current.periodEnd} with ${prior.periodStart}–${prior.periodEnd}; same reported unit (${current.unit}), comparable ${annual ? 'annual' : 'quarter'} duration and filing-linked records. No currency conversion, earnings-quality or valuation claim is inferred.`,
        methodZh: `比較 ${current.periodStart} 至 ${current.periodEnd} 與 ${prior.periodStart} 至 ${prior.periodEnd} 的申報資料；兩期原始單位相同（${current.unit}）、${annual ? '年度' : '季度'}長度相近，未換算匯率。此比較不代表獲利品質或估值判斷。`,
        observedAt: current.filedAt, sourceUrl: current.sourceUrl || current.provenance?.originUrl,
        additionalSourceUrl: prior.sourceUrl || prior.provenance?.originUrl, scope: ticker, scopeZh: ticker };
    }
    const fact = eps || revenue;
    const kind = financialPeriod(fact);
    const kindZh = { quarter: '季度', annual: '年度', 'year-to-date': '累計期間', instant: '期末' }[kind];
    return { available: true, label: eps ? 'Diluted EPS disclosed' : 'Revenue disclosed', labelZh: eps ? '已揭露稀釋每股盈餘' : '已揭露營收', method: `Reported ${fact.form || 'filing'} ${kind} fact for period ending ${fact.periodEnd}, in ${fact.unit} without currency conversion; this is a disclosure reference, not an earnings-growth verdict.`, methodZh: `${fact.form || '申報文件'} 揭露截至 ${fact.periodEnd} 的${kindZh}資料，原始單位為 ${fact.unit}，未換算匯率；僅供查閱，不代表獲利成長判斷。`, observedAt: fact.filedAt, sourceUrl: fact.sourceUrl || fact.provenance?.originUrl, scope: ticker, scopeZh: ticker };
  }
  if (lensId === 'grid') {
    return gridDemandSignal(snapshot);
  }
  const companyLatest = companyDevelopments(snapshot, ticker, now)[0];
  if (companyLatest) return { available: true, label: companyLatest.title, labelZh: companyLatest.titleZh || companyLatest.title, originalTitle: companyLatest.title,
    method: `Dated official disclosure for ${ticker}. Announced plans are not completed capacity; this record does not quantify a stock-price effect.`,
    methodZh: `${ticker} 具日期的官方揭露。公告規劃不等同已完成容量；此紀錄不量化股價影響。`,
    observedAt: companyLatest.publishedAt, sourceUrl: companyLatest.url, scope: ticker, scopeZh: ticker };
  const latest = infrastructureEvents(snapshot, now).filter(item => !item.archived)[0];
  return latest ? { available: true, label: latest.title, labelZh: eventTitle(latest, 'zh-TW'), originalTitle: latest.title,
      method: `${({ power: 'Power', grid: 'Grid', permit: 'Permit', capex: 'Capital spending' })[String(latest.category).toLowerCase()] || 'Infrastructure'} primary-source record for ${latest.region}; no quantified impact or company attribution is inferred.`,
      methodZh: `${REGION_ZH[latest.region] || latest.region} 的${({ power: '電力', grid: '電網', permit: '許可', capex: '資本支出' })[String(latest.category).toLowerCase()] || '基礎設施'}原始紀錄；不據此推估量化影響或歸因於個別公司。`,
      observedAt: latest.publishedAt, sourceUrl: latest.url, scope: latest.region, scopeZh: REGION_ZH[latest.region] || latest.region }
    : { available: false, label: 'No verified current project milestone', labelZh: '目前沒有已核實的專案里程碑', method: 'Requires an accessible primary-source record with a matching title, publication date and supporting passage.', methodZh: '須有可存取的原始來源，且標題、發布日期及內文段落與事件相符。', scope: 'Sector', scopeZh: '產業' };
}
