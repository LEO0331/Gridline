import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResearchExperience from './ResearchExperience';
import App from './Containers/App';

jest.mock('./Components/AccountGate', () => () => null);
jest.mock('./ExposurePeriodMonitor', () => () => null);
jest.mock('./data/researchCatalysts.json', () => [{
  id: 'fixture-company-navigation', category: 'earnings', title: 'Fixture AVGO call', titleZh: '測試 AVGO 財報電話會議',
  precision: 'timestamp', start: '2026-11-12T17:00:00-05:00', timeZone: 'America/New_York',
  sourceUrl: 'https://investors.broadcom.com/test-fixture', publisher: 'Fixture', reviewedAt: '2026-11-10',
  status: 'scheduled', tickers: ['AVGO'], themeIds: ['hardware'],
}]);

const snapshot = {
  generatedAt: '2026-11-10T01:00:00Z',
  observations: [{ id: 'fixture-price', source: 'prices', type: 'close', ticker: 'AVGO', value: 100, observedAt: '2026-11-09' }],
};

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  window.localStorage.clear();
  window.history.pushState({}, '', '#overview');
});

afterEach(() => {
  jest.useRealTimers();
  window.localStorage.clear();
});

test('direct calendar load works while the snapshot is unavailable and preserves the language across routes', async () => {
  window.localStorage.setItem('gridline-language', 'zh-TW');
  window.history.pushState({}, '', '#calendar');
  const fetchMock = jest.spyOn(window, 'fetch').mockResolvedValue({ ok: false });
  try {
    await act(async () => { render(<ResearchExperience />); });
    const title = screen.getByRole('heading', { name: '研究催化事件日曆' });
    expect(title).toHaveFocus();
    expect(screen.getByRole('button', { name: '研究日曆' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('測試 AVGO 財報電話會議')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '跳至儀表板內容' }));
    expect(window.location.hash).toBe('#calendar');
    expect(document.getElementById('dashboard-content')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '總覽' }));
    expect(screen.getByRole('region', { name: '近期研究催化事件' })).toBeVisible();
    expect(screen.getByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '切換語言' }));
    fireEvent.click(screen.getByRole('button', { name: 'Research Calendar' }));
    expect(screen.getByRole('heading', { name: 'Research Catalyst Calendar' })).toBeVisible();
  } finally {
    fetchMock.mockRestore();
  }
});

test('company research action applies the ticker and focuses its evidence when the snapshot is ready', () => {
  render(<App snapshot={snapshot} />);
  const preview = within(screen.getByRole('region', { name: 'Upcoming Research Catalysts' }));
  expect(preview.getByText('Fixture AVGO call')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Research Calendar' }));
  fireEvent.click(screen.getByText('Fixture AVGO call').closest('summary'));
  fireEvent.click(screen.getByRole('button', { name: 'View AVGO company research' }));
  expect(window.location.hash).toBe('#overview?ticker=AVGO');
  expect(document.getElementById('overview-company-research')).toHaveFocus();
  screen.getAllByRole('combobox', { name: 'Company' }).forEach(select => expect(select).toHaveValue('AVGO'));
  fireEvent.click(screen.getByRole('button', { name: 'Research Calendar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
  screen.getAllByRole('combobox', { name: 'Company' }).forEach(select => expect(select).toHaveValue('AVGO'));
});

test('a linked company waits for loaded evidence and reports disabled coverage', () => {
  window.history.pushState({}, '', '#overview?ticker=AVGO');
  const { rerender } = render(<App snapshotState="loading" />);
  expect(screen.queryByRole('region', { name: 'Company research' })).not.toBeInTheDocument();
  rerender(<App snapshot={snapshot} />);
  expect(document.getElementById('overview-company-research')).toHaveFocus();
  rerender(<App snapshot={{ ...snapshot, trackedTickers: ['NBIS'] }} />);
  expect(screen.getByText('AVGO research is unavailable in this snapshot.')).toBeVisible();
});
