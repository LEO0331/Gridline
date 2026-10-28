import { evaluateSignalMethod, SIGNAL_METHOD_IDS } from './registry';
import { momentumBreakoutTimeline } from './momentumBreakoutCore';
import { signalStateLabel, signalEventLabel, signalMethodSettings } from './presentation';
import { buildChartSignalMarkers } from '../components/chartSignalMarkers';

const rows = values => values.map((value, i) => ({ id: `p${i}`, value, observedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), sourceUrl: 'https://example.com/prices', provider: 'Fixture' }));
const evaluate = values => evaluateSignalMethod(SIGNAL_METHOD_IDS.MOMENTUM_BREAKOUT, rows(values));

test('detects breakout, pullback, reconfirmation and invalidation with dated evidence', () => {
  const result = evaluate([...Array(20).fill(100), 110, 105, 111, 94]);
  expect(result.state).toBe('invalidated');
  expect(result.events.map(event => event.state)).toEqual(['breakout', 'pullback', 'reconfirmed', 'invalidated']);
  expect(result.events[0].value).toMatchObject({ referencePrice: 100, breakoutClose: 110 });
  expect(result.events[0].observationIds).toHaveLength(21);
  expect(result.events[3].value.reason).toBe('below-invalidation');
  expect(result.evidence.provider).toBe('Fixture');
});

test('requires a prior 20-session window and expires an unchanged setup after 20 sessions', () => {
  expect(evaluate(Array(20).fill(100)).state).toBe('unavailable');
  expect(evaluate(Array(21).fill(100)).state).toBe('watch');
  const result = evaluate([...Array(20).fill(100), 110, ...Array(20).fill(110)]);
  expect(result.state).toBe('invalidated');
  expect(result.value.reason).toBe('expired');
});

test('historical states are stable as future observations are appended', () => {
  const history = rows([...Array(20).fill(100), 110, 105, 111]);
  const before = momentumBreakoutTimeline(history);
  const after = momentumBreakoutTimeline([...history, ...rows([94]).map(row => ({ ...row, observedAt: '2026-02-01T00:00:00.000Z' }))]);
  expect(after.slice(0, before.length)).toEqual(before);
});

test('provider changes fail closed and presentation is bilingual', () => {
  const input = rows([...Array(20).fill(100), 110]);
  input[20].sourceUrl = 'https://example.com/other';
  expect(evaluateSignalMethod(SIGNAL_METHOD_IDS.MOMENTUM_BREAKOUT, input).state).toBe('unavailable');
  expect(signalStateLabel(SIGNAL_METHOD_IDS.MOMENTUM_BREAKOUT, 'reconfirmed', 'zh-TW')).toBe('突破再確認');
  expect(signalEventLabel(SIGNAL_METHOD_IDS.MOMENTUM_BREAKOUT, 'breakout', 'en')).toMatch(/20-session/);
  expect(signalMethodSettings(SIGNAL_METHOD_IDS.MOMENTUM_BREAKOUT, 'zh-TW')).toContain('20');
});

test('dated breakout events appear on the existing chart marker model', () => {
  const input = rows([...Array(20).fill(100), 110, 105]);
  const observations = input.map(row => ({ ...row, source: 'prices', type: 'close', ticker: 'NBIS' }));
  const chartPoints = input.map((row, index) => ({ date: row.observedAt.slice(0, 10), value: row.value, index }));
  const result = buildChartSignalMarkers({ snapshot: { generatedAt: input.at(-1).observedAt, observations }, ticker: 'NBIS', methodId: SIGNAL_METHOD_IDS.MOMENTUM_BREAKOUT, chartPoints });
  expect(result.markers.map(marker => marker.state)).toEqual(['breakout', 'pullback']);
});
