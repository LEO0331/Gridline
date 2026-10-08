import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DataHealth from './DataHealth';

const DAY_MS = 24 * 60 * 60 * 1000;
const priceRows = ticker => Array.from({ length: 70 }, (_, index) => ({
  source: 'prices',
  type: 'close',
  ticker,
  value: 100 + index,
  observedAt: new Date(Date.now() - (69 - index) * DAY_MS).toISOString(),
  provenance: { provider: 'Fixture provider', originUrl: 'https://example.com/prices' },
}));

const fixture = {
  trackedTickers: ['NBIS', 'CRWV', 'ORCL', 'AVGO'],
  schemaVersion: 4,
  generatedAt: new Date().toISOString(),
  freshness: 'partial',
  observations: ['NBIS','CRWV','ORCL','AVGO'].flatMap(priceRows),
  companyHistory: [],
  methodologies: { companyScore: 'gridline-price-signal-v2.0.0' },
  backtestCoverage: { start: null, end: null, recorded: 0, reconstructed: 0, reconstructionQuality: 'recorded-only' },
  sourceHealth: {
    prices: { status: 'ok', recordCount: 280, lastSuccessAt: new Date().toISOString() },
    pjm: { status: 'degraded', message: 'PJM_API_KEY is not configured.' },
  },
  outcomes: [],
};

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(fixture) }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('data health shows explicit loading state before snapshot readiness is calculated', () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  render(<DataHealth language="en" onBack={() => {}} />);

  expect(screen.getByRole('status')).toHaveTextContent('Loading snapshot…');
  expect(screen.queryByText('PRICE DATA AVAILABLE')).not.toBeInTheDocument();
});

test('data health exposes load errors as alerts while keeping refresh available', async () => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
  render(<DataHealth language="en" onBack={() => {}} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Snapshot could not be loaded.');
  expect(screen.getByRole('button', { name: 'Refresh status' })).toBeEnabled();
});

test('data health renders demo readiness and source/price coverage in English', async () => {
  render(<DataHealth language="en" onBack={() => {}} />);
  expect(await screen.findByText('PRICE DATA AVAILABLE')).toBeInTheDocument();
  expect(screen.getByText('MARKET PRICE COVERAGE')).toBeInTheDocument();
  expect(screen.getByText('Retained event records')).toBeInTheDocument();
  expect(screen.getAllByText('Fixture provider')).toHaveLength(4);
  expect(screen.queryByText('PJM')).not.toBeInTheDocument();
  expect(screen.queryByText('FERC')).not.toBeInTheDocument();
  expect(screen.queryByText('Company IR')).not.toBeInTheDocument();
});

test('data health renders Traditional Chinese labels', async () => {
  render(<DataHealth language="zh-TW" onBack={() => {}} />);
  expect(await screen.findByText('價格資料可用')).toBeInTheDocument();
  expect(screen.getByText('市場價格涵蓋')).toBeInTheDocument();
  expect(screen.getByText('保留的事件紀錄')).toBeInTheDocument();
  expect(screen.getByText('市場價格')).toBeInTheDocument();
  expect(screen.queryByText('公司投資人關係')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
});

test('missing runtime metadata is identified without blaming price coverage', async () => {
  const incomplete = { ...fixture, backtestCoverage: undefined, methodologies: undefined };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(incomplete) }));
  render(<DataHealth language="en" onBack={() => {}} />);
  expect(await screen.findByText('SNAPSHOT METADATA INCOMPLETE')).toBeInTheDocument();
  expect(screen.getByText('Price coverage')).toBeInTheDocument();
});

test('retained event count treats source revisions as one record', async () => {
  const url = 'https://www.loudoun.gov/m/newsflash/home/detail/10874';
  const observations = [
    { id: 'old-event', source: 'events', type: 'infrastructureEvent', retrievedAt: '2026-09-24T00:00:00Z', value: { title: 'Earlier headline', url, category: 'PERMIT', publishedAt: new Date(Date.now() - DAY_MS).toISOString() } },
    { id: 'new-event', source: 'events', type: 'infrastructureEvent', retrievedAt: '2026-09-29T00:00:00Z', value: { title: 'Revised headline', url, category: 'PERMIT', publishedAt: new Date(Date.now() - DAY_MS).toISOString() } },
  ];
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ...fixture, observations: [...fixture.observations, ...observations] }) }));
  render(<DataHealth language="en" onBack={() => {}} />);
  const retainedRecords = await screen.findByRole('group', { name: 'Retained event records' });
  expect(within(retainedRecords).getByText('1')).toBeInTheDocument();
});

test('data health exposes provider discovery gaps separately from accepted articles', async () => {
  const withSources = { ...fixture, sourceHealth: { ...fixture.sourceHealth, events: {
    status: 'partial', coverage: { feedStatus: 'partial', acceptedCount: 1, excludedCount: 0, sources: {
      Oracle: { discoveryStatus: 'partial', verificationStatus: 'ok', candidateCount: 1, acceptedCount: 1, excludedCount: 0, discoveryErrors: [{ message: 'Investor listing unavailable' }] },
    } },
  } } };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(withSources) }));
  render(<DataHealth language="en" onBack={() => {}} />);
  expect(await screen.findByRole('article', { name: 'Oracle' })).toHaveTextContent('Article verificationAccepted');
  expect(screen.getByText(/some discovery sources unavailable/)).toBeInTheDocument();
  expect(screen.getByText('Investor listing unavailable')).toBeInTheDocument();
});

test('data health keeps an unavailable provider warning readable and technical errors collapsed', async () => {
  const withGap = { ...fixture, sourceHealth: { ...fixture.sourceHealth, events: {
    status: 'partial', coverage: { feedStatus: 'partial', acceptedCount: 0, excludedCount: 0, sources: {
      Oracle: { discoveryStatus: 'unavailable', verificationStatus: 'degraded', discoveryErrors: [{ message: '403 Forbidden' }] },
    } },
  } } };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(withGap) }));
  render(<DataHealth language="en" onBack={() => {}} />);
  expect(await screen.findByText('Oracle news temporarily unavailable.')).toBeVisible();
  expect(screen.getByText('PRICE DATA AVAILABLE · SOURCE GAPS')).toBeVisible();
  expect(screen.getByText('403 Forbidden')).not.toBeVisible();
  fireEvent.click(screen.getByText('Technical details (1)'));
  expect(screen.getByText('403 Forbidden')).toBeVisible();
});
