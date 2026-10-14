import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegimeExperience from './RegimeExperience';

jest.mock('./Components/Account', () => () => null);
jest.mock('./ExposurePeriodMonitor', () => () => null);

const loadedSnapshot = {
  generatedAt: '2026-09-24T22:00:00Z',
  sourceHealth: { prices: { status: 'ok' } },
  observations: [{
    id: 'p1',
    source: 'prices',
    type: 'close',
    ticker: 'NBIS',
    value: 100,
    observedAt: '2026-09-24T20:00:00Z',
    provenance: { provider: 'Fixture', originUrl: 'https://example.com/prices' },
  }],
};

beforeEach(() => {
  window.history.pushState({}, '', '#overview');
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('main dashboard shows loading state while the snapshot request is pending', () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  render(<RegimeExperience />);

  expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard snapshot');
});

test('snapshot failure is retryable and replaces the error state after success', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => loadedSnapshot })
    .mockResolvedValueOnce({ ok: false });

  render(<RegimeExperience />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Dashboard snapshot could not be loaded');
  fireEvent.click(screen.getByRole('button', { name: 'Retry snapshot' }));

  await waitFor(() => {
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Published 2026-09-24')).toBeInTheDocument();
  });
});

test('Chinese price-trend detail localizes event titles and shows last verification date', async () => {
  const title = 'Loudoun Board Opposes Valley North Transmission Line, Denies Substation Near Dulles Airport';
  const url = 'https://www.loudoun.gov/m/newsflash/Home/Detail/10876';
  const eventSnapshot = { ...loadedSnapshot, observations: [...loadedSnapshot.observations, {
    id: 'event-1', source: 'events', type: 'infrastructureEvent', retrievedAt: '2026-09-26T00:17:00Z',
    value: { title, url, category: 'PERMIT', region: 'Northern Virginia', source: 'Loudoun', publishedAt: new Date(Date.now() - 86400000).toISOString() },
  }] };
  window.history.pushState({}, '', '#regime');
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => eventSnapshot })
    .mockResolvedValueOnce({ ok: false });

  render(<RegimeExperience language="zh-TW" />);

  expect(await screen.findByText('勞登郡董事會反對 Valley North 輸電線，否決杜勒斯機場附近的變電站申請')).toBeInTheDocument();
  expect(screen.getByText(`${eventSnapshot.observations.at(-1).value.publishedAt.slice(0, 10)} · 許可`)).toBeInTheDocument();
  expect(screen.getByText('Loudoun · 最近驗證 2026-09-26')).toBeInTheDocument();
});
