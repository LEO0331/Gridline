import React, { useMemo } from 'react';
import { buildCompanyResearch } from '../companyResearchModel';
import './CompanyResearch.css';

const safeUrl = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const dateLabel = value => value ? String(value).slice(0, 10) : '—';
const asItems = value => Array.isArray(value) ? value : value ? [value] : [];

function SourceLink({ url, children }) {
  return safeUrl(url) ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : null;
}

function Metric({ metric, zh, t }) {
  const value = typeof metric.value === 'number' && Number.isFinite(metric.value)
    ? metric.value.toLocaleString(zh ? 'zh-TW' : 'en-US', { maximumFractionDigits: 4 }) : '—';
  return <article className="company-research-metric">
    <h4>{zh ? metric.labelZh || metric.label : metric.label}</h4>
    <strong>{value} <small>{metric.unit}</small></strong>
    <span>{t('Period', '報告期間')}: {metric.periodStart ? `${dateLabel(metric.periodStart)} → ` : ''}{dateLabel(metric.periodEnd)}</span>
    <span>{t('Filed', '申報')}: {dateLabel(metric.filedAt)}{metric.form ? ` · ${metric.form}` : ''}</span>
    <SourceLink url={metric.sourceUrl}>{t('SEC source ↗', 'SEC 來源 ↗')}</SourceLink>
  </article>;
}

export default function CompanyResearch({ snapshot, ticker, language = 'en', now }) {
  const zh = language === 'zh-TW';
  const t = (en, tw) => zh ? tw : en;
  const research = useMemo(() => buildCompanyResearch(snapshot, ticker, now), [snapshot, ticker, now]);
  const { company, financials = [], filings = [], events = [], coverage = {}, profile } = research;
  const statusNames = { ok: t('Source check passed', '來源檢查通過'), partial: t('Partial coverage', '部分涵蓋'), degraded: t('Source check limited', '來源檢查有限'), stale: t('Retained data · refresh needed', '保留資料 · 需要更新'), missing: t('No financial data recorded', '尚無財務資料'), unavailable: t('Source unavailable', '來源暫無法取得') };
  const focus = asItems(zh ? profile?.focusZh || profile?.focus : profile?.focus);
  const risks = asItems(zh ? profile?.risksZh || profile?.risks : profile?.risks);
  const recent = events.filter(item => !item.archived);
  const older = [...recent.slice(3), ...events.filter(item => item.archived)];
  const renderEvent = (event, index) => <article className="company-research-event" key={`${event.url}-${index}`}>
    <div className="company-research-event-date"><time dateTime={event.publishedAt}>{dateLabel(event.publishedAt)}</time>{event.archived && <span>{t('Older record', '較早紀錄')}</span>}</div>
    <h4><SourceLink url={event.url}>{zh ? event.titleZh || event.title : event.title} ↗</SourceLink></h4>
    <p>{zh ? event.summaryZh || event.summary : event.summary}</p>
    <small>{event.source}{event.retrievedAt && ` · ${t('Verified', '驗證')} ${dateLabel(event.retrievedAt)}`}</small>
  </article>;
  return <section className="company-research" aria-label={t('Company research', '公司研究')}>
    <header className="company-research-head"><div><p className="eyebrow">{t('COMPANY EVIDENCE', '公司證據')}</p><h2>{ticker} · {company?.name || ticker}</h2><p>{t('Reported financials and dated official developments for the selected company.', '所選公司的已申報財務數據與具日期的官方進展。')}</p></div>
      <div className={`company-research-health ${coverage.status || 'missing'}`}><strong>{statusNames[coverage.status] || t('Coverage not recorded', '尚無涵蓋紀錄')}</strong><span>{t('Last successful SEC check', '最近成功 SEC 檢查')}: {dateLabel(coverage.lastSuccessAt)}</span>{coverage.message && <span>{coverage.message}</span>}</div>
    </header>
    <div className="company-research-financials"><h3>{t('SEC financial records', 'SEC 財務紀錄')}</h3><p className="company-research-note">{t('Amounts retain the source currency and units. Periods can differ by company and metric; these are reported values, not forecasts.', '金額保留來源幣別及單位。公司與指標的報告期間可能不同；此為申報數值，並非預測。')}</p>
      {financials.length ? <><div className="company-research-metrics">{financials.slice(0, 5).map(metric => <Metric key={metric.id} metric={metric} zh={zh} t={t} />)}</div>{financials.length > 5 && <details><summary>{t('More reported metrics', '更多已申報指標')} ({financials.length - 5})</summary><div className="company-research-metrics">{financials.slice(5).map(metric => <Metric key={metric.id} metric={metric} zh={zh} t={t} />)}</div></details>}</> : <p className="company-research-empty">{t('No supported SEC financial metrics are available for this company yet.', '此公司目前尚無可用的支援 SEC 財務指標。')}</p>}
      {filings.length > 0 && <details className="company-research-filings"><summary>{t('Filing references', '申報文件')} ({filings.length})</summary><ul>{filings.map((filing, index) => <li key={`${filing.sourceUrl}-${index}`}><SourceLink url={filing.sourceUrl}>{filing.form || t('Filing', '申報')} · {dateLabel(filing.filedAt)} ↗</SourceLink></li>)}</ul></details>}
    </div>
    <div className="company-research-bottom"><div className="company-research-profile"><h3>{t('Research focus', '研究焦點')}</h3>{focus.length ? <ul>{focus.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="company-research-empty">{t('A sourced business profile is not recorded yet.', '尚無具來源的業務研究摘要。')}</p>}{risks.length > 0 && <><h3>{t('What to verify next', '下一步應查證什麼')}</h3><ul>{risks.map((item, index) => <li key={index}>{item}</li>)}</ul></>}{profile?.sourceUrl && <SourceLink url={profile.sourceUrl}>{t('Business source ↗', '業務來源 ↗')}</SourceLink>}{profile?.sources?.map((source, index) => <SourceLink key={index} url={source.url}>{source.title || t('Business source', '業務來源')} ↗</SourceLink>)}</div>
      <div className="company-research-developments"><h3>{t('Official company developments', '公司官方進展')}</h3>{recent.slice(0, 3).map(renderEvent)}{older.length > 0 && <details><summary>{t('More dated records', '更多具日期紀錄')} ({older.length})</summary>{older.map(renderEvent)}</details>}{!events.length && <p className="company-research-empty">{t('No verified company-specific announcements are recorded yet.', '尚無已驗證的公司專屬公告紀錄。')}</p>}</div>
    </div>
  </section>;
}
