import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import EventSourceCoverage from './EventSourceCoverage';

const coverage = { sources: {
  PJM: { discoveryStatus: 'checked', verificationStatus: 'ok', candidateCount: 2, acceptedCount: 2, excludedCount: 0, checkedAt: '2026-10-05T01:00:00Z', lastSuccessAt: '2026-10-05T01:00:00Z', endpoint: 'https://insidelines.pjm.com/feed/', discoveryErrors: [] },
  Loudoun: { discoveryStatus: 'unavailable', verificationStatus: 'partial', candidateCount: 2, acceptedCount: 1, excludedCount: 1, checkedAt: '2026-10-05T01:00:00Z', lastSuccessAt: '2026-10-04T01:00:00Z', discoveryErrors: [{ url: 'https://www.loudoun.gov/Rss.aspx', message: 'Request timed out' }] },
  ERCOT: { discoveryStatus: 'checked', verificationStatus: 'degraded', candidateCount: 1, acceptedCount: 0, excludedCount: 1, truncated: true },
  Oracle: { discoveryStatus: 'partial', verificationStatus: 'ok', candidateCount: 1, acceptedCount: 1, excludedCount: 0, endpoint: 'data:text/plain,invalid', discoveryErrors: [{ url: 'data:text/plain,invalid', message: 'Invalid endpoint' }] },
} };

test('shows discovery separately from article verification and preserves prior successful dates', () => {
  render(<EventSourceCoverage coverage={coverage} />);
  const loudoun = within(screen.getByRole('article', { name: 'Loudoun' }));
  expect(loudoun.getByText('Unavailable')).toBeInTheDocument();
  expect(loudoun.getByText('Partial')).toBeInTheDocument();
  expect(loudoun.getByText('2 / 1 / 1')).toBeInTheDocument();
  expect(loudoun.getByText('2026-10-04 01:00 UTC')).toBeInTheDocument();
  expect(loudoun.getByText('Request timed out')).toBeInTheDocument();
  expect(loudoun.getByRole('link', { name: /Attempted source ↗/ })).toHaveAttribute('href', 'https://www.loudoun.gov/Rss.aspx');
  expect(screen.getByText(/Candidate limit reached/)).toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'Oracle' })).getByText('Partial')).toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'Oracle' })).queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText(/does not cover every announcement/)).toBeInTheDocument();
});

test('renders Traditional Chinese health labels and discovery limitations', () => {
  render(<EventSourceCoverage coverage={coverage} language="zh-TW" />);
  const loudoun = within(screen.getByRole('article', { name: 'Loudoun' }));
  expect(loudoun.getByText('新事件探索')).toBeInTheDocument();
  expect(loudoun.getByText('文章驗證')).toBeInTheDocument();
  expect(loudoun.getByText('無法取得')).toBeInTheDocument();
  expect(loudoun.getByText('部分通過')).toBeInTheDocument();
  expect(loudoun.getByText('最近成功來源檢查')).toBeInTheDocument();
  expect(screen.getByText('已達候選筆數上限；可能仍有其他公告。')).toBeInTheDocument();
});

test('older snapshots without source coverage remain supported', () => {
  const { container } = render(<EventSourceCoverage coverage={{ feedStatus: 'checked' }} />);
  expect(container).toBeEmptyDOMElement();
});
