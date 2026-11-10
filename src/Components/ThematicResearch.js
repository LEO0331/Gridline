import React, { useMemo } from 'react';
import { RESEARCH_THEMES } from '../researchThemes';
import { buildThematicResearch, selectedThemeTickers, themeCompanies } from '../thematicResearchModel';
import { formatUsd } from '../marketSignals';
import { UpcomingCatalysts } from './ResearchCalendar';
import './ThematicResearch.css';

const defaultSelection = { themeId: 'neocloud' };
const horizons = [20, 60];
const periodNames = {
  quarter: ['Quarter', '季度'],
  annual: ['Annual', '全年'],
  'year-to-date': ['Year to date', '年初至今'],
  instant: ['Balance-sheet date', '資產負債表日期'],
};
const marketGaps = {
  'missing-observations': ['Missing stock or benchmark observations', '缺少公司或基準觀察值'],
  'insufficient-overlap': ['Insufficient overlapping closes', '重疊收盤價不足'],
  'stale-endpoint': ['Latest shared session is stale', '最新共同交易日已過期'],
  'incompatible-provider': ['Provider histories are incompatible', '供應商歷史資料不相容'],
};
const financialGaps = {
  'insufficient-reports': ['Fewer than two reported values', '少於兩筆申報數值'],
  'missing-fields': ['Some companies lack a reported value', '部分公司缺少申報數值'],
  stale: ['A reported value or SEC source check is stale', '申報數值或 SEC 來源檢查已過期'],
  metadata: ['Period or accounting metadata is incomplete', '報告期間或會計中繼資料不完整'],
  period: ['Reporting dates or period types differ', '報告日期或期間類型不同'],
  unit: ['Currencies or units differ', '幣別或單位不同'],
  definition: ['Accounting definitions differ or cannot be matched', '會計定義不同或無法確認一致'],
};
const financialStates = {
  comparable: ['Comparable under the displayed criteria', '符合所列可比條件'],
  'not-comparable': ['Not comparable', '不可直接比較'],
  unavailable: ['Comparison unavailable', '無法提供比較'],
};
const factClasses = {
  'verified-standard-tag': ['Verified reported value', '已驗證申報數值'],
  'verified-issuer-extension': ['Verified issuer-specific value', '已驗證公司專屬申報數值'],
  'reported-zero': ['Explicitly reported zero', '明確申報為零'],
  'stale-data': ['Stale reported value', '較舊申報數值'],
};
const sourceStates = {
  ok: ['Source check passed', '來源檢查通過'],
  partial: ['Partial source coverage', '部分來源涵蓋'],
  degraded: ['Source check limited', '來源檢查有限'],
  stale: ['Retained data · refresh needed', '保留資料 · 需要更新'],
  retained: ['Retained reviewed source', '保留已審閱來源'],
  unavailable: ['Source unavailable', '來源暫無法取得'],
  missing: ['Source coverage unavailable', '無法提供來源涵蓋資訊'],
};
const verificationStates = {
  'official-fallback-verified': ['Official fallback verified', '官方備援來源已驗證'],
  'primary-verified': ['Primary source verified', '原始來源已驗證'],
  'retained-reviewed': ['Retained reviewed source', '保留已審閱來源'],
  unavailable: ['Source unavailable', '來源暫無法取得'],
};
const asItems = value => Array.isArray(value) ? value : value ? [value] : [];
const tFrom = language => (en, zh) => language === 'zh-TW' ? zh : en;
const dateLabel = value => value ? String(value).slice(0, 10) : '—';

function SourceLink({ url, children }) {
  try {
    const source = new URL(url);
    if (source.protocol === 'https:' && !source.username && !source.password) {
      return <a href={source.href} target="_blank" rel="noopener noreferrer">{children}</a>;
    }
  } catch {
    // Missing source links stay unavailable.
  }
  return null;
}

function DateValue({ value }) {
  return value ? <time dateTime={value}>{dateLabel(value)}</time> : <>—</>;
}

