import React, { useEffect, useMemo, useRef, useState } from 'react';
import { validateResearchArchive } from '../researchReportArchive';
import { RESEARCH_THEMES } from '../researchThemes';
import { buildWeeklyReview, publicationDateMarker, recordedDuringWeek, reportMatchesTheme, reportPeriods } from '../researchReportsModel';
import './ResearchReports.css';

const formatDate = (value, language) => !value ? '—' : value.length === 10 ? value
  : new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value));
const labels = {
  ok: ['Available', '可用'], fresh: ['Fresh at publication', '發布時為最新資料'],
  partial: ['Partial', '部分涵蓋'], degraded: ['Degraded', '來源受限'],
  stale: ['Stale', '已過期'], missing: ['Missing', '缺少資料'],
  above: ['Upward', '向上'], below: ['Downward', '向下'], mixed: ['Mixed', '混合'],
  'event-added': ['Verified event added to snapshot', '快照新增已驗證事件'],
  'event-updated': ['Verified event updated', '已驗證事件更新'],
  'event-archived': ['Verified event moved to archive', '已驗證事件移至封存'],
  'source-health': ['Source health changed', '來源健康狀態變更'],
  'primary-verified': ['Primary source verified', '原始來源已驗證'],
  'retained-reviewed': ['Retained reviewed source', '保留已審閱來源'],
  'official-fallback-verified': ['Official fallback verified', '官方備援來源已驗證'],
  'verified-standard-tag': ['Verified reported value', '已驗證申報數值'],
  'verified-issuer-extension': ['Verified issuer-specific value', '已驗證公司專屬申報數值'],
  'reported-zero': ['Explicitly reported zero', '明確申報為零'],
  'stale-data': ['Stale reported value', '較舊的申報數值'],
  'not-separately-reported': ['Not separately reported', '未單獨申報'],
  revenue: ['Revenue', '營收'], dilutedEps: ['Diluted EPS', '稀釋每股盈餘'],
  capex: ['Capital expenditure', '資本支出'], currentDebt: ['Current debt', '流動負債'],
  longTermDebt: ['Long-term debt', '長期負債'], annual: ['Annual', '全年'],
  quarter: ['Quarter', '季度'], instant: ['Balance-sheet date', '資產負債表日期'],
  'year-to-date': ['Year to date', '年初至今'],
};
const copy = language => (en, zh) => language === 'zh-TW' ? zh : en;
const statusText = (value, t) => Array.isArray(labels[value]) ? t(...labels[value]) : t('Unavailable', '無法提供');

function DateText({ value, language }) {
  return value ? <time dateTime={value}>{formatDate(value, language)}</time> : <>—</>;
}

