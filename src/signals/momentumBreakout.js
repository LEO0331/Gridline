import { evidenceFor, latestSourceSegment } from './series';
import { momentumBreakoutTimeline, LOOKBACK, MAX_AGE, INVALIDATION_RATIO } from './momentumBreakoutCore';

export const momentumBreakoutMethod = {
  id: 'momentum-breakout', family: 'momentum', name: 'Momentum breakout', nameZh: '動能突破',
  minimumObservations: LOOKBACK + 1,
  parameters: { lookbackSessions: LOOKBACK, maxAgeSessions: MAX_AGE, invalidationRatio: INVALIDATION_RATIO },
  copy: {
    en: {
      whatItMeasures: 'Describes a close above the highest close of the preceding 20 sessions and subsequent pullback or reconfirmation.',
      commonUse: 'Research a daily-close breakout and its continuation; it is not a trade instruction.',
      limitations: [
        'Daily closes do not reveal intraday highs, lows, volume, VWAP, or execution prices.',
        'The setup expires after 20 sessions or invalidates below 95% of its reference close; thresholds are conventions, not forecasts.',
        'Provider revisions and unverified split or dividend adjustments can change historical results.',
      ],
    },
    'zh-TW': {
      whatItMeasures: '描述收盤價突破前 20 個交易觀察值最高收盤價後的回檔與再確認。',
      commonUse: '以每日收盤價研究突破與延續，並非交易指示。',
      limitations: [
        '每日收盤價無法顯示盤中高低、成交量、VWAP 或實際成交價。',
        '突破後 20 個交易觀察值到期，或跌破參考收盤價的 95% 時失效；門檻是慣例而非預測。',
        '資料供應商修訂及未經確認的拆股或股利調整可能改變歷史結果。',
      ],
    },
  },
  evaluate(rows = []) {
    const segment = latestSourceSegment(rows);
    const met = segment.length >= this.minimumObservations;
    const evidence = evidenceFor(rows);
    const requirements = { minimumObservations: this.minimumObservations, sameSourceWindow: true, met,
      reasons: met ? [] : ['requires-consistent-price-history'] };
    const points = met ? momentumBreakoutTimeline(segment) : [];
    const latest = points[points.length - 1];
    return { id: this.id, family: this.family, observedAt: latest?.observedAt || segment.at(-1)?.observedAt || rows.at(-1)?.observedAt || null,
      state: latest?.state || 'unavailable', value: latest?.value || null,
      events: points.filter(point => point.changed).map(({ changed, ...point }) => point),
      evidence, requirements, limitations: this.copy.en.limitations };
  },
};