function ComparisonResult({ coverage, ticker, benchmark, sessions, t }) {
  if (!coverage?.comparison) return <>
    <strong>{t('Unavailable', '無法提供')}</strong>
    {marketGaps[coverage?.reason] && <small>{t(...marketGaps[coverage.reason])}</small>}
    {coverage && <small>{coverage.overlappingObservations}/{coverage.requiredObservations} {t('shared closes', '共同收盤價')}</small>}
  </>;

  const { comparison } = coverage;
  const value = comparison.percentagePoints;
  return <>
    <strong>{value >= 0 ? '+' : ''}{value.toFixed(2)} {t('pp', '百分點')}</strong>
    <small><DateValue value={comparison.start} /> → <DateValue value={comparison.end} /></small>
    <small>{comparison.provider} · {coverage.overlappingObservations}/{coverage.requiredObservations} {t('shared closes', '共同收盤價')}</small>
    <details>
      <summary>{t(`${ticker} / ${benchmark} ${sessions}D sources`, `${ticker}／${benchmark} ${sessions} 日來源`)}</summary>
      <div className="theme-links">
        <SourceLink url={comparison.stockSourceUrl}>{t(`${ticker} price source ↗`, `${ticker} 價格來源 ↗`)}</SourceLink>
        <SourceLink url={comparison.benchmarkSourceUrl}>{t(`${benchmark} benchmark source ↗`, `${benchmark} 基準來源 ↗`)}</SourceLink>
      </div>
      {comparison.observationIds?.length > 0 && <p className="theme-observation-ids">{t('Observation IDs', '觀察資料 ID')} · {comparison.observationIds.join(', ')}</p>}
    </details>
  </>;
}

function MarketComparison({ market, evidence, language }) {
  const t = tFrom(language);
  const different = market.benchmarks.flatMap(({ ticker }) => horizons.filter(sessions => market.differentWindows?.[ticker]?.[sessions])
    .map(sessions => `${ticker} ${sessions}D`));
  const status = market.sourceHealth?.status;
  return <section className="theme-panel" aria-labelledby="theme-market-title">
    <h2 id="theme-market-title">{t('Market comparison', '市場比較')}</h2>
    <p>{t('Theme MA20 participation', '主題 MA20 參與率')} · {market.coverage
      ? t(`${market.above} of ${market.coverage} covered companies above MA20`, `${market.coverage} 家有資料公司中有 ${market.above} 家高於 MA20`)
      : t('Unavailable', '無法提供')} · {t('Coverage', '涵蓋')} {market.coverage}/{market.total}</p>
    <p>{t('Expected NYSE session', '預期紐約證交所交易日')} <DateValue value={market.expectedSession} /> · {t(...(sourceStates[status] || sourceStates.missing))}</p>
    <p>{t('Participation covers eligible members of this Gridline theme. Relative performance uses shared observed closes from a common provider and reports price-return differences in percentage points.', '參與率涵蓋此 Gridline 主題中具合格資料的公司。相對表現以同一供應商的共同觀察收盤價計算，並以百分點呈現價格報酬差。')}</p>
    {different.length > 0 && <p className="theme-limitation">{t('Comparison periods differ across companies', '各公司比較期間不同')} · {different.join(', ')}. {t('Read each result with its own dates.', '請依各筆結果的日期解讀。')}</p>}
    <div className="theme-card-grid">{evidence.map(({ ticker, company }) => {
      const row = market.companies.find(item => item.ticker === ticker);
      const { latest, above, closeStatus } = row || {};
      return <article key={ticker} className="theme-card">
        <h3>{ticker} · {company.name}</h3>
        {latest ? <>
          <p><strong>{formatUsd(latest.value)}</strong> · {closeStatus === 'current' ? t('Eligible closing price', '合格收盤價') : t('Retained close · current session unavailable', '保留收盤價 · 最新交易日無資料')}</p>
          <p>{t('Observed', '觀察日期')} <DateValue value={latest.date} /> · {latest.provider || t('Provider unavailable', '供應商未提供')}</p>
          <SourceLink url={latest.sourceUrl}>{t(`${ticker} closing price source ↗`, `${ticker} 收盤價來源 ↗`)}</SourceLink>
        </> : <p>{t('Closing price unavailable', '無法提供收盤價')}</p>}
        <p>{above === true ? t('Above MA20', '高於 MA20') : above === false ? t('At or below MA20', '等於或低於 MA20') : t('MA20 state unavailable', '無法提供 MA20 狀態')}
          {row?.sourceHealth?.status && row.sourceHealth.status !== status && <> · {t(...(sourceStates[row.sourceHealth.status] || sourceStates.missing))}</>}</p>
        <table className="theme-market-table" aria-label={t(`${ticker} benchmark comparisons`, `${ticker} 基準比較`)}>
          <thead><tr><th scope="col">{t('Benchmark', '基準')}</th><th scope="col">{t('Result and coverage', '結果與涵蓋範圍')}</th></tr></thead>
          <tbody>{market.benchmarks.flatMap(({ ticker: benchmark }) => horizons.map(sessions => <tr key={`${benchmark}-${sessions}`}>
            <th scope="row">{benchmark} {sessions}D</th>
            <td><ComparisonResult coverage={row?.comparisonCoverage[benchmark]?.[sessions]} {...{ ticker, benchmark, sessions, t }} /></td>
          </tr>))}</tbody>
        </table>
      </article>;
    })}</div>
  </section>;
}

