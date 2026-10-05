import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDataHealth } from './dataHealthModel';
import { loadDashboardSnapshot } from './snapshotMeta';
import { infrastructureEvents } from './eventModel';
import EventSourceCoverage from './Components/EventSourceCoverage';
import './DataHealth.css';

const emptySnapshot = { observations: [], sourceHealth: {}, outcomes: [] };
const dateOnly = value => value ? String(value).slice(0, 10) : '—';
const sourceLabel = (source, language) => {
  const zh = language === 'zh-TW';
  const labels = {
    prices: zh ? '市場價格' : 'Market prices',
    events: zh ? '事件來源' : 'Event sources',
    sec: 'SEC',
    eia: zh ? 'EIA（PJM 用電需求）' : 'EIA (PJM grid demand)',
  };
  return labels[source] || source;
};
const sourceDetail = (item, language) => {
  const zh = language === 'zh-TW';
  if (item.source === 'events' && item.coverage) return zh
    ? `本次通過 ${item.coverage.acceptedCount} 筆、排除 ${item.coverage.excludedCount} 筆；${item.coverage.feedStatus === 'unavailable' ? '新事件探索無法取得。' : item.coverage.feedStatus === 'partial' ? '部分新事件探索來源無法取得。' : '僅涵蓋設定來源。'}`
    : `${item.coverage.acceptedCount} accepted, ${item.coverage.excludedCount} excluded; ${item.coverage.feedStatus === 'unavailable' ? 'discovery unavailable.' : item.coverage.feedStatus === 'partial' ? 'some discovery sources unavailable.' : 'configured sources only.'}`;
  if (item.status === 'ok') return zh ? `已確認 ${item.recordCount} 筆資料。` : `${item.recordCount} records checked.`;
  if (item.status === 'partial') return zh ? '僅涵蓋已列明的部分來源。' : 'Check covers the stated source scope only.';
  if (item.status === 'degraded') return zh ? '最近更新未完成；請留意最近成功日期。' : 'Latest refresh incomplete; check the last successful date.';
  return zh ? '目前沒有可用資料。' : 'No current records available.';
};

function copyFor(language) {
  const zh = language === 'zh-TW';
  const t = (en, tw) => zh ? tw : en;
  return {
    toggle: zh ? 'EN' : '繁中',
    lab: t('DATA STATUS', '資料狀態'),
    back: t('← Back to overview', '← 返回總覽'),
    kicker: t('SOURCES / DATA COVERAGE', '來源 / 資料涵蓋'),
    title: t('Know what is', '清楚掌握'),
    titleEm: t('current and available.', '資料更新與可用狀態。'),
    intro: t(
      'See the status of sources used by this dashboard, including dated market prices, company filings, grid demand and verified events.',
      '查看本儀表板實際使用的來源狀態，包括有日期的市場價格、公司申報資料、電網需求與已驗證事件。'
    ),
    refresh: t('Refresh status', '重新整理狀態'),
    loading: t('Loading snapshot…', '正在載入快照…'),
    loadError: t('Snapshot could not be loaded.', '無法載入快照。'),
    states: {
      ready: t('PRICE DATA AVAILABLE', '價格資料可用'),
      'ready-with-warnings': t('PRICE DATA AVAILABLE · SOURCE GAPS', '價格可用，部分來源未更新'),
      attention: t('PRICE COVERAGE INCOMPLETE', '價格資料涵蓋不足'),
      metadata: t('SNAPSHOT METADATA INCOMPLETE', '快照中繼資料不完整'),
    },
    stateNotes: {
      ready: t('Tracked prices meet the current coverage rule. Check observation dates before use.', '追蹤價格符合目前的涵蓋規則；使用前請確認觀察日期。'),
      'ready-with-warnings': t('Tracked prices are available; another source is incomplete or unavailable.', '追蹤價格可用，但其他來源尚未完整更新或無法取得。'),
      attention: t('One or more tracked prices do not meet the coverage rule.', '一個或多個追蹤標的的價格資料未達涵蓋條件。'),
      metadata: t('Price coverage is available, but required snapshot metadata is missing.', '價格資料可用，但快照缺少必要的中繼資料。'),
    },
    generated: t('Snapshot generated', '快照產生時間'),
    age: t('Snapshot age', '快照距今'),
    priceCoverage: t('Price coverage', '價格涵蓋'),
    reconstructions: t('Retained event records', '保留的事件紀錄'),
    hours: t('hours', '小時'),
    sourceHealth: t('SOURCE STATUS', '來源狀態'),
    source: t('Source', '來源'),
    status: t('Status', '狀態'),
    records: t('Records', '資料筆數'),
    lastSuccess: t('Last successful refresh', '最近成功更新'),
    detail: t('Detail', '說明'),
    statusLabels: {
      ok: t('Updated', '已更新'),
      degraded: t('Update incomplete', '更新未完成'),
      retained: t('Previous data retained', '保留前次資料'),
      unavailable: t('Unavailable', '無資料'),
      cached: t('Previously retrieved', '先前擷取'),
      partial: t('Limited check', '部分來源已檢查'),
    },
    priceHistory: t('MARKET PRICE COVERAGE', '市場價格涵蓋'),
    ticker: t('Ticker', '標的'),
    rows: t('Daily rows', '日資料筆數'),
    range: t('Range', '期間'),
    provider: t('Provider', '供應來源'),
    readiness: t('Readiness', '準備狀態'),
    complete: t('Ready', '就緒'),
    incomplete: t('Needs data', '需要資料'),
    noteTitle: t('How to interpret this status', '如何解讀資料狀態'),
    note: t(
      'Price coverage does not mean every source is current. Event checks may cover only selected sources; see their dates and status above. Historical signals describe observed data and are not investment recommendations.',
      '價格涵蓋不代表所有來源均已更新。事件檢查可能只涵蓋部分來源；請留意上方的日期與狀態。歷史訊號只描述已觀察資料，非投資建議。'
    ),
  };
}