function EvidenceLink({ url, children }) {
  try {
    const source = new URL(url);
    if (source.protocol === 'https:' && !source.username && !source.password) {
      return <a href={source.href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;
    }
  } catch {
    // Missing evidence remains unavailable.
  }
  return null;
}

function List({ items, empty, render, limit = 4, t }) {
  if (!items.length) return <p>{empty}</p>;
  const rows = items.map((item, index) => <li key={`${item.id || item.sourceUrl || item.ticker || ''}-${index}`}>{render(item)}</li>);
  return <>
    <ul className="report-list">{rows.slice(0, limit)}</ul>
    {rows.length > limit && <details>
      <summary>{t('More recorded evidence', '更多已記錄證據')} ({rows.length - limit})</summary>
      <ul className="report-list">{rows.slice(limit)}</ul>
    </details>}
  </>;
}

function Evidence({ item, language, review }) {
  const t = copy(language);
  const title = t(item.title, item.titleZh || item.title);
  return <>
    <strong>{item.ticker && `${item.ticker} · `}{title}</strong>
    <p>{t('Published', '發布日期')} <DateText value={publicationDateMarker(item.publishedAt)} language={language} />
      {review && <> · {recordedDuringWeek(item.publishedAt, review) ? t('Published during this period', '於本期間發布') : t('Earlier publication carried into the review', '本週沿用較早的發布紀錄')}</>}
      {item.verificationStatus && <> · {statusText(item.verificationStatus, t)}</>}</p>
    {item.firstRetainedAt && <p>{t('First captured in this retained week', '本週保留紀錄中首次收錄')} <DateText value={item.firstRetainedAt} language={language} /></p>}
    {(item.retrievedAt || item.reviewedAt) && <p>{item.retrievedAt && <>{t('Retrieved', '取得日期')} <DateText value={item.retrievedAt} language={language} /></>}
      {item.retrievedAt && item.reviewedAt && ' · '}{item.reviewedAt && <>{t('Reviewed', '審閱日期')} <DateText value={item.reviewedAt} language={language} /></>}</p>}
    {t(item.summary, item.summaryZh || item.summary) && <p>{t(item.summary, item.summaryZh || item.summary)}</p>}
    <EvidenceLink url={item.sourceUrl}>{t('Recorded source', '已記錄來源')} · {item.source || title}</EvidenceLink>
    {item.originalSourceUrl && item.originalSourceUrl !== item.sourceUrl && <div><EvidenceLink url={item.originalSourceUrl}>{t('Original publisher', '原始發布者')}</EvidenceLink></div>}
  </>;
}

function Fact({ item, language }) {
  const t = copy(language);
  const fact = t(item.conceptLabel, item.conceptLabelZh || item.conceptLabel) || statusText(item.type, t);
  return <>
    <strong>{item.ticker} · {fact} · {item.value.toLocaleString(language, { maximumFractionDigits: 20 })} {item.unit}</strong>
    <p>{t('Reporting period', '報告期間')} · {statusText(item.periodKind, t)} ·
      {' '}{item.periodStart && <><DateText value={item.periodStart} language={language} /> → </>}<DateText value={item.periodEnd} language={language} />
      {' · '}{t('Filed', '申報日期')} <DateText value={item.filedAt} language={language} /></p>
    <p>{[item.taxonomy, item.factTag].filter(Boolean).join(':')}{item.classification && <> · {statusText(item.classification, t)}</>}</p>
    <EvidenceLink url={item.sourceUrl}>{item.ticker} {t('recorded SEC source', '已記錄的 SEC 來源')}</EvidenceLink>
  </>;
}

function Question({ item, language }) {
  const t = copy(language);
  return <>
    <strong>{item.ticker && `${item.ticker} · `}{t(item.en, item.zh)}</strong>
    <p>{t(item.supportEn, item.supportZh)}{item.date && <> · <DateText value={publicationDateMarker(item.date)} language={language} /></>}</p>
    <EvidenceLink url={item.sourceUrl}>{t('Supporting historical evidence', '歷史佐證')}</EvidenceLink>
  </>;
}

function MarketRows({ items, session, language, onCompanyResearch }) {
  const t = copy(language);
  return <List {...{ items, t }} limit={5} empty={t('No recorded market observations match this selection.', '所選條件無相符的市場觀察紀錄。')} render={item => {
    const date = item.observedAt.slice(0, 10);
    return <>
      <strong>{item.ticker} · {item.close.toLocaleString(language, { maximumFractionDigits: 4 })} {item.currency}</strong>
      <p>{t('Observed', '觀察日期')} <DateText value={date} language={language} /> · {item.provider || t('Provider unavailable', '無法提供供應商')}
        {date !== (item.editionSession || session) && <> · {t('Retained close', '保留的收盤價')}</>}</p>
      {item.retrievedAt && <p>{t('Retrieved', '取得日期')} <DateText value={item.retrievedAt} language={language} /></p>}
      {item.trend && <p>{t('Recorded trend', '已記錄趨勢')} · {statusText(item.trend, t)}{item.methodologyVersion && ` · ${item.methodologyVersion}`}</p>}
      <div className="report-links">
        <EvidenceLink url={item.sourceUrl}>{item.ticker} {t('recorded market source', '已記錄的市場來源')}</EvidenceLink>
        {onCompanyResearch && !['SPY', 'QQQ'].includes(item.ticker) && <button type="button" onClick={() => onCompanyResearch(item.ticker)}>
          {t(`Open ${item.ticker} company research`, `開啟 ${item.ticker} 公司研究`)}
        </button>}
      </div>
    </>;
  }} />;
}

function Changes({ items, language }) {
  const t = copy(language);
  return <List {...{ items, t }} empty={t('No material changes recorded for this selection.', '所選條件無重大變化紀錄。')} render={item => {
    const isMarket = item.type === 'price' || item.type === 'signal';
    const marketLabel = item.type === 'signal' ? t('Recorded trend changed', '已記錄趨勢變更')
      : item.before === item.after ? t('Observation date advanced · close unchanged', '觀察日期已更新 · 收盤價維持不變')
        : t('Recorded close value changed', '已記錄收盤價數值變更');
    const format = (value, available) => item.type === 'price' ? value ?? '—' : statusText(available === false ? null : value, t);
    return <>
      <strong>{isMarket ? `${item.ticker} · ${marketLabel}` : statusText(item.type, t)}
        {item.title && ` · ${item.title}`}{item.type === 'source-health' && ` · ${item.source}`}</strong>
      {(isMarket || item.type === 'source-health') && <p>{format(item.before, item.beforeAvailable)} → {format(item.after, item.afterAvailable)}</p>}
      {item.editionSession && <p>{t('Report session', '報告交易日')} <DateText value={item.editionSession} language={language} /></p>}
      {item.observedAt && <p>{t('Observed', '觀察日期')} <DateText value={item.observedAt.slice(0, 10)} language={language} /></p>}
      {item.publishedAt && <p>{t('Published', '發布日期')} <DateText value={publicationDateMarker(item.publishedAt)} language={language} /></p>}
      {item.checkedAt && <p>{t('Source check', '來源檢查')} <DateText value={item.checkedAt} language={language} /></p>}
      <EvidenceLink url={item.sourceUrl}>{t('Recorded change source', '已記錄的變更來源')}{item.ticker && ` · ${item.ticker}`}</EvidenceLink>
    </>;
  }} />;
}

function Health({ sourceHealth, language }) {
  const t = copy(language);
  return <List items={Object.entries(sourceHealth).map(([source, row]) => ({ ...row, id: source }))}
    {...{ t }} limit={5} empty={t('Source coverage unavailable.', '無法提供來源涵蓋資訊。')} render={item => <>
      <strong>{item.id} · {statusText(item.status, t)}</strong>
      <p>{t('Last recorded check', '最近的檢查紀錄')} <DateText value={item.checkedAt} language={language} />
        {' · '}{t('Last successful check', '最近成功的檢查')} <DateText value={item.lastSuccessAt} language={language} />
        {Number.isInteger(item.recordCount) && ` · ${item.recordCount} ${t('records', '筆紀錄')}`}</p>
    </>} />;
}

function EvidenceSections({ data, language, review }) {
  const t = copy(language);
  return <>
    <details className="report-panel">
      <summary>{t('Company developments', '公司進展')} ({data.developments.length})</summary>
      <List items={data.developments} {...{ t }} empty={t('No official company developments retained.', '無保留的官方公司進展。')} render={item => <Evidence {...{ item, language, review }} />} />
    </details>
    <details className="report-panel">
      <summary>{t('Verified infrastructure evidence', '已驗證的基礎設施證據')} ({data.infrastructure.length})</summary>
      <List items={data.infrastructure} {...{ t }} empty={t('No verified infrastructure evidence retained for this selection.', '所選條件無保留的已驗證基礎設施證據。')} render={item => <Evidence {...{ item, language, review }} />} />
    </details>
    <details className="report-panel">
      <summary>{t('Reported financial evidence', '已申報財務證據')} ({data.financials.length})</summary>
      <p>{t('The original reporting periods, definitions and currencies are preserved. Values are individually reported facts.', '保留原始報告期間、定義與幣別。數值各自呈現原始申報。')}</p>
      <List items={data.financials} {...{ t }} empty={t('No reported financial evidence retained.', '無保留的申報財務證據。')} render={item => <Fact {...{ item, language }} />} />
      {data.financialGaps.length > 0 && <details>
        <summary>{t('Recorded financial coverage gaps', '已記錄的財務涵蓋缺口')} ({data.financialGaps.length})</summary>
        <List items={data.financialGaps} {...{ t }} render={item => <>
          <strong>{item.ticker} · {t(item.conceptLabel, item.conceptLabelZh) || statusText(item.type, t)} · {statusText(item.classification, t)}</strong>
          <p>{t(item.reason, item.reasonZh)} · {t('Checked', '檢查日期')} <DateText value={item.checkedAt} language={language} /></p>
          {item.reviewedAt && <p>{t('Reviewed', '審閱日期')} <DateText value={item.reviewedAt} language={language} /></p>}
          <EvidenceLink url={item.sourceUrl}>{item.ticker} {t('recorded SEC source', '已記錄的 SEC 來源')}</EvidenceLink>
        </>} />
      </details>}
    </details>
    {data.questions && <details className="report-panel">
      <summary>{t('Recorded research questions', '已記錄的研究問題')} ({data.questions.length})</summary>
      <p>{t('These questions preserve what remained open at publication. Resolution requires separate verified evidence.', '這些問題保留發布時尚待查證的事項。是否已釐清須有另外驗證的證據。')}</p>
      <List items={data.questions} {...{ t }} empty={t('No supported research questions retained.', '無保留的具證據支持的研究問題。')} render={item => <Question {...{ item, language }} />} />
    </details>}
  </>;
}

function Daily({ edition, editions, themeId, language, onCompanyResearch }) {
  const t = copy(language);
  const choose = item => reportMatchesTheme(item, themeId);
  const latest = editions.find(item => item.session === edition.session);
  const data = Object.fromEntries(['developments', 'infrastructure', 'financials', 'financialGaps', 'questions'].map(key => [key, (edition[key] || []).filter(choose)]));
  const selectedMarket = edition.market.filter(item => ['SPY', 'QQQ'].includes(item.ticker) || choose(item));
  const selectedTickers = edition.trackedTickers.filter(ticker => choose({ ticker }));
  const marketAvailable = selectedMarket.filter(item => selectedTickers.includes(item.ticker) && item.observedAt.slice(0, 10) === edition.session).length;
  return <>
    <section className="report-panel">
      <h2>{t('Daily report', '日報')} · <DateText value={edition.session} language={language} /></h2>
      <p>{t('Edition publication', '版本發布時間')} <DateText value={edition.generatedAt} language={language} /> · {t('New York', '紐約時間')}
        {' · '}{latest.id === edition.id ? t('Latest retained edition for this session', '此交易日最近的保留版本') : t('Earlier retained edition', '較早的保留版本')}</p>
      <p>{t('Freshness at publication', '發布時的資料時效')} · {statusText(edition.freshness, t)}</p>
    </section>
    <details className="report-panel" open>
      <summary>{t('Recorded market overview', '已記錄的市場概況')}</summary>
      <p>{t('Session-matched company closes', '與交易日相符的公司收盤價')} · {marketAvailable}/{selectedTickers.length}. {t('Benchmark availability', '基準可用性')} ·
        {' '}{['SPY', 'QQQ'].map(ticker => `${ticker}: ${selectedMarket.some(item => item.ticker === ticker && item.observedAt.slice(0, 10) === edition.session) ? t('Recorded', '已記錄') : t('Unavailable for session', '該交易日無資料')}`).join(' · ')}</p>
      <MarketRows items={selectedMarket} session={edition.session} {...{ language, onCompanyResearch }} />
    </details>
    <details className="report-panel">
      <summary>{t('Changes between snapshot publications', '快照發布之間的變更')}</summary>
      {edition.changes?.available ? <>
        <p><DateText value={edition.changes.from} language={language} /> → <DateText value={edition.changes.to} language={language} /> · {t('Snapshot comparison period', '快照比較期間')}</p>
        {edition.changes.omitted > 0 && <p>{edition.changes.omitted} {t('changes were excluded by the archive evidence or size limits.', '項變更因封存證據或容量限制未納入。')}</p>}
        {(edition.changes.changes.length > 0 || !edition.changes.omitted) &&
          <Changes items={edition.changes.changes.filter(item => item.type === 'source-health' || choose(item))} language={language} />}
      </> : <p>{t('Previous snapshot comparison unavailable.', '無法提供前次快照比較。')}</p>}
    </details>
    <EvidenceSections {...{ data, language }} />
    <details className="report-panel">
      <summary>{t('Source health at publication', '發布時的來源健康狀態')}</summary>
      <Health {...{ sourceHealth: edition.sourceHealth, language }} />
    </details>
  </>;
}

function Weekly({ review, themeId, language, onCompanyResearch }) {
  const t = copy(language);
  const choose = item => reportMatchesTheme(item, themeId);
  const themes = review.themes.filter(theme => themeId === 'all' || theme.id === themeId);
  return <>
    <section className="report-panel">
      <h2>{t('Weekly thematic review', '每週主題回顧')} · <DateText value={review.start} language={language} /> → <DateText value={review.end} language={language} /></h2>
      <p>{t('New York · Monday through Sunday', '紐約時間 · 星期一至星期日')} ·
        {' '}{review.complete ? t('Complete recorded session coverage', '交易日紀錄涵蓋完整') : t('Partial recorded session coverage', '交易日紀錄僅部分涵蓋')}</p>
      <p>{t('Expected sessions', '預期交易日')} {review.sessions.length} · {t('Available reports', '已有報告')} {review.coveredSessions.length}</p>
      <p>{t('Missing elapsed sessions', '缺少已結束的交易日')} · {review.elapsedMissing.join(', ') || t('None', '無')} · {t('Pending sessions', '尚未結束的交易日')} · {review.pending.join(', ') || t('None', '無')}</p>
      {!review.calendarKnown && <p>{t('Published NYSE holiday coverage is unavailable for part of this period. Session counts are estimates.', '此期間部分日期無已公布的 NYSE 休市資料，交易日數為估算。')}</p>}
      {!review.sufficient && <p>{t('Insufficient recorded history for a weekly review.', '已記錄的歷史資料不足，無法產生完整週報。')} {t('At least two distinct sessions are required.', '至少需要兩個不同交易日的紀錄。')}</p>}
    </section>
    {review.sufficient && <>
      <details className="report-panel">
        <summary>{t('Weekly market and source context', '本週市場與來源概況')}</summary>
        <p>{t('Market observations use the latest retained edition for each session. Recorded changes compare snapshot publications. Earlier editions remain visible in Daily view.', '市場觀察採每個交易日最近的保留版本。已記錄的變更以快照發布為比較基礎，較早版本可在日報中查看。')}</p>
        <MarketRows items={review.daily.flatMap(edition => edition.market.filter(item => ['SPY', 'QQQ'].includes(item.ticker))
          .map(item => ({ ...item, editionSession: edition.session })))} {...{ language }} />
        <Changes items={review.marketChanges.filter(choose)} language={language} />
        <Changes items={review.sourceChanges} language={language} />
        {review.daily.map(edition => <details key={edition.id}>
          <summary>{t('Recorded source coverage', '已記錄的來源涵蓋')} · <DateText value={edition.session} language={language} /></summary>
          <Health {...{ sourceHealth: edition.sourceHealth, language }} />
        </details>)}
      </details>
      {themes.map(theme => <details className="report-panel" key={theme.id}>
        <summary>{t(theme.label, theme.labelZh)}</summary>
        <p>{t('Companies represented in retained editions', '保留版本中的公司')} · {theme.coveredTickers.length}/{theme.tickers.length}</p>
        <details><summary>{t('Recorded company market observations', '已記錄的公司市場觀察')} ({theme.market.length})</summary>
          <MarketRows items={theme.market} {...{ language, onCompanyResearch }} />
        </details>
        <EvidenceSections data={theme} {...{ language, review }} />
      </details>)}
      <details className="report-panel">
        <summary>{t('Verified changes and broader evidence', '已驗證的變更與整體證據')}</summary>
        <Changes items={review.eventChanges.filter(choose)} language={language} />
        {themeId === 'all' && <EvidenceSections data={Object.fromEntries(['developments', 'infrastructure', 'financials', 'financialGaps'].map(key => [key,
          review[key].filter(item => !RESEARCH_THEMES.some(theme => reportMatchesTheme(item, theme.id))),
        ]))} {...{ language, review }} />}
        <h3>{t('Recorded follow-up questions', '已記錄的後續研究問題')}</h3>
        <List items={review.questions.filter(choose)} {...{ t }} empty={t('No supported research questions retained.', '無保留的具證據支持的研究問題。')}
          render={item => <Question {...{ item, language }} />} />
      </details>
    </>}
  </>;
}

export default function ResearchReports({ language = 'en', onCompanyResearch, now }) {
  const t = copy(language);
  const heading = useRef(null);
  const [request, setRequest] = useState(0);
  const [state, setState] = useState({ kind: 'loading' });
  const [view, setView] = useState('daily');
  const [themeId, setThemeId] = useState('all');
  const [editionId, setEditionId] = useState('');
  const [week, setWeek] = useState('');
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    const load = async () => {
      try {
        const response = await fetch(`${process.env.PUBLIC_URL || ''}/data/research-reports.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Archive request failed');
        let archive;
        try {
          archive = validateResearchArchive(await response.json());
        } catch {
          if (active) setState({ kind: 'invalid' });
          return;
        }
        if (active) setState({ kind: 'ready', archive });
      } catch {
        if (active) setState({ kind: 'failed' });
      }
    };
    load();
    return () => { active = false; };
  }, [request]);
  const archive = state.archive;
  const periods = useMemo(() => archive && reportPeriods(archive), [archive]);
  const edition = periods?.editions.find(item => item.id === editionId) || periods?.editions[0];
  const selectedWeek = periods?.weeks.includes(week) ? week : periods?.weeks[0];
  const review = useMemo(() => archive && selectedWeek && view === 'weekly'
    ? buildWeeklyReview(archive, selectedWeek, now) : null, [archive, selectedWeek, view, now]);

  return <section className="research-reports" aria-labelledby="reports-title">
    <div className="report-intro">
      <p className="eyebrow">{t('RETAINED POINT-IN-TIME EVIDENCE', '保留的時間點證據')}</p>
      <h1 id="reports-title" tabIndex={-1} ref={heading}>{t('Research Reports', '研究報告')}</h1>
      <p>{t('Browse what Gridline recorded at the time of each retained publication and review the available evidence by week.', '瀏覽 Gridline 在各保留版本發布時所記錄的證據，並逐週回顧可用資料。')}</p>
    </div>
    {state.kind === 'loading' && <p role="status">{t('Loading the research archive…', '正在載入研究報告封存資料…')}</p>}
    {['failed', 'invalid'].includes(state.kind) && <section className="report-panel" role="alert">
      <p>{state.kind === 'failed' ? t('The research archive could not be loaded.', '無法載入研究報告封存資料。')
        : t('The research archive did not pass validation.', '研究報告封存資料未通過驗證。')}</p>
      <button type="button" onClick={() => setRequest(value => value + 1)}>{t('Retry archive request', '重試載入封存資料')}</button>
    </section>}
    {archive && !edition && <section className="report-panel">
      <h2>{t('No published reports yet', '尚無已發布的研究報告')}</h2>
      <p>{t('The archive starts with the first eligible snapshot publication after reporting is enabled.', '報告功能啟用後，封存將從第一份符合資格的快照發布開始。')}</p>
      <p>{t('Insufficient recorded history for a weekly review.', '已記錄的歷史資料不足，無法產生完整週報。')}</p>
    </section>}
    {edition && <div className="report-workspace">
      <p>{t('Latest retained edition', '最近保留的版本')} <DateText value={periods.editions[0].generatedAt} language={language} />
        {' · '}{t('Earliest retained edition', '最早保留的版本')} <DateText value={periods.editions[periods.editions.length - 1].generatedAt} language={language} />
        {' · '}{archive.editions.length} {t('retained editions', '個保留版本')}
        {archive.trimmedEditions > 0 && <> · {archive.trimmedEditions} {t('older editions removed under retention', '個較早版本已依保留政策移除')}</>}</p>
      <div className="report-controls">
        <div className="report-view-picker" role="group" aria-label={t('Report view', '報告檢視')}>
          <button type="button" aria-pressed={view === 'daily'} onClick={() => setView('daily')}>{t('Daily', '日報')}</button>
          <button type="button" aria-pressed={view === 'weekly'} onClick={() => setView('weekly')}>{t('Weekly', '週報')}</button>
        </div>
        {view === 'daily' ? <label>{t('Report edition', '報告版本')}<select value={edition.id} onChange={event => setEditionId(event.target.value)}>
          {periods.editions.map(item => <option key={item.id} value={item.id}>{item.session} · {formatDate(item.generatedAt, language)} · {item.id.slice(-8)}</option>)}
        </select></label> : <label>{t('Week starting', '週起始日期')}<select value={selectedWeek} onChange={event => setWeek(event.target.value)}>
          {periods.weeks.map(value => <option key={value}>{value}</option>)}
        </select></label>}
        <label>{t('Research theme', '研究主題')}<select value={themeId} onChange={event => setThemeId(event.target.value)}>
          <option value="all">{t('All themes', '所有主題')}</option>
          {RESEARCH_THEMES.map(theme => <option key={theme.id} value={theme.id}>{t(theme.label, theme.labelZh)}</option>)}
        </select></label>
      </div>
      {view === 'daily' ? <Daily key={edition.id} {...{ edition, editions: periods.editions, themeId, language, onCompanyResearch }} />
        : review && <Weekly key={selectedWeek} {...{ review, themeId, language, onCompanyResearch }} />}
    </div>}
    <nav className="report-links" aria-label={t('Current research workspaces', '目前研究工作區')}>
      <a href="#overview">{t('Current Overview', '目前總覽')}</a>
      <a href="#themes">{t('Current Thematic Research', '目前主題研究')}</a>
      <a href="#calendar">{t('Current Research Calendar', '目前研究日曆')}</a>
    </nav>
  </section>;
}