function FinancialFact({ cell, row, language }) {
  const t = tFrom(language);
  const { ticker, fact, missing, status } = cell;
  const field = fact || missing;
  const detail = language === 'zh-TW' ? field?.conceptLabelZh || field?.labelZh : field?.conceptLabel || field?.label;
  const reason = language === 'zh-TW' ? field?.reasonZh : field?.reason;
  const period = periodNames[field?.periodKind];
  const periodType = period ? t(...period) : t('Period type unavailable', '無法提供期間類型');
  const label = language === 'zh-TW' ? row.labelZh : row.label;
  const statusCopy = {
    reported: t('Reported value available', '已有申報數值'),
    stale: t('Retained or stale reported value', '保留或較舊的申報數值'),
    'not-separately-reported': t('Not separately reported', '未單獨申報'),
    unavailable: t('Unavailable', '無法提供'),
  };
  return <li className="theme-card theme-fact">
    <strong>{ticker}</strong>
    {fact && <span className="theme-amount">{fact.value.toLocaleString(language, { maximumFractionDigits: 20 })} <small>{fact.unit}</small></span>}
    <span>{statusCopy[status]}</span>
    {field?.periodEnd && <small>{t('Period', '報告期間')} · {periodType} · {field.periodStart && <><DateValue value={field.periodStart} /> → </>}<DateValue value={field.periodEnd} /></small>}
    {field && <details>
      <summary>{t(`${ticker} ${label} evidence`, `${ticker} ${label}證據`)}</summary>
      {detail && <p>{detail}</p>}
      {reason && <p>{reason}</p>}
      {field.classification && factClasses[field.classification] && <p>{t(...factClasses[field.classification])}</p>}
      {field.filedAt && <p>{t('Filed', '申報日期')} <DateValue value={field.filedAt} />{field.form && ` · ${field.form}`}</p>}
      {field.factTag && <p>{t('Taxonomy concept', '分類概念')} · {[field.taxonomy, field.factTag].filter(Boolean).join(':')}</p>}
      {field.extractionMethod && <p>{t('Extraction', '擷取方式')} · {['companyfacts', 'sec-companyfacts'].includes(field.extractionMethod)
        ? t('SEC structured facts', 'SEC 結構化資料') : ['inline-xbrl', 'sec-inline-xbrl'].includes(field.extractionMethod)
          ? t('Filing XBRL', '申報 XBRL') : t('Verified filing extraction', '已驗證申報擷取')}</p>}
      <SourceLink url={fact?.sourceUrl || missing?.auditSourceUrl || missing?.sourceUrl}>{t(`${ticker} SEC filing ↗`, `${ticker} SEC 申報文件 ↗`)}</SourceLink>
    </details>}
  </li>;
}

