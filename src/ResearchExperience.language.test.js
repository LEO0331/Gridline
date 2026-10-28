import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResearchExperience from './ResearchExperience';

jest.mock('./Components/Account', () => () => null);
jest.mock('./ExposurePeriodMonitor', () => () => null);

beforeEach(() => {
  window.localStorage.setItem('gridline-language', 'zh-TW');
  window.history.pushState({}, '', '#overview');
  global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
});

test('Traditional Chinese survives navigation away from and back to the dashboard', async () => {
  render(<ResearchExperience />);
  expect(screen.getByRole('button', { name: '總覽' })).toBeInTheDocument();
  await screen.findByText('無法載入儀表板快照');
  act(() => { window.location.hash = '#regime'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(screen.getByText('訊號總覽')).toBeInTheDocument();
  act(() => { window.location.hash = '#scenario'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(await screen.findByText('情境假設')).toBeInTheDocument();
  act(() => { window.location.hash = '#backtest'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(await screen.findByText('歷史訊號')).toBeInTheDocument();
  act(() => { window.location.hash = '#health'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(await screen.findByText('資料狀態')).toBeInTheDocument();
  await screen.findByText('無法載入快照。');
  act(() => { window.location.hash = '#overview'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(screen.getByRole('button', { name: '總覽' })).toBeInTheDocument();
  await screen.findByText('無法載入儀表板快照');
  expect(window.localStorage.getItem('gridline-language')).toBe('zh-TW');
});

test('data status stays primary while assumption and backtest tools are grouped', async () => {
  render(<ResearchExperience />);
  await screen.findByText('無法載入儀表板快照');
  expect(screen.getByRole('button', { name: '資料狀態' })).toBeInTheDocument();
  expect(screen.getByText('方法與假設')).toBeInTheDocument();
  const methods = screen.getByText('方法與假設').closest('details');
  expect(methods).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('方法與假設'));
  expect(methods).toHaveAttribute('open');
  expect(screen.getByRole('button', { name: '情境假設 →' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '資料狀態' }));
  expect(window.location.hash).toBe('#health');
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  await screen.findByText('無法載入快照。');
});
