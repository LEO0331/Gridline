import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

jest.mock('../Components/AccountGate', () => ({ onPreferences }) => (
  <button type="button" onClick={() => onPreferences({ language: 'en' })}>Apply account language</button>
));

const snapshot = {
  generatedAt: '2026-09-23T00:00:00Z',
  sourceHealth: { prices: { status: 'ok' } },
  observations: Array.from({ length: 10 }, (_, index) => ({
    id: `p${index}`, source: 'prices', type: 'close', ticker: 'NBIS', value: 100 + index,
    observedAt: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    provenance: { provider: 'Fixture', originUrl: 'https://example.com/prices' },
  })),
};

const dateAt = index => new Date(Date.UTC(2026, 7, 25 + index)).toISOString();
const richSnapshot = {
  generatedAt: dateAt(89),
  sourceHealth: { prices: { status: 'ok' } },
  observations: Array.from({ length: 90 }, (_, index) => ({
    id: `r${index}`, source: 'prices', type: 'close', ticker: 'NBIS', value: 100 + index,
    observedAt: dateAt(index),
    provenance: { provider: 'Fixture', originUrl: 'https://example.com/prices' },
  })),
};

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '#overview');
});

test('dashboard exposes skip navigation, active route state, and retryable snapshot errors', () => {
  const retry = jest.fn();
  render(<App
    snapshot={{}}
    snapshotState="error"
    onRetrySnapshot={retry}
  />);

  expect(screen.getByRole('link', { name: 'Skip to dashboard content' })).toHaveAttribute('href', '#dashboard-content');
  expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('alert')).toHaveTextContent('Dashboard snapshot could not be loaded');

  fireEvent.click(screen.getByRole('button', { name: 'Retry snapshot' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test('tracked company cards expose selection state to assistive technology', () => {
  render(<App snapshot={richSnapshot} />);

  expect(screen.getByRole('button', { name: /Select NBIS/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /Select ORCL/ }));
  expect(screen.getByRole('button', { name: /Select ORCL/ })).toHaveAttribute('aria-pressed', 'true');
});

test('overview switches research lenses without presenting unsourced earnings values', () => {
  render(<App snapshot={snapshot} />);
  expect(screen.getByRole('heading', { level: 2, name: 'Short-term price trend: upward' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Company financials' }));
  expect(screen.getAllByText('Company execution evidence unavailable').length).toBeGreaterThan(0);
  expect(screen.queryByText('86%')).not.toBeInTheDocument();
});

test('technical method selection updates the selected market-signal lens', () => {
  render(<App snapshot={richSnapshot} />);
  expect(screen.getByRole('button', { name: 'Market signals' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Short-term price trend: upward' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: /Relative Strength Index/ }));

  expect(screen.getByRole('heading', { level: 2, name: 'RSI above upper reference range' })).toBeInTheDocument();
  expect(screen.getByText('RSI 100.0')).toBeInTheDocument();
  expect(screen.getByText('Momentum · Relative Strength Index')).toBeInTheDocument();
  expect(screen.getByText('No state changes for the selected method in this range.')).toBeInTheDocument();
});

test('overview renders the previous-snapshot change summary', () => {
  const snapshotWithChanges = {
    ...richSnapshot,
    snapshotChanges: {
      available: true,
      from: '2026-11-21T22:00:00.000Z',
      to: richSnapshot.generatedAt,
      summary: { total: 1, price: 1, signal: 0, event: 0, sourceHealth: 0 },
      changes: [{
        id: 'price-nbis',
        type: 'price',
        ticker: 'NBIS',
        before: 188,
        after: 189,
        observedAt: richSnapshot.generatedAt,
        provider: 'Fixture',
        sourceUrl: 'https://example.com/prices',
      }],
    },
  };

  render(<App snapshot={snapshotWithChanges} />);

  expect(screen.getByRole('heading', { level: 3, name: 'Changes since previous snapshot' })).toBeInTheDocument();
  expect(screen.getByText('$188.00 → $189.00')).toBeInTheDocument();
});

test('saved local language is not overwritten when account preferences reload after navigation', () => {
  window.localStorage.setItem('gridline-language', 'zh-TW');
  const onLanguageChange = jest.fn();
  render(<App snapshot={snapshot} language="zh-TW" onLanguageChange={onLanguageChange} />);

  fireEvent.click(screen.getByRole('button', { name: 'Apply account language' }));

  expect(onLanguageChange).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '總覽' })).toBeInTheDocument();
});

test('account language can initialize a browser with no local language preference', () => {
  const onLanguageChange = jest.fn();
  render(<App snapshot={snapshot} language="zh-TW" onLanguageChange={onLanguageChange} />);

  fireEvent.click(screen.getByRole('button', { name: 'Apply account language' }));

  expect(onLanguageChange).toHaveBeenCalledWith('en');
});

test('Chinese milestone shows a translated headline, translated region and original title', () => {
  const title = 'Loudoun Board Opposes Valley North Transmission Line, Denies Substation Near Dulles Airport';
  const url = 'https://www.loudoun.gov/m/newsflash/Home/Detail/10876';
  const withEvent = { ...snapshot, observations: [...snapshot.observations, {
    id: 'loudoun-event', source: 'events', type: 'infrastructureEvent', retrievedAt: '2026-09-20T00:00:00Z',
    value: { title, url, category: 'PERMIT', region: 'Northern Virginia', source: 'Loudoun', publishedAt: new Date(Date.now() - 86400000).toISOString() },
  }] };
  render(<App snapshot={withEvent} language="zh-TW" />);

  fireEvent.click(screen.getByRole('button', { name: '專案里程碑' }));
  expect(screen.getByRole('heading', { level: 2, name: '勞登郡董事會反對 Valley North 輸電線，否決杜勒斯機場附近的變電站申請' })).toBeInTheDocument();
  expect(screen.getByText(/北維吉尼亞 的許可原始紀錄/)).toBeInTheDocument();
  expect(screen.getByText(`原始標題：${title}`)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '事件' }));
  expect(screen.getByText('最近驗證：2026-09-20')).toBeInTheDocument();
});

test('Events page exposes configured source scope and excluded candidates', () => {
  window.history.pushState({}, '', '#events');
  const withCoverage = { ...snapshot, sourceHealth: { ...snapshot.sourceHealth, events: {
    status: 'ok', checkedAt: '2026-09-29T01:00:00Z', recordCount: 1,
    coverage: { scope: 'pjm-feed-and-curated-candidates', feedStatus: 'checked', candidateCount: 2, acceptedCount: 1, excludedCount: 1, excluded: [{ title: 'Candidate title', reason: 'record title mismatch' }] },
  } } };
  render(<App snapshot={withCoverage} language="zh-TW" />);
  expect(screen.getByText(/候選 2 筆 · 通過 1 筆 · 排除 1 筆/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('查看排除的候選紀錄（1）'));
  expect(screen.getByRole('listitem')).toHaveTextContent('Candidate title · 頁面標題不相符');
});

test('Events page reports official discovery coverage without claiming every feed succeeded', () => {
  window.history.pushState({}, '', '#events');
  const withCoverage = { ...snapshot, sourceHealth: { events: { status: 'partial', coverage: {
    scope: 'official-discovery-and-curated-candidates', feedStatus: 'partial', candidateCount: 1, acceptedCount: 1, excludedCount: 0,
    sources: { Oracle: { discoveryStatus: 'partial', verificationStatus: 'ok', candidateCount: 1, acceptedCount: 1, excludedCount: 0 } },
  } } } };
  render(<App snapshot={withCoverage} />);
  expect(screen.getByRole('article', { name: 'Oracle' })).toHaveTextContent('DiscoveryPartial');
  expect(screen.getByText('Partial source coverage')).toBeInTheDocument();
  expect(screen.queryByText(/PJM feed and curated candidates checked/)).not.toBeInTheDocument();
});

test('overview keeps partial coverage visible without showing provider errors', () => {
  window.history.pushState({}, '', '#overview');
  const withGap = { ...snapshot, freshness: 'partial', sourceHealth: { events: {
    status: 'partial', coverage: { sources: { Oracle: { discoveryStatus: 'unavailable', discoveryErrors: [{ message: '403 Forbidden' }] } } },
  } } };
  render(<App snapshot={withGap} />);
  expect(screen.getByText(/Partial source coverage/)).toBeVisible();
  expect(screen.queryByText(/403 Forbidden/)).not.toBeInTheDocument();
});