function FinancialComparison({ rows, evidence, language }) {
  const t = tFrom(language);
  return <section className="theme-panel" aria-labelledby="theme-financial-title">
    <h2 id="theme-financial-title">{t('Financial comparison', '財務比較')}</h2>
    <p>{t('Amounts retain the reported currency and units. A comparable row requires matching dates, period types and accounting definitions across the selected companies.', '數值保留原始申報幣別及單位。可比欄位要求所選公司具有一致的報告日期、期間類型及會計定義。')}</p>
    <ul className="theme-sec-coverage">{evidence.map(({ ticker, research }) => <li key={ticker}>
      <strong>{ticker}</strong> · {t(...(sourceStates[research.coverage.status] || sourceStates.missing))}
      {research.coverage.lastSuccessAt && <> · {t('Last SEC check', '最近 SEC 檢查')} <DateValue value={research.coverage.lastSuccessAt} /></>}
    </li>)}</ul>
    {rows.map(row => <section key={row.id} className="theme-financial-row" aria-labelledby={`theme-metric-${row.id}`}>
      <h3 id={`theme-metric-${row.id}`}>{language === 'zh-TW' ? row.labelZh : row.label}</h3>
      <p><strong>{t(...financialStates[row.state])}</strong>{row.reasons.length > 0 && <> · {row.reasons.map(reason => financialGaps[reason] && t(...financialGaps[reason])).filter(Boolean).join(' · ')}</>}</p>
      <ul className="theme-card-grid theme-card-list">{row.cells.map(cell => <FinancialFact key={cell.ticker} {...{ cell, row, language }} />)}</ul>
    </section>)}
  </section>;
}

function EvidenceCard({ item, language, onCompanyResearch }) {
  const t = tFrom(language);
  const zh = language === 'zh-TW';
  const { ticker, company, research, relationships } = item;
  const { profile } = research;
  const development = research.events[0];
  const focus = asItems(zh ? profile?.focusZh : profile?.focus);
  const risks = asItems(zh ? profile?.risksZh : profile?.risks);
  return <article className="theme-card">
    <h3>{ticker} · {company.name}</h3>
    <p>{zh ? company.subcategoryZh : company.subcategory} · {zh ? company.descriptionZh : company.description}</p>
    <p>{t('Role reviewed', '業務角色審閱日期')} <DateValue value={company.reviewedAt} /> · <SourceLink url={company.sourceUrl}>{t('Business profile source ↗', '業務簡介來源 ↗')}</SourceLink></p>
    <h4>{t('Latest official development', '最近官方進展')}</h4>
    <p>{t(...(sourceStates[research.researchCoverage.status] || sourceStates.missing))}</p>
    {development ? <>
      <p><SourceLink url={development.url}>{zh ? development.titleZh || '官方進展' : development.title} ↗</SourceLink></p>
      <p>{t('Published', '發布日期')} <DateValue value={development.publishedAt} /> · {t(...(verificationStates[development.verificationStatus] || sourceStates.missing))}
        {development.archived && <> · {t('Older record', '較早紀錄')}</>}</p>
      <details>
        <summary>{t(`${ticker} development evidence`, `${ticker} 進展證據`)}</summary>
        {(zh ? development.summaryZh : development.summary) && <p>{zh ? development.summaryZh : development.summary}</p>}
        {development.reviewedAt && <p>{t('Manually reviewed', '人工審閱')} <DateValue value={development.reviewedAt} /></p>}
        {development.automaticVerifiedAt && <p>{t('Automatically verified', '自動驗證')} <DateValue value={development.automaticVerifiedAt} /></p>}
        {development.automaticVerifiedAt && development.retrievedAt && <p>{t('Retrieved', '取得日期')} <DateValue value={development.retrievedAt} /></p>}
        {development.originalSourceUrl && development.originalSourceUrl !== development.url && <SourceLink url={development.originalSourceUrl}>{t('Original publisher ↗', '原始發布者 ↗')}</SourceLink>}
      </details>
    </> : <p>{t('Official development unavailable', '無法提供官方進展')}</p>}
    <h4>{t('Documented company–facility–grid evidence', '具來源的公司、設施與電網證據')}</h4>
    {relationships.length ? relationships.map(relationship => <details key={relationship.id}>
      <summary>{zh ? relationship.facilityZh : relationship.facility} · {relationship.grid}</summary>
      <p>{zh ? relationship.relationshipZh : relationship.relationship}</p>
      <p>{t('Published', '發布日期')} <DateValue value={relationship.publishedAt} /> · {t('Reviewed', '審閱日期')} <DateValue value={relationship.reviewedAt} /></p>
      <SourceLink url={relationship.sourceUrl}>{t('Official relationship record ↗', '官方關係紀錄 ↗')}</SourceLink>
    </details>) : <p>{t('No documented company–facility–grid link is available.', '尚無具來源的公司、設施與電網連結。')}</p>}
    {(focus.length > 0 || risks.length > 0) && <details>
      <summary>{t(`${ticker} reviewed focus and risks`, `${ticker} 已審閱焦點與風險`)}</summary>
      {focus.length > 0 && <><h4>{t('Research focus', '研究焦點')}</h4><ul>{focus.map(text => <li key={text}>{text}</li>)}</ul></>}
      {risks.length > 0 && <><h4>{t('What to verify next', '下一步應查證什麼')}</h4><ul>{risks.map(text => <li key={text}>{text}</li>)}</ul></>}
      <SourceLink url={profile.sourceUrl || profile.sources?.[0]?.url || company.sourceUrl}>{t('Reviewed profile source ↗', '已審閱簡介來源 ↗')}</SourceLink>
    </details>}
    {onCompanyResearch && <button type="button" className="theme-company-action" onClick={() => onCompanyResearch(ticker)}>
      {t(`View ${ticker} company research`, `查看 ${ticker} 公司研究`)} →
    </button>}
  </article>;
}

