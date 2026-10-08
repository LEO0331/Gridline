import React, { useMemo } from 'react';
import { groupedCompanies, trackedCompanies } from '../companyRegistry';
import { buildResearchBrief, briefRegionLabel } from '../researchBriefModel';
import './ResearchBrief.css';

const LANE_NAMES = {
  grid: ['Grid demand', '電網需求'],
  projects: ['Project decisions', '專案決策'],
  company: ['Company disclosures', '公司揭露'],
  market: ['Market prices', '市場價格'],
};

export default function ResearchBrief({ snapshot, ticker, region, regions, language, onTickerChange, onRegionChange }) {
  const zh = language === 'zh-TW';
  const t = (en, tw) => zh ? tw : en;
  const brief = useMemo(() => buildResearchBrief(snapshot, { ticker, region }), [snapshot, ticker, region]);
  const companyGroups = groupedCompanies(trackedCompanies(snapshot));
  const otherRelationshipTickers = brief.otherRelationshipTickers.filter(symbol => companyGroups.some(group => group.companies.some(company => company.ticker === symbol)));
  return <section className="research-brief" aria-label={t('Buildout evidence brief', '建設證據摘要')}>
    <div className="research-brief-head">
      <div><p className="eyebrow">{t('FOCUSED RESEARCH WORKFLOW', '聚焦研究流程')}</p>
        <h2>{t('Is the data-center buildout showing up?', '資料中心建設是否已有可觀察的進展？')}</h2>
        <p>{t('Compare four independent evidence views. A dated record supports its stated fact, not a causal investment conclusion.', '並列四個獨立的證據面向。有日期的紀錄只支持其所述事實，不代表投資因果結論。')}</p>
      </div>
      <div className="research-brief-selectors">
        <label>{t('Company', '公司')}<select value={ticker} onChange={event => onTickerChange(event.target.value)}>{companyGroups.map(({ category, companies }) => <optgroup key={category.id} label={zh ? category.labelZh : category.label}>{companies.map(company => <option key={company.ticker} value={company.ticker}>{company.ticker} · {company.name}</option>)}</optgroup>)}</select></label>
        <label>{t('Region', '區域')}<select value={region} onChange={event => onRegionChange(event.target.value)}>{regions.map(item => <option key={item} value={item}>{briefRegionLabel(item, language)}</option>)}</select></label>
      </div>
    </div>
    <div className="research-brief-grid">{brief.lanes.map(lane => {
      const limited = lane.available && lane.health && lane.health !== 'ok';
      return <article key={lane.id} className="research-brief-lane">
        <div className="research-brief-lane-head"><span>{zh ? LANE_NAMES[lane.id][1] : LANE_NAMES[lane.id][0]}</span>
          <b className={`brief-status ${!lane.available ? 'missing' : limited ? 'limited' : 'recorded'}`}>{!lane.available ? t('Unavailable', '尚無資料') : limited ? t('Source check limited', '來源檢查有限') : t('Evidence recorded', '已有紀錄')}</b></div>
        <h3>{zh ? lane.titleZh : lane.title}</h3>
        <p>{zh ? lane.detailZh : lane.detail}</p>
        <div className="research-brief-evidence"><span>{t('Observed', '觀察日期')}：{lane.observedAt || '—'}</span>
          {lane.lastVerifiedAt && <span>{t('Last verified', '最近驗證')}：{lane.lastVerifiedAt}</span>}
          {lane.available && lane.sourceUrl && <a href={lane.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Open evidence ↗', '開啟證據 ↗')}</a>}</div>
      </article>;
    })}</div>
    <div className="research-relationships"><div><p className="eyebrow">{t('DOCUMENTED RELATIONSHIPS', '具來源的關係')}</p>
      <h3>{t('Company · facility · grid', '公司 · 設施 · 電網')}</h3>
      <p>{t('A relationship is shown only when a primary source explicitly connects the entities. It does not establish project profitability, regional load attribution or a stock-price effect.', '只有一級來源明確連結實體時才顯示關係；這不代表專案獲利、區域用電歸因或股價影響。')}</p></div>
      <div className="research-relationship-records">{brief.relationships.length ? brief.relationships.map(item => <article key={item.id}>
        <strong>{item.ticker} → {zh ? item.facilityZh : item.facility} → {item.grid}</strong>
        <span>{zh ? item.relationshipZh : item.relationship}</span>
        <small>{t('Published', '發布')} {item.publishedAt} · {t('Reviewed', '審查')} {item.reviewedAt}</small>
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Official record ↗', '官方紀錄 ↗')}</a>
      </article>) : <p>{t('No documented company–facility–grid link is recorded for this selection.', '所選範圍尚無具來源的公司、設施與電網連結紀錄。')}</p>}
        {otherRelationshipTickers.length > 0 && <div className="relationship-other">{t('Documented link available for', '其他具來源連結的公司')}：{otherRelationshipTickers.map(other => <button key={other} onClick={() => onTickerChange(other)}>{other} →</button>)}</div>}
      </div>
    </div>
  </section>;
}
