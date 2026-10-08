import { SIGNAL_LENSES, signalLens } from './signalLenses';
import { SIGNAL_METHOD_IDS } from './signals/registry';

test('customer-facing lens names describe the available evidence', () => {
  expect(SIGNAL_LENSES.find(lens => lens.id === 'momentum')).toMatchObject({ name: 'Market signals', nameZh: '市場訊號' });
  expect(SIGNAL_LENSES.find(lens => lens.id === 'execution')).toMatchObject({ name: 'Company financials', nameZh: '公司財務' });
});

test('momentum summary is bilingual and does not expose indicator shorthand', () => {
  const observations = Array.from({ length: 10 }, (_, index) => ({
    source: 'prices', type: 'close', ticker: 'ORCL', value: 100 + index,
    observedAt: `2026-09-${String(index + 1).padStart(2, '0')}T20:00:00Z`,
    sourceUrl: 'https://example.com/prices/orcl',
  }));
  const result = signalLens({ generatedAt: '2026-09-12T00:00:00Z', observations }, 'ORCL', 'momentum');
  expect(result).toMatchObject({ available: true, label: 'Short-term price trend: upward', labelZh: '短期價格趨勢向上', scopeZh: 'ORCL' });
  expect(result.label).not.toMatch(/MA5|MA10/);
  expect(result.methodZh).toContain('不能證明未來報酬');
  expect(result.sourceUrl).toBe('https://example.com/prices/orcl');
  expect(result.signalMethodId).toBe('trend-moving-average');
  expect(result.signalMethod).toMatchObject({ family: 'trend', state: 'upward' });
});

test('market lens can switch to RSI while keeping sourced evidence and descriptive wording', () => {
  const observations = Array.from({ length: 20 }, (_, index) => ({
    source: 'prices', type: 'close', ticker: 'ORCL', value: 100 + index,
    observedAt: `2026-09-${String(index + 1).padStart(2, '0')}T20:00:00Z`,
    sourceUrl: 'https://example.com/prices/orcl',
    providerName: 'Fixture',
  }));
  const result = signalLens(
    { generatedAt: '2026-09-21T00:00:00Z', observations },
    'ORCL',
    'momentum',
    new Date('2026-09-21T00:00:00Z'),
    SIGNAL_METHOD_IDS.MOMENTUM_RSI
  );
  expect(result.available).toBe(true);
  expect(result.signalMethodId).toBe('momentum-rsi');
  expect(result.label).toBe('RSI above upper reference range');
  expect(result.labelZh).toBe('RSI 高於上方參考區間');
  expect(result.method).toContain('0–100 momentum scale');
  expect(result.method).toContain('does not establish future returns');
  expect(result.sourceUrl).toBe('https://example.com/prices/orcl');
});

test('execution lens withholds stale or generic SEC facts', () => {
  const snapshot = { generatedAt: '2026-09-23T00:00:00Z', observations: [{ source: 'sec', type: 'revenue', ticker: 'ORCL', value: 100, periodEnd: '2024-05-31', filedAt: '2026-09-11', sourceUrl: 'https://www.sec.gov/edgar/search/' }] };
  expect(signalLens(snapshot, 'ORCL', 'execution').available).toBe(false);
});

