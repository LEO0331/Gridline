import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import AccountGate from '../Components/AccountGate';
import SignalExplainer from '../Components/SignalExplainer';
import PriceChart from '../Components/PriceChart';
import SnapshotChanges from '../Components/SnapshotChanges';
import SnapshotLoadState from '../Components/SnapshotLoadState';
import EventSourceCoverage from '../Components/EventSourceCoverage';
import ResearchBrief from '../Components/ResearchBrief';
import { companies, COMPANY_CATEGORIES, categoryLabel as companyCategoryLabel, groupedCompanies, trackedCompanies } from '../companyRegistry';
import { summarizeSnapshot } from '../snapshotMeta';
import { CURRENT_EVENT_DAYS, EVENT_TYPES, infrastructureEvents, eventTitle, REGION_ZH, CATEGORY_ZH } from '../eventModel';
import { formatUsd, marketSignals } from '../marketSignals';
import { SIGNAL_LENSES, signalLens } from '../signalLenses';
import { shouldApplyAccountLanguage } from '../i18n';
import { DEFAULT_SIGNAL_METHOD_ID } from '../signals/registry';

const REGIONS = [
  { name: 'Northern Virginia', grid: 'PJM', x: 63, y: 31 },
  { name: 'Texas', grid: 'ERCOT', x: 34, y: 64 },
  { name: 'Arizona', grid: 'WECC', x: 19, y: 58 },
  { name: 'Ohio', grid: 'PJM', x: 55, y: 43 },
];
const ALL = 'All regions';
const ALL_EVIDENCE = 'All evidence';
const categoryLabel = (type, zh) => zh ? CATEGORY_ZH[type] || type : type;
const regionLabel = (region, zh) => zh ? REGION_ZH[region] || region : region;
const routes = { overview: 'Overview', infrastructure: 'Infrastructure', events: 'Events', methodology: 'Methodology' };
const readRoute = () => {
  const [view, query = ''] = window.location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  return {
    view: routes[view] || 'Overview',
    region: [ALL, ...REGIONS.map(item => item.name)].includes(params.get('region')) ? params.get('region') : ALL,
    filter: EVENT_TYPES.includes(params.get('filter')) ? params.get('filter') : ALL_EVIDENCE,
  };
};
const dateLabel = value => value ? String(value).slice(0, 10) : '—';
const percent = value => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
const trendLabel = (trend, zh) => ({
  above: zh ? '短期價格趨勢向上' : 'Short-term price trend: upward',
  below: zh ? '短期價格趨勢向下' : 'Short-term price trend: downward',
  mixed: zh ? '短期價格趨勢混合' : 'Short-term price trend: mixed',
  unavailable: zh ? '短期趨勢資料不足' : 'Short-term trend unavailable',
})[trend || 'unavailable'];

