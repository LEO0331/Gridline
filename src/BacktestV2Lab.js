import React, { useMemo, useState } from 'react';
import { runBacktestV2 } from './backtestV2';

const pct = value => value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
const date = value => value ? String(value).slice(0, 10) : '—';

function Curve({ points, field, title }) {
  if (!points.length) return null;
  const values = points.map(point => point[field]);
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const coordinates = values.map((value, index) => `${points.length === 1 ? 0 : index * 100 / (points.length - 1)},${40 - ((value - low) / span * 36)}`).join(' ');
  return <figure className="backtest-curve"><figcaption>{title} · {date(points[0].observedAt)} → {date(points[points.length - 1].observedAt)}</figcaption><svg role="img" aria-label={title} viewBox="0 0 100 44" preserveAspectRatio="none"><polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke"/></svg><small>{pct(low - (field === 'equity' ? 1 : 0))} – {pct(high - (field === 'equity' ? 1 : 0))}</small></figure>;
}

export default function BacktestV2Lab({ ticker, observations, asOf, language }) {
  const zh = language === 'zh-TW';
  const t = (en, tw) => zh ? tw : en;
  const [method, setMethod] = useState('ma5-ma10');
  const [holdingSessions, setHolding] = useState(10);
  const [transactionCostBps, setCost] = useState(10);
  const [slippageBps, setSlippage] = useState(5);
  const [benchmark, setBenchmark] = useState('SPY');
  const result = useMemo(() => runBacktestV2({ ticker, method, holdingSessions, transactionCostBps, slippageBps, benchmark, asOf: Number.isFinite(Date.parse(asOf || '')) ? asOf : null }, Number.isFinite(Date.parse(asOf || '')) ? observations : []), [ticker, method, holdingSessions, transactionCostBps, slippageBps, benchmark, asOf, observations]);
  const m = result.metrics;
  const sampleNote = quality => quality.status === 'insufficient-history'
    ? t(`Insufficient history: ${quality.periodObservations} period observations; at least ${quality.minimumHistoryObservations} historical closes and two period dates are required.`, `歷史資料不足：本段 ${quality.periodObservations} 筆觀察值；至少需要 ${quality.minimumHistoryObservations} 筆歷史收盤價及本段兩個日期。`)
    : quality.status === 'no-completed-trades' ? t('No completed trades; sample is insufficient for trade statistics.', '沒有已完成交易；樣本不足以計算交易統計。')
      : quality.status === 'low-sample' ? t(`Low sample: ${quality.completedTrades} completed trades (caution threshold: ${quality.lowSampleTradeThreshold}). This threshold is a display warning, not statistical validation.`, `樣本偏少：${quality.completedTrades} 筆已完成交易（提醒門檻：${quality.lowSampleTradeThreshold}）。此門檻僅供顯示提醒，並非統計驗證。`)
        : t('Observed trade sample; its size does not establish predictive skill.', '已觀察交易樣本；樣本數不能證明預測能力。');
  const fields = [[t('Completed trades', '完成交易'), m.completedTrades], [t('Pending trades', '未完成交易'), m.pendingTrades],
    [t('Win rate', '勝率'), pct(m.winRate)], [t('Average net trade return', '平均淨交易報酬'), pct(m.averageNetTradeReturn)],
    [t('Compounded portfolio return', '複利模擬組合報酬'), pct(m.portfolioReturn)], [t('Maximum close-to-close drawdown', '收盤至收盤最大回撤'), pct(m.maxDrawdown)],
    [t('Average holding sessions', '平均持有交易日'), m.averageHoldingSessions === null ? '—' : m.averageHoldingSessions.toFixed(1)],
    [`${benchmark} ${t('aligned price return', '對齊價格報酬')}`, pct(result.benchmark?.value)]];
  return <>
    <section className="backtest-how"><div><p>{t('SIMULATION ASSUMPTIONS', '模擬假設')}</p>
      <div className="backtest-v2-controls">
        <label>{t('Method', '方法')}<select value={method} onChange={event => setMethod(event.target.value)}><option value="ma5-ma10">MA5 / MA10</option><option value="momentum-breakout">{t('Momentum breakout / continuation', '動能突破／延續')}</option></select></label>
        <label>{t('Holding sessions', '持有交易日')}<select value={holdingSessions} onChange={event => setHolding(Number(event.target.value))}>{[5, 10, 20, 40, 60].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t('Cost per side (bp)', '單邊成本（基點）')}<select value={transactionCostBps} onChange={event => setCost(Number(event.target.value))}>{[0, 5, 10, 25, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t('Slippage per side (bp)', '單邊滑價（基點）')}<select value={slippageBps} onChange={event => setSlippage(Number(event.target.value))}>{[0, 5, 10, 25, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t('Benchmark', '基準')}<select value={benchmark} onChange={event => setBenchmark(event.target.value)}><option>SPY</option><option>QQQ</option></select></label>
      </div>
      <p className="backtest-v2-method">{t('A signal observed after a daily close enters at the next observed close; it exits at the close after the selected holding sessions. One position at a time. The entire simulated capital is invested while active; idle cash earns zero. Fees and slippage apply on each side. These simplified closing fills are not executable.', '收盤後觀察到訊號，在下一個觀察收盤價進場；持有指定交易日後以收盤價出場。同時最多一個部位；進場投入全部模擬資本，閒置現金報酬為零。進出場各計成本與滑價。簡化收盤成交假設並不可實際執行。')}</p>
    </div><div className="backtest-coverage"><p>{t('COVERAGE AND REPRODUCIBILITY', '涵蓋與重現')}</p><dl>
      <div><dt>{t('Version', '版本')}</dt><dd>{result.backtestVersion}</dd></div><div><dt>{t('Dates', '日期')}</dt><dd>{date(result.coverage.start)} → {date(result.coverage.end)}</dd></div><div><dt>{t('Observations', '觀察值')}</dt><dd>{result.coverage.priceObservations}</dd></div><div><dt>{t('Provider', '資料供應商')}</dt><dd>{result.coverage.provider || '—'}</dd></div>
      <div><dt>{t('Unknown retrieval dates', '取得日期不明')}</dt><dd>{result.coverage.unknownRetrievalDates}</dd></div>
    </dl>{result.coverage.sourceUrl && <a href={result.coverage.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Price source', '價格來源')} ↗</a>}</div></section>
    <section className="backtest-metrics">{fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <section className="backtest-building" role="status" aria-label={t('Sample limitations', '樣本限制')}>{sampleNote(result.sampleQuality)}</section>
    {!result.benchmark && <p className="backtest-metric-note">{t('Benchmark unavailable: matching period endpoints and a continuous compatible provider history are required.', '基準無法提供：需要對齊的期間端點，以及連續且相容的供應商歷史資料。')}</p>}
    <section className="backtest-grid"><article><h2>{t('Equity and drawdown', '權益與回撤')}</h2><Curve points={result.equity} field="equity" title={t('Equity relative to initial capital', '相對初始資本的權益')}/><Curve points={result.equity} field="drawdown" title={t('Drawdown from prior peak', '相對歷史高點回撤')}/></article>
      <article><h2>{t('Chronological validation', '時間順序驗證')}</h2><p>{t('Fixed rules: first 70% in sample, remaining 30% out of sample. Each period resets to cash; earlier prices provide indicator warmup. No parameter fitting or walk-forward refitting.', '固定規則：前 70% 為樣本內，其餘 30% 為樣本外。各期間重新以現金起算，較早價格僅供指標暖身；沒有參數擬合或滾動重新擬合。')}</p>{Object.entries(result.validation).map(([key, part]) => <p key={key}><b>{key === 'inSample' ? t('In sample', '樣本內') : t('Out of sample', '樣本外')}</b> · {date(part.start)} → {date(part.end)} · {t('trades', '交易')} {part.completedTrades} · {t('return', '報酬')} {pct(part.portfolioReturn)} · {benchmark} {pct(part.benchmark?.value)}<br/><small>{sampleNote(part.sampleQuality)}</small></p>)}<h2>{t('Cost sensitivity', '成本敏感度')}</h2>{result.sensitivity.map((item, i) => <p key={i}>{item.transactionCostBps} bp + {item.slippageBps} bp {t('per side', '每邊')} · {pct(item.portfolioReturn)}</p>)}</article></section>
    <section className="backtest-grid"><article><h2>{t('Historical trade records', '歷史交易紀錄')}</h2>{[...result.trades, ...result.pending].length ? [...result.trades, ...result.pending].slice().reverse().map((trade, index) => <p key={`${trade.signalAt}-${index}`}><b>{date(trade.signalAt)}</b> · {date(trade.entryAt)} → {date(trade.exitAt)} · {trade.status === 'complete' ? pct(trade.netReturn) : t('Pending / open', '待完成／持有中')} {trade.entryPrice && <small>(${trade.entryPrice.toFixed(2)} → {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '—'})</small>}</p>) : <p>{t('No trades observed.', '沒有交易紀錄。')}</p>}</article><article><h2>{t('Limitations', '限制')}</h2><p>{t('Small samples, missing sessions, retrospective provider revisions and survivorship limit reliability. Observations retrieved after the cutoff are excluded, but missing retrieval dates cannot be verified and historical archives are not reconstructed. Splits and dividends may be inconsistently adjusted, so returns are price-only. Benchmark requires matching endpoints and provider. Open positions are marked at the final close without estimated exit costs. This is research, not financial advice.', '樣本少、缺失交易日、供應商事後修訂及存活偏差限制可靠度。取得日期晚於截止時間的觀察值會排除，但取得日期不明時無法核實，且未重建歷史資料檔案。拆股與股利可能未一致調整，報酬僅反映價格；基準須有對齊端點與相同供應商。未平倉部位以最後收盤價估值，未計預估出場成本。此為研究而非投資建議。')}</p></article></section>
  </>;
}