test('execution lens names a recent exact-source EPS disclosure without inferring growth', () => {
  const snapshot = { generatedAt: '2026-09-23T00:00:00Z', observations: [{ source: 'sec', type: 'dilutedEps', ticker: 'ORCL', value: 1.56, unit: 'USD/shares', periodEnd: '2026-08-31', filedAt: '2026-09-11', form: '10-Q', sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1341439/filing.htm' }] };
  const result = signalLens(snapshot, 'ORCL', 'execution');
  expect(result.label).toBe('Diluted EPS disclosed');
  expect(result.labelZh).toBe('已揭露稀釋每股盈餘');
  expect(result.methodZh).toContain('不代表獲利成長判斷');
  expect(result.method).toContain('not an earnings-growth verdict');
});

test('execution lens uses matched quarterly EPS periods for a direction, not an invented score', () => {
  const current = { source: 'sec', type: 'dilutedEps', ticker: 'ORCL', value: 1.56, unit: 'USD/shares', taxonomy: 'us-gaap', factTag: 'EarningsPerShareDiluted', periodStart: '2026-06-01', periodEnd: '2026-08-31', filedAt: '2026-09-11', form: '10-Q', sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1341439/current.htm' };
  const prior = { ...current, type: 'dilutedEpsPrior', value: 1.12, periodStart: '2025-06-01', periodEnd: '2025-08-31', filedAt: '2025-09-11', sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1341439/prior.htm' };
  const result = signalLens({ generatedAt: '2026-09-23T00:00:00Z', observations: [current, prior] }, 'ORCL', 'execution');
  expect(result.label).toContain('increased');
  expect(result.labelZh).toBe('稀釋每股盈餘較去年同期增加');
  expect(result.methodZh).toContain('不代表獲利品質或估值判斷');
  expect(result.additionalSourceUrl).toBe(prior.sourceUrl);
  expect(result.method).toContain('Matched');
});

test('grid lens cannot misrepresent untyped historical EIA rows', () => {
  const snapshot = { generatedAt: '2026-09-23T00:00:00Z', observations: [{ source: 'eia', type: 'rtoLoad', value: 90000 }] };
  expect(signalLens(snapshot, 'NBIS', 'grid').available).toBe(false);
});

test('grid lens compares only complete typed PJM days one week apart', () => {
  const rows = [1, 8].flatMap(day => Array.from({ length: 24 }, (_, hour) => ({
    source: 'eia', type: 'rtoDemandActual', dataType: 'D', unit: 'megawatthours', region: 'PJM', value: day === 8 ? 110 : 100,
    observedAt: `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`,
    sourceUrl: 'https://api.eia.gov/v2/electricity/rto/region-data/data/',
  })));
  const signal = signalLens({ generatedAt: '2026-09-09T00:00:00Z', observations: rows }, 'NBIS', 'grid');
  expect(signal.label).toBe('PJM actual demand above prior week');
  expect(signal.labelZh).toBe('PJM 實際用電需求高於前一週');
  expect(signal.methodZh).toContain('無法單獨辨識資料中心需求');
  expect(signal.sourceLabelZh).toBe('EIA PJM 電網儀表板');
  expect(signal.sourceUrl).toContain('eia.gov/electricity/gridmonitor/');
  expect(signalLens({ generatedAt: '2026-09-09T00:00:00Z', observations: rows.slice(1) }, 'NBIS', 'grid').available).toBe(false);
});

test('all unavailable lenses supply an English and Traditional Chinese explanation', () => {
  const snapshot = { generatedAt: '2026-09-23T00:00:00Z', observations: [] };
  for (const { id } of SIGNAL_LENSES) {
    const result = signalLens(snapshot, 'ORCL', id);
    expect(result.available).toBe(false);
    for (const key of ['label', 'labelZh', 'method', 'methodZh', 'scope', 'scopeZh']) {
      expect(result[key]).toEqual(expect.any(String));
      expect(result[key].length).toBeGreaterThan(0);
    }
  }
});

test('milestone keeps its source title and translates the evidence boundary', () => {
  const url = 'https://insidelines.pjm.com/forecast-update/';
  const snapshot = { observations: [{
    source: 'events', type: 'infrastructureEvent', id: url, retrievedAt: '2026-09-20T00:00:00Z',
    value: { title: 'PJM updates its load forecast', category: 'POWER', region: 'Mid-Atlantic', source: 'PJM', publishedAt: '2026-09-19T00:00:00Z', url },
  }] };
  const result = signalLens(snapshot, 'ORCL', 'milestones', new Date('2026-09-23T00:00:00Z'));
  expect(result).toMatchObject({ available: true, label: 'PJM updates its load forecast', labelZh: '已驗證供電紀錄（PJM）', sourceUrl: url });
  expect(result.methodZh).toContain('不據此推估量化影響或歸因於個別公司');
});

test('annual ADR financials use the native unit and a genuinely comparable prior year', () => {
  const current = { source: 'sec', type: 'revenue', ticker: 'GDS', value: 100, unit: 'CNY', periodStart: '2025-01-01', periodEnd: '2025-12-31', filedAt: '2026-04-01', form: '20-F', taxonomy: 'ifrs-full', factTag: 'Revenue', sourceUrl: 'https://www.sec.gov/Archives/current.htm' };
  const prior = { ...current, type: 'revenuePrior', value: 80, periodStart: '2024-01-01', periodEnd: '2024-12-31', filedAt: '2025-04-01', sourceUrl: 'https://www.sec.gov/Archives/prior.htm' };
  const snapshot = { generatedAt: '2026-10-08T00:00:00Z', observations: [current, prior] };
  const result = signalLens(snapshot, 'GDS', 'execution');
  expect(result.label).toBe('Revenue increased versus comparable prior year');
  expect(result.labelZh).toBe('營收較前一年度增加');
  expect(result.method).toContain('CNY');
  expect(result.method).toContain('annual');
  expect(result.additionalSourceUrl).toBe(prior.sourceUrl);
  for (const change of [{ unit: 'USD' }, { taxonomy: 'us-gaap' }, { taxonomy: undefined }, { factTag: 'Revenues' }, { factTag: undefined }, { periodStart: '2024-04-01' }]) {
    expect(signalLens({ ...snapshot, observations: [current, { ...prior, ...change }] }, 'GDS', 'execution').label).toBe('Revenue disclosed');
  }
  expect(signalLens({ ...snapshot, observations: [current, prior].map(row => ({ ...row, taxonomy: undefined, factTag: undefined })) }, 'GDS', 'execution').label).toBe('Revenue disclosed');
});

test('a comparable quarter outranks annual EPS while an interim YTD remains disclosure only', () => {
  const current = { source: 'sec', type: 'revenue', ticker: 'IREN', value: 100, unit: 'USD', taxonomy: 'us-gaap', factTag: 'Revenues', periodStart: '2026-04-01', periodEnd: '2026-06-30', filedAt: '2026-08-01', sourceUrl: 'https://www.sec.gov/Archives/current.htm' };
  const prior = { ...current, type: 'revenuePrior', value: 80, periodStart: '2025-04-01', periodEnd: '2025-06-30', filedAt: '2025-08-01' };
  const eps = { ...current, type: 'dilutedEps', unit: 'USD/shares', factTag: 'EarningsPerShareDiluted', value: 1, periodStart: '2025-07-01' };
  const epsPrior = { ...eps, type: 'dilutedEpsPrior', value: 0.5, periodStart: '2024-07-01', periodEnd: '2025-06-30', filedAt: '2025-08-01' };
  const snapshot = { generatedAt: '2026-10-08T00:00:00Z', observations: [current, prior, eps, epsPrior] };
  expect(signalLens(snapshot, 'IREN', 'execution').label).toBe('Revenue increased versus comparable prior-year quarter');
  const ytd = { ...current, periodStart: '2026-01-01' };
  const result = signalLens({ ...snapshot, observations: [ytd, { ...prior, periodStart: '2025-01-01' }] }, 'IREN', 'execution');
  expect(result.label).toBe('Revenue disclosed');
  expect(result.method).toContain('year-to-date');
});

test('reviewed Loudoun milestone has a Chinese title and region', () => {
  const url = 'https://www.loudoun.gov/m/newsflash/Home/Detail/10876';
  const snapshot = { observations: [{ source: 'events', type: 'infrastructureEvent', id: url, retrievedAt: '2026-09-20T00:00:00Z', value: {
    title: 'Loudoun Board Opposes Valley North Transmission Line, Denies Substation Near Dulles Airport',
    category: 'PERMIT', region: 'Northern Virginia', source: 'Loudoun', publishedAt: '2026-09-18T00:00:00Z', url,
  } }] };
  const result = signalLens(snapshot, 'ORCL', 'milestones', new Date('2026-09-23T00:00:00Z'));
  expect(result.labelZh).toBe('勞登郡董事會反對 Valley North 輸電線，否決杜勒斯機場附近的變電站申請');
  expect(result.methodZh).toContain('北維吉尼亞');
  expect(result.scopeZh).toBe('北維吉尼亞');
});