export default function DataHealth({ onBack, language = 'en', onLanguageChange = () => {} }) {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [loadState, setLoadState] = useState('loading');
  const mounted = useRef(true);
  const copy = copyFor(language);

  const load = useCallback(() => {
    setLoadState('loading');
    loadDashboardSnapshot()
      .then(data => { if (mounted.current) { setSnapshot({ ...emptySnapshot, ...data }); setLoadState('ready'); } })
      .catch(() => { if (mounted.current) setLoadState('error'); });
  }, []);

  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; }; }, [load]);
  const health = useMemo(() => buildDataHealth(snapshot, new Date()), [snapshot]);
  const readyPrices = health.priceCoverage.filter(item => item.ready).length;
  const statusCopyKey = health.state === 'attention' && !health.blockers.includes('prices') ? 'metadata' : health.state;

  return <main className="data-health-shell" lang={language} aria-busy={loadState === 'loading'}>
    <header className="data-health-header">
      <button onClick={onBack}><b>GRIDLINE</b><small>{copy.lab}</small></button>
      <div><button onClick={() => onLanguageChange(language === 'zh-TW' ? 'en' : 'zh-TW')}>{copy.toggle}</button><button onClick={onBack}>{copy.back}</button></div>
    </header>

    <section className="data-health-hero">
      <div><p>{copy.kicker}</p><h1>{copy.title} <em>{copy.titleEm}</em></h1><span>{copy.intro}</span></div>
      <button onClick={load} disabled={loadState === 'loading'}>{loadState === 'loading' ? copy.loading : copy.refresh}</button>
    </section>

    {loadState === 'error'
      ? <section className="health-alert error" role="alert">{copy.loadError}</section>
      : loadState === 'loading'
        ? <section className="health-alert loading" role="status" aria-live="polite">{copy.loading}</section>
        : <>
      <section className={`health-status ${health.state}`} role="status">
        <strong>{copy.states[statusCopyKey]}</strong><span>{copy.stateNotes[statusCopyKey]}</span>
      </section>

      <section className="health-metrics">
        <Metric label={copy.generated} value={health.generatedAt ? health.generatedAt.replace('T', ' ').slice(0, 16) + ' UTC' : '—'} />
        <Metric label={copy.age} value={health.ageHours === null ? '—' : `${health.ageHours} ${copy.hours}`} />
        <Metric label={copy.priceCoverage} value={`${readyPrices}/${health.priceCoverage.length}`} />
        <Metric label={copy.reconstructions} value={infrastructureEvents(snapshot).length} />
      </section>

      <section className="health-grid">
        <article className="health-panel source-panel"><h2>{copy.sourceHealth}</h2><div className="health-table source-table"><div className="head"><span>{copy.source}</span><span>{copy.status}</span><span>{copy.records}</span><span>{copy.lastSuccess}</span><span>{copy.detail}</span></div>{health.sources.map(item => <div key={item.source}><b>{sourceLabel(item.source, language)}</b><span className={`status-pill ${item.status}`}>{copy.statusLabels[item.status] || item.status}</span><span>{item.recordCount}</span><span>{dateOnly(item.lastSuccessAt || item.checkedAt)}</span><span>{sourceDetail(item, language)}</span></div>)}</div></article>

        <article className="health-panel"><h2>{copy.priceHistory}</h2><div className="health-table price-table"><div className="head"><span>{copy.ticker}</span><span>{copy.rows}</span><span>{copy.range}</span><span>{copy.provider}</span><span>{copy.readiness}</span></div>{health.priceCoverage.map(item => <div key={item.ticker}><b>{item.ticker}</b><span>{item.count}</span><span>{dateOnly(item.firstAt)} → {dateOnly(item.lastAt)}</span><span>{item.provider || '—'}</span><span className={`coverage-state ${item.ready ? 'ready' : 'missing'}`}>{item.ready ? copy.complete : copy.incomplete}</span></div>)}</div></article>
      </section>

      <section className="health-grid lower">
        {snapshot.sourceHealth?.events?.coverage?.sources && <article className="health-panel"><EventSourceCoverage coverage={snapshot.sourceHealth.events.coverage} language={language} /></article>}
        <article className="health-panel health-boundary"><h2>{copy.noteTitle}</h2><p>{copy.note}</p>{health.blockers.length > 0 && <code>{health.blockers.join(' · ')}</code>}</article>
      </section>
    </>}
  </main>;
}

function Metric({ label, value }) { return <div role="group" aria-label={label}><span>{label}</span><strong>{value}</strong></div>; }