export default function ThematicResearch({
  snapshot, snapshotState = 'ready', language = 'en', onCompanyResearch, now,
  selection = defaultSelection, onSelectionChange,
}) {
  const t = tFrom(language);
  const { themeId, tickers } = selection;
  const model = useMemo(() => snapshotState === 'ready' ? buildThematicResearch(snapshot, { themeId, tickers, now, language }) : null,
    [snapshot, snapshotState, themeId, tickers, now, language]);
  const { theme, companies } = model || themeCompanies(snapshot, themeId);
  const selected = model?.selectedTickers || selectedThemeTickers(companies, tickers);
  const minimum = Math.min(2, companies.length);
  const changeTheme = nextTheme => {
    const nextCompanies = themeCompanies(snapshot, nextTheme).companies;
    const retained = selected.filter(ticker => nextCompanies.some(company => company.ticker === ticker));
    onSelectionChange?.({ themeId: nextTheme, tickers: retained.length ? selectedThemeTickers(nextCompanies, retained) : undefined });
  };
  const changeCompany = (ticker, checked) => onSelectionChange?.({
    themeId: theme.id,
    tickers: selectedThemeTickers(companies, checked ? [...selected, ticker] : selected.filter(symbol => symbol !== ticker)),
  });

  return <section className="thematic-research" aria-labelledby="themes-title">
    <div className="theme-intro">
      <div><p className="eyebrow">{t('SOURCE-LINKED COMPANY COMPARISON', '具來源的公司比較')}</p>
        <h1 id="themes-title" tabIndex={-1}>{t('Thematic Research', '主題研究')}</h1>
        <p>{t('Compare existing Gridline companies through dated market observations, reported financials and independently sourced developments.', '透過有日期的市場觀察、申報財務資料與各自具來源的進展，比較 Gridline 既有公司。')}</p>
      </div>
      <label className="theme-picker">{t('Research theme', '研究主題')}
        <select value={theme.id} onChange={event => changeTheme(event.target.value)}>
          {RESEARCH_THEMES.map(item => <option key={item.id} value={item.id}>{language === 'zh-TW' ? item.labelZh : item.label}</option>)}
        </select>
      </label>
    </div>
    {model && <section className="theme-panel theme-selection" aria-labelledby="theme-selection-title">
      <h2 id="theme-selection-title">{t('Comparison companies', '比較公司')}</h2>
      <p role="status">{t(`${selected.length} selected · ${companies.length} enabled theme members`, `已選 ${selected.length} 家 · 此主題啟用 ${companies.length} 家`)}
        {companies.length > selected.length && t(` · ${companies.length - selected.length} available to add`, ` · 可再選擇 ${companies.length - selected.length} 家`)}</p>
      {companies.length >= 2 ? <fieldset aria-describedby="theme-selection-help">
        <legend>{t('Choose two to four companies', '選擇兩至四家公司')}</legend>
        <p id="theme-selection-help">{t('At the limit, clear a selection before adding another.', '達到上限時，請先取消一家公司再加入其他公司。')}</p>
        <div className="theme-company-picker">{companies.map(company => {
          const checked = selected.includes(company.ticker);
          const atLimit = checked ? selected.length <= minimum : selected.length >= 4;
          return <label key={company.ticker} className={checked ? 'theme-company-option is-selected' : 'theme-company-option'}>
            <input type="checkbox" checked={checked} disabled={atLimit}
              onChange={event => changeCompany(company.ticker, event.target.checked)} />
            <span><strong>{company.ticker}</strong> · {company.name}</span>
          </label>;
        })}</div>
      </fieldset> : <p>{t('Comparison requires two enabled members of this theme.', '比較需要此主題中至少有兩家已啟用公司。')}</p>}
    </section>}
    {model && selected.length > 0 && <>
      <MarketComparison market={model.market} evidence={model.evidence} language={language} />
      <FinancialComparison rows={model.financials} evidence={model.evidence} language={language} />
      <section className="theme-panel" aria-labelledby="theme-evidence-title">
        <h2 id="theme-evidence-title">{t('Company developments and evidence', '公司進展與證據')}</h2>
        <div className="theme-card-grid">{model.evidence.map(item => <EvidenceCard key={item.ticker} {...{ item, language, onCompanyResearch }} />)}</div>
      </section>
      <section className="theme-panel" aria-labelledby="theme-questions-title">
        <h2 id="theme-questions-title">{t('Research questions and evidence gaps', '研究問題與證據缺口')}</h2>
        {model.questions.length ? <ol className="theme-question-list">{model.questions.map(question => <li key={`${question.ticker}-${question.en}`}>
          <strong>{question.ticker} · {t(question.en, question.zh)}</strong>
          <p>{t(question.supportEn, question.supportZh)}</p>
          {question.sourceUrl ? <SourceLink url={question.sourceUrl}>{t('Supporting evidence ↗', '支持證據 ↗')}</SourceLink>
            : onCompanyResearch && <button type="button" className="theme-company-action" onClick={() => onCompanyResearch(question.ticker)}>
              {t(`Open ${question.ticker} evidence`, `開啟 ${question.ticker} 證據`)} →
            </button>}
        </li>)}</ol> : <p>{t('Insufficient evidence for a supported research question.', '證據不足，暫無具支持的研究問題。')}</p>}
      </section>
    </>}
    <UpcomingCatalysts language={language} now={now} themeId={theme.id} tickers={selected} />
    <details className="theme-panel theme-methodology">
      <summary>{t('Methodology and coverage limitations', '方法與涵蓋限制')}</summary>
      {model?.snapshotMeta.generatedUtc && <p>{t('Snapshot generated', '快照產生時間')} <time dateTime={model.snapshotMeta.generatedUtc}>{model.snapshotMeta.generatedUtc}</time>
        {model.snapshotMeta.retainedSnapshot && <> · {t('Retained snapshot · refresh needed', '保留快照 · 需要更新')}</>}</p>}
      <p>{t('20D and 60D use shared observed closing intervals. Missing dates can extend the windows, and price histories can use different dividend or split adjustments. Financial facts keep their reported units and dates. Published developments, documented relationships, and future schedules are separate evidence types.', '20 日與 60 日採共同觀察的收盤區間。缺少日期可能延長區間，價格歷史也可能採用不同的股息或拆股調整方式。財務資料保留申報單位及日期。已發布的進展、具來源的關係及未來時程屬不同證據類型。')}</p>
      <a href="#health">{t('Open Data Health →', '開啟資料狀態 →')}</a>
    </details>
  </section>;
}