export default function App({ snapshot = {}, snapshotState = 'ready', onRetrySnapshot = () => {}, language = 'en', onLanguageChange = () => {} }) {
  const [route, setRoute] = useState(readRoute);
  const companyList = useMemo(() => trackedCompanies(snapshot), [snapshot]);
  const [ticker, setTicker] = useState(() => trackedCompanies(snapshot)[0]?.ticker || companies[0]?.ticker || 'NBIS');
  useEffect(() => {
    if (companyList.length && !companyList.some(company => company.ticker === ticker)) setTicker(companyList[0].ticker);
  }, [companyList, ticker]);
  const [companyCategory, setCompanyCategory] = useState('all');
  const [companySearch, setCompanySearch] = useState('');
  const [briefRegion, setBriefRegion] = useState(ALL);
  const [lensId, setLensId] = useState('momentum');
  const [signalMethodId, setSignalMethodId] = useState(DEFAULT_SIGNAL_METHOD_ID);
  const zh = language === 'zh-TW';
  const t = (en, tw) => zh ? tw : en;
  const events = useMemo(() => infrastructureEvents(snapshot), [snapshot]);
  const hasObservations = Boolean(snapshot.observations?.length);
  const currentEvents = events.filter(item => !item.archived);
  const market = useMemo(() => Object.fromEntries(companyList.map(company => [company.ticker, marketSignals(snapshot, company.ticker)])), [snapshot, companyList]);
  const visibleCompanies = companyList.filter(company => (companyCategory === 'all' || company.category === companyCategory)
    && `${company.ticker} ${company.name} ${company.nameZh || ''}`.toLowerCase().includes(companySearch.trim().toLowerCase()));
  const companyGroups = groupedCompanies(companyList);
  const selectedCompany = companyList.find(company => company.ticker === ticker);
  const lens = signalLens(snapshot, ticker, lensId, new Date(), signalMethodId);
  const snapshotMeta = summarizeSnapshot(snapshot, language);
  const snapshotDisplayLabel = snapshotState === 'error'
    ? t('SNAPSHOT UNAVAILABLE', '快照無法取得')
    : snapshotMeta.generatedLabel;
  const eventHealth = snapshot.sourceHealth?.events;
  const easternToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/New_York' });
  const yesterday = new Date(`${easternToday}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const priorEasternDate = yesterday.toISOString().slice(0, 10);
  const eventCheckStale = Boolean(eventHealth?.coverageThrough && eventHealth.coverageThrough < priorEasternDate);

  const navigate = (view, options = {}) => {
    const region = options.region || (view === 'Infrastructure' || view === 'Events' ? route.region : ALL);
    const filter = options.filter || (view === 'Events' ? route.filter : ALL_EVIDENCE);
    const params = new URLSearchParams();
    if (region !== ALL) params.set('region', region);
    if (filter !== ALL_EVIDENCE) params.set('filter', filter);
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}#${view.toLowerCase()}${params.size ? `?${params}` : ''}`);
    setRoute({ view, region, filter });
  };
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);

  const eventStatus = !eventHealth ? t('Event feed not checked', '事件來源尚未檢查')
    : eventCheckStale ? t('Event check is stale', '事件檢查已過期')
      : eventHealth.status === 'partial' ? t('Partial source coverage', '部分來源涵蓋')
        : eventHealth.status === 'ok' ? t('Configured event sources checked', '已檢查設定的事件來源')
          : t('Event source check needed', '事件來源需檢查');
  return <main className="shell" lang={language}>
    <a className="skip-link" href="#dashboard-content">{t('Skip to dashboard content', '跳至儀表板內容')}</a>
    <header>
      <button className="brand" onClick={() => navigate('Overview')} aria-label={t('Return to overview', '返回總覽')}><i>◫</i><span><b>GRIDLINE</b><small>{t('INFRASTRUCTURE INTELLIGENCE', '基礎設施情報')}</small></span></button>
      <nav aria-label={t('Primary navigation', '主要導覽')}>{Object.values(routes).map(view => <button key={view} onClick={() => navigate(view)} className={route.view === view ? 'current' : ''} aria-current={route.view === view ? 'page' : undefined}>{t(view, { Overview: '總覽', Infrastructure: '基礎設施', Events: '事件', Methodology: '方法論' }[view])}</button>)}<button onClick={() => { window.location.hash = 'health'; window.scrollTo(0, 0); }}>{t('Data status', '資料狀態')}</button></nav>
      <div className="head-actions"><button className="language" aria-label={t('Switch language', '切換語言')} onClick={() => onLanguageChange(zh ? 'en' : 'zh-TW')}>{zh ? 'EN' : '繁中'}</button><span className={`live ${route.view === 'Events' ? eventHealth?.status || 'pending' : snapshotMeta.generatedAt ? 'live' : 'pending'}`}>{route.view === 'Events' ? eventStatus : snapshotMeta.generatedAt ? t(`Snapshot ${dateLabel(snapshotMeta.generatedAt)}`, `快照 ${dateLabel(snapshotMeta.generatedAt)}`) : snapshotState === 'error' ? t('Snapshot unavailable', '快照無法取得') : t('Snapshot loading', '快照載入中')}</span><AccountGate language={language} weight={100} onPreferences={prefs => { if (shouldApplyAccountLanguage(prefs.language)) onLanguageChange(prefs.language); }} /></div>
    </header>
    <div id="dashboard-content" tabIndex="-1">
      <SnapshotLoadState
        state={snapshotState}
        hasObservations={hasObservations}
        language={language}
        onRetry={onRetrySnapshot}
      />

    {route.view === 'Overview' && <>
      <section className="hero"><div><p className="eyebrow">{t('DATA-CENTER BUILDOUT RESEARCH', '資料中心建設研究')}</p><h1>{t('Follow the buildout,', '追蹤資料中心建設，')}<br/><em>{t('from grid to market.', '從電網到市場。')}</em></h1><p className="copy">{t('Compare dated grid demand, project decisions, company disclosures and market prices. Inspect each original source and the gaps between them.', '並列具日期的電網需求、專案決策、公司揭露與市場價格，檢視原始來源及證據缺口。')}</p></div><div className="asof"><span>{t('MARKET SNAPSHOT · LOCAL TIME', '市場快照 · 本地時間')}</span><b>{snapshotDisplayLabel}</b><small>{snapshotMeta.totalSources ? t(`${snapshotMeta.healthySources}/${snapshotMeta.totalSources} sources refreshed · ${snapshotMeta.freshness === 'fresh' ? 'current' : snapshotMeta.freshness === 'partial' ? 'Partial source coverage' : 'outdated'}`, `${snapshotMeta.healthySources}/${snapshotMeta.totalSources} 個來源已更新 · ${snapshotMeta.freshness === 'fresh' ? '最新快照' : snapshotMeta.freshness === 'partial' ? '部分來源涵蓋' : '待更新'}`) : t('Provider status unavailable', '來源狀態未提供')}</small></div></section>
      {snapshotState === 'ready' && hasObservations && <>
      <ResearchBrief snapshot={snapshot} ticker={ticker} region={briefRegion} regions={[ALL, ...REGIONS.map(item => item.name)]} language={language} onTickerChange={setTicker} onRegionChange={setBriefRegion} />
      <section className="lens-picker" aria-label={t('Select signal lens', '選擇訊號視角')}>
        {SIGNAL_LENSES.map(option => <button key={option.id} onClick={() => setLensId(option.id)} className={lensId === option.id ? 'active-filter' : ''} aria-pressed={lensId === option.id}>{zh ? option.nameZh : option.name}</button>)}
      </section>
      <section className="regime"><div className="regime-name"><div><p className="eyebrow">{t('SELECTED RESEARCH LENS', '所選研究視角')}</p><h2>{zh ? lens.labelZh || lens.label : lens.label}</h2><p>{zh ? lens.methodZh || lens.method : lens.method}</p>{zh && lens.originalTitle && <small>{t('Original title', '原始標題')}：{lens.originalTitle}</small>}<small>{t('Scope', '範圍')}: {zh ? lens.scopeZh || regionLabel(lens.scope, true) : lens.scope} · {t('Source date', '來源日期')}: {dateLabel(lens.observedAt)}</small></div></div><div className="regime-buttons"><select aria-label={t('Company', '公司')} value={ticker} onChange={event => setTicker(event.target.value)}>{companyGroups.map(({ category, companies: group }) => <optgroup key={category.id} label={zh ? category.labelZh : category.label}>{group.map(company => <option key={company.ticker} value={company.ticker}>{company.ticker} · {company.name}</option>)}</optgroup>)}</select>{lens.sourceUrl ? <a className="primary" href={lens.sourceUrl} target="_blank" rel="noopener noreferrer">{lens.sourceLabel ? `${zh ? lens.sourceLabelZh || lens.sourceLabel : lens.sourceLabel} ↗` : t('View source ↗', '查看來源 ↗')}</a> : <span>{t('Source unavailable', '來源未提供')}</span>}{lens.additionalSourceUrl && <a className="text" href={lens.additionalSourceUrl} target="_blank" rel="noopener noreferrer">{t('Comparison source ↗', '比較期來源 ↗')}</a>}</div></section>
      <section className="section"><div><p className="eyebrow">{t('VERIFIED EVENT RECORDS', '已驗證事件紀錄')}</p><h3>{t('Verified developments by category', '各類別已驗證進展')}</h3></div><button className="text" onClick={() => navigate('Events')}>{t('View events →', '查看事件 →')}</button></section>
      <section className="drivers">{EVENT_TYPES.map(type => <article key={type}><p className="label">{categoryLabel(type, zh)}</p><strong>{currentEvents.filter(item => item.category === type).length}</strong><small>{t('current verified records', '筆近期已驗證紀錄')}</small></article>)}</section>
      <section className="section company-title"><div><p className="eyebrow">{t('TRACKED MARKET PRICES', '追蹤市場價格')}</p><h3>{t('Latest dated closes', '最近有日期的收盤價')}</h3></div></section>
      <section className="company-browser" aria-label={t('Browse companies', '瀏覽公司')}>
        <div className="company-filters" aria-label={t('Company categories', '公司類別')}>
          <button onClick={() => setCompanyCategory('all')} aria-pressed={companyCategory === 'all'} className={companyCategory === 'all' ? 'active-filter' : ''}>{t('All', '全部')} <span>{companyList.length}</span></button>
          {COMPANY_CATEGORIES.map(category => <button key={category.id} onClick={() => setCompanyCategory(category.id)} aria-pressed={companyCategory === category.id} className={companyCategory === category.id ? 'active-filter' : ''}>{zh ? category.labelZh : category.label} <span>{companyList.filter(company => company.category === category.id).length}</span></button>)}
        </div>
        <div className="company-search"><label htmlFor="company-search">{t('Search companies', '搜尋公司')}</label><input id="company-search" type="search" value={companySearch} onChange={event => setCompanySearch(event.target.value)} placeholder={t('Ticker or company name', '公司代號或名稱')} /><span role="status">{t('Showing', '顯示')} {visibleCompanies.length} / {companyList.length} {t('companies', '家公司')}</span></div>
      </section>
      {!visibleCompanies.length && <p className="company-empty">{t('No companies match these filters.', '沒有符合篩選條件的公司。')} <button onClick={() => { setCompanyCategory('all'); setCompanySearch(''); }}>{t('Reset filters', '重設篩選')}</button></p>}
      <section className="companies" aria-label={t('Tracked companies', '追蹤公司')}>{visibleCompanies.map(company => { const data = market[company.ticker]; return <button key={company.ticker} className={`company ${ticker === company.ticker ? 'selected-card' : ''}`} onClick={() => setTicker(company.ticker)} aria-pressed={ticker === company.ticker} aria-label={t(`Select ${company.ticker} ${company.name}`, `選擇 ${company.ticker} ${company.name}`)}><div className="company-top"><div><b>{company.ticker}</b><small>{company.name}</small></div><span className={data?.changePercent < 0 ? 'negative' : 'positive'}>{percent(data?.changePercent)}</span></div><p className="company-role">{companyCategoryLabel(company, language)}</p><p className="company-description">{zh ? company.descriptionZh || company.description : company.description}</p><strong className="price">{formatUsd(data?.close)}</strong><div className="stat"><span>{t('OBSERVED', '觀察日期')}<b>{dateLabel(data?.observedAt)}</b></span><span>{t('TREND', '趨勢')}<b>{trendLabel(data?.trend, zh)}</b></span></div><div className="gap"><span>{t('SOURCE', '來源')}</span><b>{data?.provider || t('Unavailable', '未提供')}</b></div></button>; })}</section>
      {selectedCompany && <p className="copy company-context">{selectedCompany.ticker} · {zh ? selectedCompany.subcategoryZh : selectedCompany.subcategory} · <a className="text" href={selectedCompany.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Business description source ↗', '業務描述來源 ↗')}</a></p>}
      <PriceChart snapshot={snapshot} ticker={ticker} language={language} methodId={signalMethodId} />
      <SnapshotChanges snapshot={snapshot} ticker={ticker} language={language} />
      <section className="bottom"><SignalExplainer snapshot={snapshot} ticker={ticker} language={language} methodId={signalMethodId} onMethodChange={setSignalMethodId} /><article className="ledger"><div className="panel-title"><div><p className="eyebrow">{t('EVENT LEDGER', '事件帳本')}</p><h3>{t('Recent verified records', '近期已驗證紀錄')}</h3></div></div>{currentEvents.length ? currentEvents.slice(0, 4).map(item => <div className="event" key={item.id}><span className="impact neutral">•</span><div><p><b>{categoryLabel(item.category, zh)}</b> · {dateLabel(item.publishedAt)}</p><h4>{eventTitle(item, language)}</h4><small>{regionLabel(item.region, zh)} · {item.source} · {t('Last verified', '最近驗證')} {dateLabel(item.retrievedAt)}</small></div><a className="quality" href={item.url} target="_blank" rel="noopener noreferrer">{t('RECORD ↗', '紀錄 ↗')}</a></div>) : <p className="event-empty">{t('No verified current events in this snapshot.', '此快照沒有近期已驗證事件。')}</p>}</article></section>
      </>}
    </>}

    {route.view === 'Infrastructure' && <InfrastructureView region={route.region} events={events} navigate={navigate} zh={zh} />}
    {route.view === 'Events' && <EventsView events={events} health={eventHealth} region={route.region} filter={route.filter} navigate={navigate} zh={zh} />}
    {route.view === 'Methodology' && <MethodologyView zh={zh} />}
    <footer><span>{t('Dated observations and explicit assumptions · No investment recommendation', '有日期的觀察資料與明示假設 · 非投資建議')}</span><span>{t('Inspect each source and calculation before use.', '使用前請檢視每項來源與計算。')}</span></footer>
    </div>
  </main>;
}

function InfrastructureView({ region, events, navigate, zh }) {
  const t = (en, tw) => zh ? tw : en;
  const selected = REGIONS.find(item => item.name === region);
  const records = events.filter(item => region === ALL || item.region === region);
  return <section className="view-page"><p className="eyebrow">{t('INFRASTRUCTURE / VERIFIED REGIONAL RECORDS', '基礎設施 / 已驗證區域紀錄')}</p><h1>{t('Regional developments', '各區域進展，')}<br/><em>{t('with original records.', '附上原始紀錄。')}</em></h1><p className="copy">{t('Select a region to review its verified developments. Capacity and delivery figures remain unavailable until documented by a dated primary source.', '選擇區域以檢視已驗證進展。容量與交付數值在具日期的第一手資料支持前不顯示。')}</p><div className="infrastructure-grid"><article className="map-panel"><div className="panel-title"><div><p className="eyebrow">{t('REGION NAVIGATION', '區域導覽')}</p><h3>{t('Tracked locations', '追蹤地點')}</h3></div><button className="text reset-regions" aria-pressed={region === ALL} onClick={() => navigate('Infrastructure', { region: ALL })}>{t('All regions', '所有區域')}</button></div><div className="usa-map">{REGIONS.map(item => <button key={item.name} aria-label={`${t('Select', '選擇')} ${regionLabel(item.name, zh)}`} aria-pressed={region === item.name} onClick={() => navigate('Infrastructure', { region: item.name })} className={`map-dot ${region === item.name ? 'active-dot' : ''}`} style={{ left: `${item.x}%`, top: `${item.y}%` }}><i /><span>{regionLabel(item.name, zh)}</span></button>)}</div></article><article className="region-detail"><p className="eyebrow">{t('SELECTED REGION', '所選區域')}</p><h2>{selected ? regionLabel(selected.name, zh) : t('All regions', '所有區域')} <em>/ {selected?.grid || 'US'}</em></h2><p>{t('Verified source records in the selected geography.', '所選地區通過驗證的來源紀錄。')}</p><div className="metric-stack"><div><span>{t('CURRENT RECORDS', '近期紀錄')}</span><b>{records.filter(item => !item.archived).length}</b></div><div><span>{t('ARCHIVED RECORDS', '封存紀錄')}</span><b>{records.filter(item => item.archived).length}</b></div></div><button className="primary" onClick={() => navigate('Events', { region })}>{t('Inspect regional records →', '檢視區域紀錄 →')}</button></article></div></section>;
}

const EVENT_SUMMARY_ZH = {
  'https://www.loudoun.gov/m/newsflash/home/detail/10874': '郡議會同意日後審議一項決議案；若獲通過，部分資料中心與變電站申請的最終決議可能暫緩最多一年。',
  'https://www.loudoun.gov/m/newsflash/Home/Detail/10876': '郡議會表達反對擬議輸電線路，並否決杜勒斯機場附近變電站的土地使用申請。',
  'https://investor.oracle.com/investor-news/news-details/2026/Oracle-Announces-Q1-Results-Driven-by-Triple-Digit-Growth-in-Cloud-Infrastructure-Revenues/default.aspx': 'Oracle 公布季度業績，內容包括資本支出及新增資料中心容量交付。',
};

function EventsView({ events, health, region, filter, navigate, zh }) {
  const [archive, setArchive] = useState(false);
  const t = (en, tw) => zh ? tw : en;
  const list = events.filter(item => (archive ? item.archived : !item.archived) && (region === ALL || item.region === region) && (filter === ALL_EVIDENCE || item.category === filter));
  const status = !health ? t('No source check recorded', '尚無來源檢查紀錄')
    : health.status === 'ok' ? t('Configured sources checked', '已檢查設定來源')
      : health.status === 'partial' ? t('Limited source review', '部分來源已檢查')
        : t('Source refresh needs attention', '來源更新需檢查');
  return <section className="view-page">
    <p className="eyebrow">{t('EVENTS / VERIFIED SOURCE RECORDS', '事件 / 已驗證來源紀錄')}</p>
    <h1>{t('Infrastructure developments', '基礎設施進展')}<br/><em>{t('with original sources.', '附上原始來源。')}</em></h1>
    <p className="copy">{t(`Recent shows records published within ${CURRENT_EVENT_DAYS} days. Older validated records appear in Archive while retained in the snapshot.`, `近期顯示最近 ${CURRENT_EVENT_DAYS} 天發布的紀錄；較舊且仍保留於快照中的已驗證紀錄可在封存查看。`)}</p>
    <p className="copy">{status}{health?.checkedAt ? ` · ${dateLabel(health.checkedAt)}` : ''}{health?.coverageThrough ? t(` · curated sources through ${health.coverageThrough}`, ` · 人工維護來源涵蓋至 ${health.coverageThrough}`) : ''}{health?.recordCount !== undefined ? t(` · ${health.recordCount} verified in this check`, ` · 本次確認 ${health.recordCount} 筆`) : ''}{zh ? '。' : '.'}</p>
    <p className="copy">{t('Older records remain visible with their own last-verification dates.', '較早的紀錄仍可查看；每筆均標示最近一次驗證日期。')}</p>
    {health?.coverage && <section className="event-coverage" aria-label={t('Event source coverage', '事件來源涵蓋範圍')}>
      <b>{t('SOURCE COVERAGE', '來源涵蓋範圍')}</b>
      <p>{health.coverage.sources ? t('Official discovery and curated candidate checks are reported below.', '下方列出官方新事件探索與人工候選紀錄的檢查狀態。') : health.coverage.feedStatus === 'unavailable' ? t('PJM feed unavailable; curated candidates were checked.', 'PJM 動態來源無法取得；已檢查人工候選紀錄。') : t('PJM feed and curated candidates checked.', '已檢查 PJM 動態來源與人工候選紀錄。')} {t(`${health.coverage.candidateCount} candidates · ${health.coverage.acceptedCount} accepted · ${health.coverage.excludedCount} excluded${health.coverage.duplicateCount ? ` · ${health.coverage.duplicateCount} duplicate` : ''}. This is the configured source scope, not all U.S. infrastructure events.`, `候選 ${health.coverage.candidateCount} 筆 · 通過 ${health.coverage.acceptedCount} 筆 · 排除 ${health.coverage.excludedCount} 筆${health.coverage.duplicateCount ? ` · 去重 ${health.coverage.duplicateCount} 筆` : ''}。此為設定來源的涵蓋範圍，並非全美所有基礎設施事件。`)}</p>
      <EventSourceCoverage coverage={health.coverage} language={zh ? 'zh-TW' : 'en'} />
      {health.coverage.excludedCount > 0 && <details><summary>{t(`Review excluded candidates (${health.coverage.excludedCount})`, `查看排除的候選紀錄（${health.coverage.excludedCount}）`)}</summary><ul>{(health.coverage.excluded || []).map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title || t('Untitled candidate', '未命名候選紀錄')}</strong> · {zh ? exclusionReasonZh(item.reason) : item.reason}{item.url && <a href={item.url} target="_blank" rel="noopener noreferrer"> · {t('Unverified link ↗', '未驗證連結 ↗')}</a>}</li>)}</ul>{health.coverage.excludedOmittedCount > 0 && <p>{t(`${health.coverage.excludedOmittedCount} additional excluded candidates are not listed here.`, `另有 ${health.coverage.excludedOmittedCount} 筆排除的候選紀錄未列於此。`)}</p>}</details>}
    </section>}
    {zh && <p className="copy">中文標題供快速閱讀；原始標題及連結保留供核對。</p>}
    <div className="event-toolbar"><div>
      <button onClick={() => setArchive(false)} className={!archive ? 'active-filter' : ''} aria-pressed={!archive}>{t('Recent', '近期')}</button>
      <button onClick={() => setArchive(true)} className={archive ? 'active-filter' : ''} aria-pressed={archive}>{t('Archive', '封存')}</button>
      <button onClick={() => navigate('Events', { region, filter: ALL_EVIDENCE })} className={filter === ALL_EVIDENCE ? 'active-filter' : ''} aria-pressed={filter === ALL_EVIDENCE}>{t('All categories', '所有類別')}</button>
      {EVENT_TYPES.map(type => <button key={type} onClick={() => navigate('Events', { region, filter: type })} className={filter === type ? 'active-filter' : ''} aria-pressed={filter === type}>{categoryLabel(type, zh)}</button>)}
    </div><span>{list.length} {t('records', '筆紀錄')}</span></div>
    {health?.status === 'degraded' && <p className="event-source-warning">{t('The latest refresh was incomplete. Previously verified records remain visible.', '最新來源更新未完成；先前已驗證紀錄仍可查看。')}</p>}
    <div className="event-table">{list.length ? list.map(item => <article key={item.id}>
      <span className="impact neutral">•</span>
      <div><p className="eyebrow">{categoryLabel(item.category, zh)} · {dateLabel(item.publishedAt)} · {regionLabel(item.region, zh)}</p><h3>{eventTitle(item, zh ? 'zh-TW' : 'en')}</h3>{zh && <small className="source-language">原始標題：{item.title}</small>}{(zh ? EVENT_SUMMARY_ZH[item.url] : item.summary) && <p>{zh ? EVENT_SUMMARY_ZH[item.url] : item.summary}</p>}</div>
      <div className="event-meta"><b>{t('ORIGINAL SOURCE', '原始資料來源')}</b><span>{item.source}</span><span>{t('Last verified', '最近驗證')}：{dateLabel(item.retrievedAt)}</span><a className="text" href={item.url} target="_blank" rel="noopener noreferrer">{t('Open record ↗', '開啟原始紀錄 ↗')}</a></div>
    </article>) : <p className="event-empty">{t('No verified records match this view.', '目前沒有符合條件的已驗證紀錄。')}</p>}</div>
  </section>;
}

