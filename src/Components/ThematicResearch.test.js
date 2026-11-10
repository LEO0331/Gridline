import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ThematicResearch from './ThematicResearch';

const now = new Date('2026-11-10T12:00:00Z');
const sourceUrl = 'https://www.sec.gov/Archives/edgar/data/1/report.htm';
const snapshot = {
  generatedAt: '2026-11-09T22:00:00Z',
  observations: [{
    source: 'sec', type: 'revenue', ticker: 'NBIS', value: 0, unit: 'USD',
    periodStart: '2025-01-01', periodEnd: '2025-12-31', periodKind: 'annual',
    filedAt: '2026-04-30', sourceUrl, classification: 'reported-zero',
  }, {
    source: 'prices', type: 'close', ticker: 'NBIS', value: 25, observedAt: '2026-11-09',
    providerName: 'Fixture market provider', sourceUrl: 'https://example.com/nbis',
  }],
};

function Workspace(props) {
  const [selection, setSelection] = useState({ themeId: 'neocloud' });
  return <ThematicResearch {...{ snapshot, now, selection }} onSelectionChange={setSelection} {...props} />;
}

test('supports the theme limits and changing which companies are compared', () => {
  render(<Workspace />);
  expect(screen.getByRole('combobox', { name: 'Research theme' })).toHaveValue('neocloud');
  expect(screen.getByRole('checkbox', { name: /NBIS/ })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /CRWV/ })).toBeChecked();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'power' } });
  expect(screen.getByRole('status')).toHaveTextContent('4 selected · 6 enabled theme members');
  expect(screen.getByRole('checkbox', { name: /CEG/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /VRT/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /CEG/ }));
  expect(screen.getByRole('checkbox', { name: /VRT/ })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /CEG/ })).toBeChecked();
});

test('shows sourced native financial facts and explicit unavailable comparisons in Traditional Chinese', () => {
  render(<Workspace language="zh-TW" />);
  expect(screen.getByRole('heading', { level: 1, name: '主題研究' })).toBeVisible();
  const market = screen.getByRole('region', { name: '市場比較' });
  expect(within(market).getByText(/Fixture market provider/)).toHaveTextContent('2026-11-09');
  const table = within(market).getByRole('table', { name: 'NBIS 基準比較' });
  expect(within(table).getByRole('rowheader', { name: 'SPY 60D' })).toBeInTheDocument();
  const revenue = screen.getByRole('region', { name: '營收' });
  expect(within(revenue).getByText('USD').parentElement).toHaveTextContent('0 USD');
  expect(within(revenue).getByText('無法提供比較')).toBeVisible();
  fireEvent.click(within(revenue).getByText('NBIS 營收證據'));
  expect(within(revenue).getByText('明確申報為零')).toBeVisible();
  expect(within(revenue).getByRole('link', { name: 'NBIS SEC 申報文件 ↗' })).toHaveAttribute('href', sourceUrl);
});

test('keeps the scoped calendar link available while the snapshot fails', () => {
  render(<Workspace snapshotState="error" />);
  expect(screen.queryByRole('heading', { name: 'Market comparison' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Research Calendar →' })).toHaveAttribute('href', '#calendar?theme=neocloud');
});
