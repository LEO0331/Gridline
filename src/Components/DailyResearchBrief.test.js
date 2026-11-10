import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DailyResearchBrief from './DailyResearchBrief';

const now = '2026-10-20T22:00:00Z';

test('labels absent evidence and preserves native Data Health navigation', () => {
  render(<DailyResearchBrief snapshot={{}} ticker="NBIS" tickers={['NBIS']} now={now} />);
  expect(screen.getByRole('heading', { level: 2, name: 'After-Market Research Brief' })).toBeInTheDocument();
  expect(screen.getByText('Previous snapshot comparison unavailable.')).toBeInTheDocument();
  expect(screen.getByText('Insufficient evidence for a research question.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Data Health →' })).toHaveAttribute('href', '#health');
  expect(screen.queryByRole('button', { name: 'View market context' })).not.toBeInTheDocument();
});

test('renders localized observation-only updates and opens the existing selected-company evidence', () => {
  const onTickerChange = jest.fn();
  const snapshot = {
    generatedAt: now,
    observations: [{ source: 'prices', type: 'close', ticker: 'SPY', value: 100, observedAt: '2026-10-20', sourceUrl: 'https://example.com/SPY' }],
    snapshotChanges: {
      available: true, from: '2026-10-20T21:00:00Z', to: now,
      changes: [{ type: 'price', ticker: 'ORCL', before: 100, after: 100, observedAt: '2026-10-20' }],
    },
  };
  render(<>
    <DailyResearchBrief snapshot={snapshot} ticker="MISSING" tickers={['NBIS']} now={now} language="zh-TW" onTickerChange={onTickerChange} />
    <div id="overview-company-research" tabIndex={-1}>公司證據</div>
  </>);
  expect(screen.getByRole('heading', { level: 2, name: '盤後研究簡報' })).toBeInTheDocument();
  expect(screen.getByText(/觀察資料已更新，收盤價維持 \$100.00/)).toBeInTheDocument();
  expect(screen.getByText('2026-10-20 21:00')).toHaveAttribute('datetime', '2026-10-20T21:00:00Z');
  expect(screen.getByText('2026-10-20 22:00')).toHaveAttribute('datetime', now);
  expect(screen.getByText(/最新觀察到的美股交易日/)).toHaveTextContent('2026-10-20');
  expect(screen.getByRole('link', { name: 'SPY 來源 ↗' })).toHaveAttribute('href', 'https://example.com/SPY');
  fireEvent.click(screen.getByRole('button', { name: '查看 NBIS 研究' }));
  expect(onTickerChange).toHaveBeenCalledWith('NBIS');
  expect(screen.getByText('公司證據')).toHaveFocus();
});
