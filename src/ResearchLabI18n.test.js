import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScenarioLab from './ScenarioLab';
import BacktestLab from './BacktestLab';
import { researchLabCopy } from './researchLabI18n';

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {}));
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('research dock copy has English and Traditional Chinese labels', () => {
  const english = researchLabCopy('en');
  const chinese = researchLabCopy('zh-TW');
  expect(english.dockLabel).toBe('RESEARCH TOOLS');
  expect(english.scenarioButton).toBe('Scenario assumptions →');
  expect(english.backtestButton).toBe('Historical signals →');
  expect(chinese.dockLabel).toBe('研究工具');
  expect(chinese.scenarioButton).toBe('情境假設 →');
  expect(chinese.backtestButton).toBe('歷史訊號 →');
});

test('scenario lab renders Traditional Chinese copy and localized regions', () => {
  render(<ScenarioLab language="zh-TW" onBack={() => {}} />);
  expect(screen.getByText('情境假設')).toBeInTheDocument();
  expect(screen.getByText('檢視假設變化')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '德州' })).toHaveValue('Texas');
  expect(screen.getByRole('option', { name: '北維吉尼亞' })).toHaveValue('Northern Virginia');
  expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
});

test('historical signal page uses customer-facing signal families in Traditional Chinese', async () => {
  render(<BacktestLab language="zh-TW" onBack={() => {}} />);
  expect(screen.getByText('歷史訊號')).toBeInTheDocument();
  expect(screen.getByText('歷史訊號回顧')).toBeInTheDocument();
  expect(screen.getByText('訊號類型')).toBeInTheDocument();
  expect(screen.getByText(/趨勢／移動平均/)).toBeInTheDocument();
  expect(screen.getByText(/動能／震盪指標/)).toBeInTheDocument();
  expect(screen.getByText('判定時間與衡量方式')).toBeInTheDocument();
  expect(screen.getByText('訊號日收盤價')).toBeInTheDocument();
  expect(screen.getByText('資料涵蓋')).toBeInTheDocument();
  expect(screen.getByText(/同向比例：已完成觀察中/)).toHaveTextContent('平均方向調整報酬：');
  expect(screen.getByText(/同向比例：已完成觀察中/)).toHaveTextContent('並非實際交易報酬');
  expect(screen.getByText('解讀限制')).toBeInTheDocument();
  expect(screen.queryByText(/MA5|MA10/)).not.toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
});

test('historical signal ticker synchronizes after a subset snapshot loads', async () => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ trackedTickers: ['VRT', 'ETN'], observations: [] }) }));
  render(<BacktestLab language="en" onBack={() => {}} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Ticker' })).toHaveValue('VRT'));
  expect(screen.queryByRole('option', { name: /NBIS/ })).not.toBeInTheDocument();
});

test('historical signals offers the expanded grouped universe and keeps missing history unavailable', () => {
  render(<BacktestLab language="en" onBack={() => {}} />);
  expect(screen.getAllByRole('option')).toHaveLength(20);
  expect(screen.getByRole('group', { name: 'Generation & energy' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Ticker' }), { target: { value: 'BE' } });
  expect(screen.getByRole('combobox', { name: 'Ticker' })).toHaveValue('BE');
  expect(screen.getByText(researchLabCopy('en').historical.unavailable)).toBeInTheDocument();
});
