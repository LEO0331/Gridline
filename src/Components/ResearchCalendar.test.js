import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResearchCalendar, { UpcomingCatalysts } from './ResearchCalendar';
import { validateCatalysts } from '../researchCalendarModel';

const now = new Date('2026-11-10T12:00:00Z');
const base = {
  publisher: 'Test official publisher', reviewedAt: '2026-11-10',
  timeZone: 'America/New_York', status: 'scheduled',
};
const data = validateCatalysts([
  { ...base, id: 'fixture-earnings', category: 'earnings', title: 'Fixture earnings call', titleZh: '測試財報電話會議',
    precision: 'timestamp', start: '2026-11-10T17:00:00-05:00', tickers: ['NBIS'], themeIds: ['neocloud'],
    sourceUrl: 'https://nebius.com/test-fixture' },
  { ...base, id: 'fixture-macro', category: 'macro', title: 'Fixture macro meeting', titleZh: '測試總經會議',
    precision: 'date', start: '2026-11-12', end: '2026-11-13', status: 'tentative',
    sourceUrl: 'https://www.federalreserve.gov/test-fixture' },
]);

test('switches week, month and agenda while preserving the selected date and filters', () => {
  render(<ResearchCalendar now={now} data={data} />);
  expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Nov 9, 2026 – Nov 15, 2026 · 2 events');
  expect(screen.getAllByText('Fixture macro meeting')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'macro' } });
  fireEvent.click(screen.getByRole('button', { name: 'Month' }));
  expect(screen.getByRole('button', { name: /November 10, 2026/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /November 12, 2026/ }));
  expect(screen.getByRole('heading', { name: /Thursday, November 12, 2026/ })).toHaveTextContent('1 event');
  fireEvent.click(screen.getByRole('button', { name: 'Agenda' }));
  expect(screen.getByRole('link', { name: /Fixture macro meeting · Official schedule/ })).toHaveAttribute('href', 'https://www.federalreserve.gov/test-fixture');
  fireEvent.click(screen.getByRole('button', { name: 'Month' }));
  expect(screen.getByRole('button', { name: /November 12, 2026/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Category')).toHaveValue('macro');
  fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
  expect(screen.getByRole('status')).toHaveTextContent('December 2026 · 0 events');
  fireEvent.click(screen.getByRole('button', { name: '← Previous' }));
  expect(screen.getByRole('status')).toHaveTextContent('November 2026 · 1 event');
  fireEvent.click(screen.getByRole('button', { name: 'Today' }));
  expect(screen.getByRole('button', { name: /November 10, 2026/ })).toHaveAttribute('aria-current', 'date');
});

test('combines company and theme filters, resets the empty result and opens company research', () => {
  const onCompanyResearch = jest.fn();
  render(<ResearchCalendar now={now} data={data} onCompanyResearch={onCompanyResearch} />);
  fireEvent.change(screen.getByLabelText('Research theme'), { target: { value: 'neocloud' } });
  fireEvent.change(screen.getByLabelText('Tracked company'), { target: { value: 'NBIS' } });
  expect(screen.getByRole('status')).toHaveTextContent('1 event');
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'macro' } });
  expect(screen.getByRole('status')).toHaveTextContent('0 events');
  expect(screen.getByText('No reviewed schedules match this period and filters.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
  expect(screen.getByRole('status')).toHaveTextContent('2 events');
  const summary = screen.getByText('Fixture earnings call').closest('summary');
  fireEvent.click(summary);
  const details = within(summary.parentElement);
  expect(details.getByText(/Source timezone/)).toHaveTextContent('2026-11-10');
  fireEvent.click(details.getByRole('button', { name: 'View NBIS company research' }));
  expect(onCompanyResearch).toHaveBeenCalledWith('NBIS');
});

test('localizes the time selector and keeps date-only records stable across timezones', () => {
  render(<ResearchCalendar now={now} data={data} language="zh-TW" />);
  const dateOnly = screen.getByText(/時間未公布/).textContent;
  expect(screen.getByText(/17:00/)).toHaveTextContent(/11.*10.*17:00/);
  fireEvent.change(screen.getByLabelText('顯示時區'), { target: { value: 'Asia/Taipei' } });
  expect(screen.getByText(/06:00/)).toHaveTextContent(/11.*11.*06:00/);
  expect(screen.getByText(/時間未公布/)).toHaveTextContent(dateOnly);
  expect(screen.getByText(/暫定/)).toBeVisible();
});

test('reports stale review and an empty seven-day Overview preview honestly', () => {
  render(<UpcomingCatalysts now={new Date('2099-06-01T12:00:00Z')} language="zh-TW" />);
  expect(screen.getByText('目前日曆涵蓋範圍內沒有已驗證的近期事件。')).toBeVisible();
  expect(screen.getByText(/來源審閱已超過 30 天/)).toBeVisible();
  expect(screen.getByRole('link', { name: '開啟研究日曆 →' })).toHaveAttribute('href', '#calendar');
});

test('shows canceled schedules, retained rescheduling evidence, and separate automated provenance in Traditional Chinese', () => {
  const official = 'https://www.bls.gov/schedule/news_release/bls.ics';
  const fixture = validateCatalysts([{
    ...base, id: 'bls-cpi-2026-10', category: 'macro', title: 'Fixture original title',
    publisher: 'U.S. Bureau of Labor Statistics', originalLanguage: true, precision: 'date',
    start: '2026-11-13', previousStart: '2026-11-12', status: 'canceled',
    sourceUrl: official, verificationSourceUrl: official,
    verificationMethod: 'bls-ics', verifiedAt: '2026-11-10T10:00:00Z',
  }]);
  expect(fixture.rejected).toEqual([]);
  render(<ResearchCalendar now={now} data={fixture} language="zh-TW" />);
  const summary = screen.getByText('Fixture original title').closest('summary');
  expect(summary).toHaveTextContent('已取消 · 原文標題');
  fireEvent.click(summary);
  const details = within(summary.parentElement);
  expect(details.getByText(/人工來源審閱/)).toHaveTextContent('2026-11-10');
  expect(details.getByText(/自動驗證/)).toHaveTextContent('2026-11-10T10:00:00Z');
  expect(details.getByText(/原排定開始時間/)).toHaveTextContent('2026-11-12');
  expect(details.getByRole('link', { name: '官方驗證證據 ↗' })).toHaveAttribute('href', official);
});
