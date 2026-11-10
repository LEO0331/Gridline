import React, { useMemo } from 'react';
import { buildDailyResearchBrief } from '../dailyResearchBriefModel';
import { eventTitle } from '../eventModel';
import { formatUsd } from '../marketSignals';
import { RESEARCH_THEMES } from '../researchThemes';
import './DailyResearchBrief.css';

const developmentTickers = RESEARCH_THEMES.filter(({ id }) => id === 'neocloud' || id === 'hardware')
  .flatMap(({ tickers }) => tickers);

function SourceLink({ url, children }) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function DateText({ date, showTime = false }) {
  if (!date) return '—';
  const label = showTime ? new Date(date).toISOString().slice(0, 16).replace('T', ' ') : date.slice(0, 10);
  return <time dateTime={date}>{label}</time>;
}

function focusEvidence(id) {
  const target = document.getElementById(id);
  if (target) {
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'start' });
  }
}

export default function DailyResearchBrief({ snapshot, ticker, tickers, language = 'en', onTickerChange, context, now }) {
  const zh = language === 'zh-TW';
  const t = (en, tw) => zh ? tw : en;
  const model = useMemo(() => buildDailyResearchBrief(snapshot, {
    ticker, tickers, developmentTickers, language, context, now,
  }), [snapshot, ticker, tickers, language, context, now]);
  const { market, benchmarks, expectedSession, latestObservedSession, missingMarket, staleMarket, selectedMarket,
    comparison, disclosure, selectedDisclosureAvailable, event, questions, sourceGaps, snapshotMeta } = model;
  const hasDetails = Boolean(snapshot?.observations?.length);
  const missing = t('Unavailable', '無法提供');
  const healthLabel = source => ({
    prices: t('Market prices', '市場價格'), events: t('Event sources', '事件來源'), sec: 'SEC', eia: 'EIA',
    'company-research': t('Official company research', '公司官方研究來源'),
  }[source] || source);
  const statusLabel = status => ({
    ok: t('Updated', '已更新'), partial: t('Partial coverage', '部分涵蓋'), degraded: t('Update incomplete', '更新未完成'),
    retained: t('Previous data retained', '保留前次資料'), cached: t('Previously retrieved', '先前取得'), stale: t('Stale', '過期'),
  }[status] || missing);
  const trendState = state => ({
    above: t('Upward', '向上'), below: t('Downward', '向下'), mixed: t('Mixed', '混合'),
  }[state] || missing);
  const maState = state => ({
    above: t('Above MA20', '高於 MA20'), below: t('Below MA20', '低於 MA20'), equal: t('At MA20', '等於 MA20'),
  }[state] || t('MA20 unavailable', '無法提供 MA20'));
  const questionsByType = {
    trend: ({ ticker, date }) => t(`Does ${ticker}’s recorded trend transition on ${date} persist in the next available observation?`, `${ticker} 在 ${date} 記錄的趨勢轉變是否延續至下一筆可用觀察？`),
    event: ({ date }) => t(`Has the infrastructure record published on ${date} been followed by a documented decision or implementation milestone?`, `${date} 發布的基礎設施紀錄之後，是否有具文件佐證的決策或執行里程碑？`),
    disclosure: ({ ticker, date }) => t(`Is there a more recent official update to ${ticker}’s ${date} disclosure?`, `${ticker} 在 ${date} 發布的揭露是否已有更新的官方資料？`),
  };
  const relative = market.benchmarks.flatMap(({ ticker }) => {
    const result = selectedMarket?.comparisons[ticker][20];
    return result ? [`${ticker} ${result.percentagePoints >= 0 ? '+' : ''}${result.percentagePoints.toFixed(2)} ${t('pp', '百分點')}`] : [];
  });
  const price = comparison?.price;
  const signal = comparison?.signal;
  const health = comparison?.health;
  const eventChange = comparison?.event;
  const eventLink = t('Infrastructure source ↗', '基礎設施來源 ↗');

  return <section className="daily-brief" aria-labelledby="daily-brief-title">
    <h2 id="daily-brief-title">{t('After-Market Research Brief', '盤後研究簡報')}</h2>
    <p className="daily-brief-meta">
      {t('Latest observed U.S. session', '最新觀察到的美股交易日')} {latestObservedSession ? <DateText date={latestObservedSession} /> : missing}
      {latestObservedSession && latestObservedSession !== expectedSession && <> · {t('Earlier session retained', '保留較早交易日資料')}</>}
      {expectedSession && latestObservedSession !== expectedSession && <> · {t('Awaiting expected session', '尚待預期交易日資料')} <DateText date={expectedSession} /></>}
      {snapshotMeta.totalSources > 0 && <> · {t(`${snapshotMeta.healthySources}/${snapshotMeta.totalSources} reported sources updated`, `${snapshotMeta.totalSources} 個有狀態紀錄的來源中，${snapshotMeta.healthySources} 個已更新`)}</>}
    </p>
    <div className="daily-brief-grid">
      <div>
        <h3>{t('Market context', '市場背景')}</h3>
        <ul>
          {benchmarks.map(({ ticker, latest, current, trend }) => <li key={ticker}>
            <strong>{ticker}</strong> · {latest ? <><DateText date={latest.date} /> · {formatUsd(latest.value)} · {current ? maState(trend) : t('Earlier close retained', '保留較早收盤價')} <SourceLink url={latest.sourceUrl}>{t(`${ticker} source ↗`, `${ticker} 來源 ↗`)}</SourceLink></> : missing}
          </li>)}
          <li>{market.coverage ? t(`${market.above}/${market.coverage} covered companies above MA20`, `有資料的 ${market.coverage} 家公司中，${market.above} 家高於 MA20`) : t('Basket participation unavailable', '無法提供組合參與率')} · {t(`Coverage ${market.coverage}/${market.total}`, `涵蓋 ${market.coverage}/${market.total}`)}</li>
          <li>{ticker} {t('20D relative performance', '20 日相對表現')} · {relative.join(' · ') || missing}</li>
        </ul>
        {hasDetails && <button type="button" onClick={() => focusEvidence('overview-market-context')}>{t('View market context', '查看市場背景')}</button>}
      </div>
      <div>
        <h3>{t('Since the previous snapshot', '自前次快照以來')}</h3>
        {!comparison ? <p>{t('Previous snapshot comparison unavailable.', '無法比較前一次快照。')}</p> : <>
          <p><DateText date={comparison.from} showTime /> → <DateText date={comparison.to} showTime /> UTC · {comparison.count ? t(`${comparison.count} recorded changes`, `${comparison.count} 項已記錄變化`) : t('No material changes', '無重要變化')}</p>
          {(price || signal || health) && <ul>
            {price && <li><strong>{price.ticker}</strong> · <DateText date={price.observedAt} /> · {price.valueUnchanged
              ? t(`Observation updated, close unchanged at ${formatUsd(price.after)}`, `觀察資料已更新，收盤價維持 ${formatUsd(price.after)}`)
              : Number.isFinite(price.before) ? `${formatUsd(price.before)} → ${formatUsd(price.after)}` : t(`Close now available at ${formatUsd(price.after)}`, `收盤價現已可用，為 ${formatUsd(price.after)}`)}
              {' '}<SourceLink url={price.sourceUrl}>{t('Price source ↗', '價格來源 ↗')}</SourceLink></li>}
            {signal && <li><strong>{signal.ticker}</strong> · {t('Recorded trend', '已記錄趨勢')} · {signal.beforeAvailable ? trendState(signal.before) : missing} → {signal.afterAvailable ? trendState(signal.after) : missing}{signal.observedAt && <> · <DateText date={signal.observedAt} /></>}
              {' '}<SourceLink url={signal.sourceUrl}>{t('Trend source ↗', '趨勢來源 ↗')}</SourceLink></li>}
            {health && <li>{healthLabel(health.source)} · {statusLabel(health.before)} → {statusLabel(health.after)}{health.checkedAt && <> · {t('Checked', '檢查日期')} <DateText date={health.checkedAt} /></>}</li>}
          </ul>}
          {hasDetails && <button type="button" onClick={() => focusEvidence('overview-snapshot-changes')}>{t('View snapshot changes', '查看快照差異')}</button>}
        </>}
      </div>
      <div>
        <h3>{t('Company and infrastructure developments', '公司與基礎設施進展')}</h3>
        {!selectedDisclosureAvailable && ticker && <p>{t(`No dated official disclosure is available for ${ticker}.`, `${ticker} 目前無具日期的官方揭露可供查閱。`)}</p>}
        {disclosure && <>
          <p><strong>{disclosure.ticker}</strong> · {t('Published', '發布日期')} <DateText date={disclosure.publishedAt} />{disclosure.archived && <> · {t('Older record', '較早紀錄')}</>}{disclosure.verificationStatus === 'retained-reviewed' && <> · {t('Retained reviewed source', '保留已審閱來源')}</>}</p>
          <p><SourceLink url={disclosure.url}>{zh ? disclosure.titleZh || `${disclosure.ticker} 官方來源` : disclosure.title} ↗</SourceLink></p>
          {hasDetails && <button type="button" onClick={() => {
            if (disclosure.ticker !== ticker) onTickerChange?.(disclosure.ticker);
            focusEvidence('overview-company-research');
          }}>{t(`View ${disclosure.ticker} research`, `查看 ${disclosure.ticker} 研究`)}</button>}
        </>}
        {event ? <p>{eventChange && <strong>{eventChange.type === 'event-added' ? t('Added to snapshot', '新增至快照') : t('Updated in snapshot', '快照中已更新')} · </strong>}
          {t('Published', '發布日期')} <DateText date={event.publishedAt} />{event.archived && <> · {t('Archived', '已封存')}</>} · <SourceLink url={event.url}>{eventTitle(event, language)} ↗</SourceLink></p>
          : <p>{t('No verified infrastructure record is available.', '尚無可用的已驗證基礎設施紀錄。')}</p>}
      </div>
    </div>
    <div className="daily-brief-details">
      <details>
        <summary>{t('Research questions', '研究問題')}{questions.length ? ` (${questions.length})` : ''}</summary>
        {questions.length ? <ul>{questions.map(question => <li key={question.type}>{questionsByType[question.type](question)} <SourceLink url={question.url}>{question.type === 'event' ? eventLink : t('Supporting source ↗', '佐證來源 ↗')}</SourceLink></li>)}</ul>
          : <p>{t('Insufficient evidence for a research question.', '目前證據不足，無法提出研究問題。')}</p>}
      </details>
      <details>
        <summary>{t('Source health and limitations', '來源健康與限制')}</summary>
        <p>{t('Snapshot generated', '快照產生時間')} {snapshotMeta.generatedUtc ? <time dateTime={snapshotMeta.generatedUtc}>{snapshotMeta.generatedLabel}</time> : missing}{snapshotMeta.retainedSnapshot && <> · {t('Retained snapshot; refresh delayed', '保留快照；更新延遲')}</>}</p>
        {staleMarket.length > 0 && <p>{t(`Earlier closes retained for ${staleMarket.length} instruments`, `${staleMarket.length} 個標的保留較早收盤價`)}</p>}
        {missingMarket.length > 0 && <p>{t(`Eligible closes unavailable for ${missingMarket.length} instruments`, `${missingMarket.length} 個標的無符合條件的收盤價`)}</p>}
        <p>{sourceGaps.length ? sourceGaps.map(({ source, status }) => `${healthLabel(source)} · ${statusLabel(status)}`).join(' / ') : t('All listed source statuses were updated.', '所列來源狀態均顯示已更新。')}</p>
      </details>
      <a href="#health">{t('Data Health', '資料健康')} →</a>
    </div>
  </section>;
}
