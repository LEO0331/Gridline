import React, { useEffect, useMemo, useState } from 'react';
import { runPriceBacktest } from './backtestModel';
import { researchLabCopy } from './researchLabI18n';
import './BacktestLab.css';
import { groupedCompanies, trackedCompanies } from './companyRegistry';

const pct = value => value === null || value === undefined ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
const dateOnly = value => value ? String(value).slice(0, 10) : '—';

export default function BacktestLab({ onBack, language = 'en', onLanguageChange = () => {} }) {
  const [observations, setObservations] = useState([]);
  const [snapshot, setSnapshot] = useState({});
  const [ticker, setTicker] = useState('NBIS');
  useEffect(() => {
    const enabled = trackedCompanies(snapshot);
    if (enabled.length && !enabled.some(company => company.ticker === ticker)) setTicker(enabled[0].ticker);
  }, [snapshot, ticker]);
  const copy = researchLabCopy(language);
  const b = copy.historical;

  useEffect(() => {
    let active = true;
    fetch(`${process.env.PUBLIC_URL}/data/dashboard-snapshot.json`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => { if (active) { setObservations(data.observations || []); setSnapshot(data); } })
      .catch(() => { if (active) setObservations([]); });
    return () => { active = false; };
  }, []);

  const result = useMemo(() => runPriceBacktest({ ticker }, observations), [ticker, observations]);

  return <main className="backtest-shell" lang={language}>
    <header className="backtest-header">
      <button onClick={onBack}><b>GRIDLINE</b><small>{b.lab}</small></button>
      <div>
        <button onClick={() => onLanguageChange(language === 'zh-TW' ? 'en' : 'zh-TW')}>{copy.languageToggle}</button>
        <button onClick={onBack}>{b.back}</button>
      </div>
    </header>

    <section className="backtest-hero">
      <div><p>{b.kicker}</p><h1>{b.title}</h1><span>{b.intro}</span></div>
      <div className="backtest-selectors">
        <select aria-label={language === 'zh-TW' ? '公司代號' : 'Ticker'} value={ticker} onChange={event => setTicker(event.target.value)}>
          {groupedCompanies(trackedCompanies(snapshot)).map(({ category, companies }) => <optgroup key={category.id} label={language === 'zh-TW' ? category.labelZh : category.label}>{companies.map(company => <option key={company.ticker} value={company.ticker}>{company.ticker} · {company.name}</option>)}</optgroup>)}
        </select>
      </div>
    </section>

    <section className="backtest-how">
      <div>
        <p>{b.signalFamilies}</p>
        <ul>{b.families.map(item => <li key={item}>{item}</li>)}</ul>
        <details><summary>{b.timingTitle}</summary><p>{b.timing}</p></details>
      </div>
      <div className="backtest-coverage">
        <p>{b.coverage}</p>
        <dl>
          <div><dt>{b.range}</dt><dd>{dateOnly(result.coverage.start)} → {dateOnly(result.coverage.end)}</dd></div>
          <div><dt>{b.observations}</dt><dd>{result.coverage.priceObservations}</dd></div>
          <div><dt>{b.signals}</dt><dd>{result.coverage.totalSignals}</dd></div>
        </dl>
      </div>
    </section>

    <section className="backtest-metrics">
      <Metric label={b.completed} value={result.metrics.sampleSize}/>
      <Metric label={b.pending} value={result.metrics.pendingSignals}/>
      <Metric label={b.hitRate} value={result.metrics.directionalHitRate === null ? '—' : `${(result.metrics.directionalHitRate * 100).toFixed(0)}%`}/>
      <Metric label={b.avgReturn} value={pct(result.metrics.averageDirectionalReturn)}/>
    </section>
    <p className="backtest-metric-note">{b.metricNote}</p>

    {result.status === 'insufficient-data' && <section className="backtest-building"><b>{b.unavailable}</b></section>}

    <section className="backtest-grid">
      <article>
        <h2>{b.ledger}</h2>
        <div className="backtest-table">
          <div className="head"><span>{b.signalDate}</span><span>{b.direction}</span><span>{b.signalClose}</span><span>{b.outcome}</span></div>
          {result.rows.length ? result.rows.slice(-12).reverse().map(row => <div key={row.signalAt}>
            <span>{dateOnly(row.signalAt)}</span>
            <span>{row.direction === 'bullish' ? b.bullish : b.bearish}</span>
            <span>${row.signalClose.toFixed(2)}</span>
            <span>{row.status === 'complete' ? pct(row.forwardReturn) : b.pending}<br/>
              {row.entryAt && <small>{dateOnly(row.entryAt)} ${row.entryPrice.toFixed(2)} → {row.exitAt ? `${dateOnly(row.exitAt)} $${row.exitPrice.toFixed(2)}` : '—'}</small>}<br/>
              <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">{b.source}</a>
            </span>
          </div>) : <p>{b.noSignals}</p>}
        </div>
      </article>
      <article><h2>{b.limits}</h2><ol>{b.limitations.map(item => <li key={item}>{item}</li>)}</ol></article>
    </section>

    <aside className="backtest-note">{b.note}</aside>
  </main>;
}

function Metric({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
