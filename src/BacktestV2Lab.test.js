import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import BacktestV2Lab from './BacktestV2Lab';

test('v2 assumptions and unavailable results are explained in both languages', () => {
  const { rerender } = render(<BacktestV2Lab ticker="NBIS" observations={[]} language="en"/>);
  expect(screen.getByText('SIMULATION ASSUMPTIONS')).toBeInTheDocument();
  expect(screen.getAllByText(/Insufficient history/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'momentum-breakout' } });
  expect(screen.getByLabelText('Method')).toHaveValue('momentum-breakout');
  rerender(<BacktestV2Lab ticker="NBIS" observations={[]} language="zh-TW"/>);
  expect(screen.getByText('模擬假設')).toBeInTheDocument();
  expect(screen.getAllByText(/歷史資料不足/).length).toBeGreaterThan(0);
});

test.each([['en', /Low sample: 1 completed trades/, /Benchmark unavailable/], ['zh-TW', /樣本偏少：1 筆已完成交易/, /基準無法提供/]])('makes small real trade counts and missing benchmarks visible in %s', (language, caution, benchmark) => {
  const observations = Array.from({ length: 23 }, (_, i) => ({
    id: `NBIS-${i}`, source: 'prices', type: 'close', ticker: 'NBIS',
    value: i < 10 ? 100 : i === 10 ? 110 : 100 + i - 11,
    observedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    sourceUrl: 'https://example.com/NBIS', providerName: 'Fixture',
  }));
  render(<BacktestV2Lab ticker="NBIS" observations={observations} asOf="2026-02-01T00:00:00Z" language={language}/>);
  expect(screen.getByRole('status')).toHaveTextContent(caution);
  expect(screen.getByText(benchmark)).toBeInTheDocument();
});