function exclusionReasonZh(reason = '') {
  if (reason.startsWith('record inaccessible')) return '來源頁面無法存取';
  return ({ 'invalid metadata or non-primary URL': '資料欄位或原始網址不符合規則', 'record title mismatch': '頁面標題不相符', 'supporting text missing': '頁面缺少支持內容', 'publication date missing': '頁面缺少發布日期' })[reason] || '未通過來源驗證';
}

function MethodologyView({ zh }) {
  const t = (en, tw) => zh ? tw : en;
  return <section className="view-page methodology"><p className="eyebrow">{t('METHOD / NICHE RESEARCH LENSES', '方法 / 專題研究視角')}</p><h1>{t('Follow the buildout', '追蹤建設週期，')}<br/><em>{t('without market noise.', '減少市場雜訊。')}</em></h1><div className="method-grid"><article><span>01</span><h3>{t('Market signals', '市場訊號')}</h3><p>{t('Compare sourced closing-price history through trend, momentum and volatility methods. Each method describes a different aspect of past price behavior and remains separate from investment recommendations.', '以趨勢、動能與波動度方法比較具來源的收盤價歷史。各方法描述過去價格行為的不同面向，並與投資建議明確區隔。')}</p></article><article><span>02</span><h3>{t('Company financials', '公司財務')}</h3><p>{t('Use period-aware SEC revenue and diluted EPS facts with filing date and exact source link. A disclosure is shown without a growth verdict until comparable periods exist.', '使用標明報告期間、申報日期及原始連結的 SEC 營收與稀釋每股盈餘（EPS）資料。若無可比較期間，只顯示揭露，不判定成長。')}</p></article><article><span>03</span><h3>{t('Grid demand', '電網需求')}</h3><p>{t('Compares properly typed PJM actual-demand observations across comparable days. Regional demand does not isolate data centers or confirm power secured for a project.', '以明確標示類型的 PJM 實際需求資料比較可比日期。區域用電量無法單獨辨識資料中心需求，也不能證明個別專案已取得供電。')}</p></article><article><span>04</span><h3>{t('Project milestones', '專案里程碑')}</h3><p>{t('Specific permit, grid, or company records require an accessible primary page, publication date, matching title and supporting passage. We do not infer a numeric price impact.', '許可、電網或公司紀錄需有可存取的一級來源頁面、發布日期、相符標題及支持段落；不推測對股價的數值影響。')}</p></article></div><div className="method-note">{t('These lenses are separate evidence views, not a combined buy/sell score. Valuation percentiles, regional MW and fundamental ratings stay unavailable until sourced methods exist.', '這些是獨立的證據視角，不是合成的買賣分數。估值百分位、區域 MW 及基本面評級在有來源方法前均不顯示。')}</div></section>;
}
