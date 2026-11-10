import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './Containers/App';

jest.mock('./Components/AccountGate', () => () => null);

const originalFetch = global.fetch;

beforeEach(() => {
  window.history.pushState({}, '', '#overview');
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ schemaVersion: 1, trimmedEditions: 0, editions: [] }),
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('loads the archive only on Reports and preserves the existing navigation', async () => {
  render(<App snapshotState="error" />);
  expect(global.fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Research Reports' }));
  expect(window.location.hash).toBe('#reports');
  const title = await screen.findByRole('heading', { level: 1, name: 'Research Reports' });
  expect(title).toHaveFocus();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/data\/research-reports\.json$/);
  expect(screen.getByRole('button', { name: 'Research Reports' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Research Calendar' }));
  expect(screen.getByRole('heading', { name: 'Research Catalyst Calendar' })).toBeVisible();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('renders the directly linked Reports workspace in Traditional Chinese', async () => {
  window.history.pushState({}, '', '#reports');
  render(<App snapshotState="loading" language="zh-TW" />);
  expect(await screen.findByRole('heading', { level: 1, name: '研究報告' })).toBeVisible();
  expect(screen.getByRole('button', { name: '研究報告' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('link', { name: '跳至儀表板內容' }));
  expect(window.location.hash).toBe('#reports');
  expect(document.getElementById('dashboard-content')).toHaveFocus();
});
