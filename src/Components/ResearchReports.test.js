import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResearchReports from './ResearchReports';

const now = new Date('2026-11-29T18:00:00Z');
const sourceUrl = 'https://nebius.com/recorded-report-fixture';
const empty = { schemaVersion: 1, trimmedEditions: 0, editions: [] };
function edition(session, suffix, generatedAt) {
  return {
    id: `${session}-${String(suffix).padStart(24, '0')}`, session, generatedAt,
    freshness: 'partial', trackedTickers: ['NBIS'], changes: null,
    market: [{ id: `close-${session}`, ticker: 'NBIS', close: 25, currency: 'USD', observedAt: session, retrievedAt: generatedAt,
      sourceUrl: 'https://example.com/market', provider: 'Fixture market data', trend: null }],
    developments: [{ id: 'announcement', ticker: 'NBIS', title: 'Recorded announcement fixture', titleZh: '已記錄公告測試',
      source: 'Nebius', sourceUrl, publishedAt: '2026-11-10', retrievedAt: generatedAt, verificationStatus: 'primary-verified' }],
    infrastructure: [], financials: [], questions: [], sourceHealth: { prices: { status: 'degraded', checkedAt: generatedAt } },
  };
}
const first = edition('2026-11-23', 1, '2026-11-23T22:00:00Z');
const second = edition('2026-11-24', 2, '2026-11-24T22:00:00Z');
second.changes = {
  version: 'snapshot-diff-v1', available: true, from: first.generatedAt, to: second.generatedAt,
  summary: { total: 1, price: 1, signal: 0, event: 0, sourceHealth: 0 },
  changes: [{ id: 'price-nbis', type: 'price', ticker: 'NBIS', before: 25, after: 25,
    observedAt: '2026-11-24T00:00:00Z', sourceUrl: 'https://example.com/market' }],
};
const revision = edition('2026-11-24', 3, '2026-11-24T23:00:00Z');
const populated = { ...empty, editions: [first, second, revision] };
const respond = body => ({ ok: true, json: async () => body });
let originalFetch;

beforeEach(() => { originalFetch = global.fetch; global.fetch = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; });

test('loads an empty validated archive and focuses the bilingual heading', async () => {
  global.fetch.mockResolvedValue(respond(empty));
  const { rerender } = render(<ResearchReports now={now} />);
  expect(screen.getByRole('heading', { name: 'Research Reports' })).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('Loading the research archive');
  expect(await screen.findByRole('heading', { name: 'No published reports yet' })).toBeVisible();
  rerender(<ResearchReports language="zh-TW" now={now} />);
  expect(screen.getByRole('heading', { name: '尚無已發布的研究報告' })).toBeVisible();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: '目前研究日曆' })).toHaveAttribute('href', '#calendar');
});

test('reports failed and malformed requests separately from a valid empty archive', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(respond({ ...empty, schemaVersion: 0 }));
  render(<ResearchReports now={now} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  fireEvent.click(screen.getByRole('button', { name: 'Retry archive request' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('did not pass validation');
  expect(screen.queryByRole('heading', { name: 'No published reports yet' })).not.toBeInTheDocument();
});

test('opens the latest edition, preserves earlier editions, and follows source and company links', async () => {
  global.fetch.mockResolvedValue(respond(populated));
  const onCompanyResearch = jest.fn();
  render(<ResearchReports now={now} onCompanyResearch={onCompanyResearch} />);
  const editions = await screen.findByRole('combobox', { name: 'Report edition' });
  expect(editions).toHaveValue(revision.id);
  fireEvent.change(editions, { target: { value: second.id } });
  expect(screen.getByText(/Earlier retained edition/)).toBeVisible();
  const diff = screen.getByText('Changes between snapshot publications').closest('details');
  fireEvent.click(within(diff).getByText('Changes between snapshot publications'));
  expect(within(diff).getByText(/Observation date advanced · close unchanged/)).toBeVisible();
  expect(within(diff).getByText('2026-11-24')).toBeVisible();
  fireEvent.click(screen.getByText(/^Company developments/));
  expect(screen.getByRole('link', { name: /Recorded source · Nebius/ })).toHaveAttribute('href', sourceUrl);
  fireEvent.click(screen.getByRole('button', { name: 'Open NBIS company research' }));
  expect(onCompanyResearch).toHaveBeenCalledWith('NBIS');
  fireEvent.change(screen.getByRole('combobox', { name: 'Research theme' }), { target: { value: 'hardware' } });
  expect(screen.getByText('No recorded market observations match this selection.')).toBeVisible();
});

test('weekly review retains partial coverage and groups evidence by documented theme membership', async () => {
  global.fetch.mockResolvedValue(respond(populated));
  render(<ResearchReports now={now} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Weekly' }));
  expect(screen.getByRole('button', { name: 'Weekly' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/Expected sessions 4 · Available reports 2/)).toBeVisible();
  expect(screen.getByText(/Missing elapsed sessions · 2026-11-25, 2026-11-27/)).toBeVisible();
  const theme = screen.getByText('Neocloud / GPU Cloud', { selector: 'summary' }).closest('details');
  fireEvent.click(within(theme).getByText('Neocloud / GPU Cloud'));
  fireEvent.click(within(theme).getByText(/^Company developments/));
  expect(within(theme).getAllByText('NBIS · Recorded announcement fixture')).toHaveLength(1);
  expect(within(theme).getByText(/Earlier publication carried/)).toBeVisible();
});
