import React from 'react';
import './EventSourceCoverage.css';

const dateLabel = value => value ? String(value).replace('T', ' ').slice(0, 16) + ' UTC' : '—';
const secureUrl = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

export default function EventSourceCoverage({ coverage, language = 'en' }) {
  const sources = Object.entries(coverage?.sources || {});
  if (!sources.length) return null;
  const t = (en, zh) => language === 'zh-TW' ? zh : en;
  const discoveryLabels = { checked: t('Checked', '已檢查'), partial: t('Partial', '部分涵蓋'), unavailable: t('Unavailable', '無法取得') };
  const verificationLabels = { ok: t('Accepted', '已通過'), partial: t('Partial', '部分通過'), degraded: t('Needs attention', '需檢查') };
  return <section className="event-provider-coverage" aria-label={t('Discovery and verification by source', '各來源的新事件探索與驗證')}>
    <h3>{t('Discovery and verification by source', '各來源的新事件探索與驗證')}</h3>
    <p>{t('Discovery checks configured official listings. Verification checks candidate articles; retained records can have older verification dates. This does not cover every announcement.', '新事件探索檢查設定的官方列表；驗證則檢查候選文章。保留紀錄可能有較早的驗證日期，並非涵蓋所有公告。')}</p>
    <div className="event-provider-grid">{sources.map(([source, item]) => <article key={source} aria-label={source}>
      <h4>{source}</h4>
      <dl>
        <div><dt>{t('Discovery', '新事件探索')}</dt><dd className={item.discoveryStatus}>{discoveryLabels[item.discoveryStatus] || t('Not recorded', '尚無紀錄')}</dd></div>
        <div><dt>{t('Article verification', '文章驗證')}</dt><dd className={item.verificationStatus}>{verificationLabels[item.verificationStatus] || t('Not recorded', '尚無紀錄')}</dd></div>
        <div><dt>{t('Candidates / accepted / excluded', '候選 / 通過 / 排除')}</dt><dd>{item.candidateCount ?? 0} / {item.acceptedCount ?? 0} / {item.excludedCount ?? 0}</dd></div>
        <div><dt>{t('Checked', '檢查時間')}</dt><dd>{dateLabel(item.checkedAt)}</dd></div>
        <div><dt>{t('Last successful source check', '最近成功來源檢查')}</dt><dd>{dateLabel(item.lastSuccessAt)}</dd></div>
      </dl>
      {item.truncated && <p className="event-provider-warning">{t('Candidate limit reached; more announcements may be available.', '已達候選筆數上限；可能仍有其他公告。')}</p>}
      {secureUrl(item.endpoint) && <a href={item.endpoint} target="_blank" rel="noopener noreferrer">{t('Official listing ↗', '官方列表 ↗')}</a>}
      {item.discoveryErrors?.length > 0 && <details><summary>{t(`Discovery issues (${item.discoveryErrors.length})`, `探索問題（${item.discoveryErrors.length}）`)}</summary><ul>{item.discoveryErrors.map((error, index) => <li key={index}>{error.message}{secureUrl(error.url) && <a href={error.url} target="_blank" rel="noopener noreferrer"> · {t('Attempted source ↗', '嘗試來源 ↗')}</a>}</li>)}</ul></details>}
    </article>)}</div>
  </section>;
}
