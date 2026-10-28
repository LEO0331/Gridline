import {
  DEFAULT_SIGNAL_METHOD_ID,
  SIGNAL_METHOD_IDS,
  SIGNAL_METHODS,
  evaluateSignalMethod,
  evaluateSignalMethods,
  evaluateSnapshotSignalMethod,
  normalizePriceObservations,
} from './registry';

const observedAt = index => new Date(Date.UTC(2026, 0, index + 1)).toISOString();

const observations = (values, sourceUrl = 'https://example.com/prices') => values.map((value, index) => ({
  id: `p${index}`,
  source: 'prices',
  type: 'close',
  ticker: 'NBIS',
  value,
  observedAt: observedAt(index),
  retrievedAt: observedAt(index + 100),
  provenance: { provider: 'Fixture', originUrl: sourceUrl },
}));

const rows = values => normalizePriceObservations(observations(values), 'NBIS');

test('registry exposes descriptive signal methods without buy/sell verdicts', () => {
  expect(DEFAULT_SIGNAL_METHOD_ID).toBe('trend-moving-average');
  expect(SIGNAL_METHODS.map(method => [method.id, method.family])).toEqual([
    ['trend-moving-average', 'trend'],
    ['momentum-rsi', 'momentum'],
    ['momentum-breakout', 'momentum'],
    ['volatility-bollinger', 'volatility'],
  ]);
  const copy = JSON.stringify(SIGNAL_METHODS);
  expect(copy).not.toMatch(/\bbuy\b|\bsell\b/i);
  expect(copy).not.toMatch(/買進|賣出/);
});

test('moving-average method keeps the current trend logic and emits crossover events', () => {
  const result = evaluateSignalMethod(SIGNAL_METHOD_IDS.TREND_MOVING_AVERAGE, rows([
    10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 20,
  ]));
  expect(result.state).toBe('upward');
  expect(result.value).toMatchObject({
    close: 20,
    shortAverage: 12,
    longAverage: 11,
    shortPeriod: 5,
    longPeriod: 10,
  });
  expect(result.events).toEqual([
    expect.objectContaining({ observedAt: observedAt(10), state: 'upward' }),
  ]);
  expect(result.requirements.met).toBe(true);
  expect(result.evidence.observationIds).toHaveLength(10);
});

test('RSI uses Wilder smoothing and descriptive reference ranges', () => {
  const classicWilderExample = [
    44.34, 44.09, 44.15, 43.61, 44.33,
    44.83, 45.10, 45.42, 45.84, 46.08,
    45.89, 46.03, 45.61, 46.28, 46.28,
  ];
  const result = evaluateSignalMethod(SIGNAL_METHOD_IDS.MOMENTUM_RSI, rows(classicWilderExample));
  expect(result.value.rsi).toBeCloseTo(70.4641, 3);
  expect(result.value).toMatchObject({
    period: 14,
    lowerReference: 30,
    upperReference: 70,
    smoothing: 'Wilder',
  });
  expect(result.state).toBe('upper-reference-range');
  expect(result.events.at(-1)).toMatchObject({ state: 'upper-reference-range' });
});

test('Bollinger method uses a 20-session mean and two population standard deviations', () => {
  const result = evaluateSignalMethod(
    SIGNAL_METHOD_IDS.VOLATILITY_BOLLINGER,
    rows([...Array(19).fill(100), 150])
  );
  expect(result.state).toBe('above-upper-band');
  expect(result.value.middleBand).toBe(102.5);
  expect(result.value.standardDeviation).toBeCloseTo(10.8972, 3);
  expect(result.value.upperBand).toBeCloseTo(124.2945, 3);
  expect(result.value.lowerBand).toBeCloseTo(80.7055, 3);
  expect(result.events.at(-1)).toMatchObject({ state: 'above-upper-band' });
});

test('all methods return the same top-level result contract', () => {
  const results = evaluateSignalMethods(rows(Array.from({ length: 30 }, (_, index) => 100 + index)));
  for (const result of Object.values(results)) {
    expect(result).toEqual(expect.objectContaining({
      id: expect.any(String),
      family: expect.any(String),
      observedAt: expect.any(String),
      state: expect.any(String),
      events: expect.any(Array),
      evidence: expect.objectContaining({
        observationCount: expect.any(Number),
        windowObservationCount: expect.any(Number),
        sourceUrl: 'https://example.com/prices',
      }),
      requirements: expect.objectContaining({
        minimumObservations: expect.any(Number),
        sameSourceWindow: true,
        met: true,
        reasons: expect.any(Array),
      }),
      limitations: expect.any(Array),
    }));
  }
});

test('methods fail closed when the latest provider segment is too short', () => {
  const sourceRows = observations(Array.from({ length: 25 }, (_, index) => 100 + index));
  sourceRows.slice(-5).forEach(row => { row.provenance.originUrl = 'https://example.com/new-provider'; });
  const normalized = normalizePriceObservations(sourceRows, 'NBIS');
  const results = evaluateSignalMethods(normalized);
  for (const result of Object.values(results)) {
    expect(result.state).toBe('unavailable');
    expect(result.requirements.met).toBe(false);
    expect(result.evidence.sourceUrl).toBe('https://example.com/new-provider');
  }
});

test('snapshot evaluation respects the point-in-time cutoff', () => {
  const snapshot = {
    generatedAt: observedAt(19),
    observations: observations(Array.from({ length: 21 }, (_, index) => 100 + index)),
  };
  const result = evaluateSnapshotSignalMethod(SIGNAL_METHOD_IDS.VOLATILITY_BOLLINGER, snapshot, 'NBIS');
  expect(result.observedAt).toBe(observedAt(19));
  expect(result.value.close).toBe(119);
});

test('unknown signal methods are rejected explicitly', () => {
  expect(() => evaluateSignalMethod('unknown-method', [])).toThrow('Unknown signal method');
});
