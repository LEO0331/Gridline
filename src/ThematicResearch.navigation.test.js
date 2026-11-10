import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './Containers/App';

jest.mock('./Components/AccountGate', () => () => null);

const snapshot = {
  generatedAt: '2026-11-10T01:00:00Z',
  observations: [{ id: 'fixture-close', source: 'prices', type: 'close', ticker: 'AVGO', value: 100, observedAt: '2026-11-09' }],
};

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  window.history.pushState({}, '', '#overview');
});

afterEach(() => jest.useRealTimers());

test('opens the thematic route directly and keeps the chosen theme and peers through calendar navigation', () => {
  window.history.pushState({}, '', '#themes');
  render(<App snapshot={snapshot} />);
  const title = screen.getByRole('heading', { level: 1, name: 'Thematic Research' });
  expect(title).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Thematic Research' })).toHaveAttribute('aria-current', 'page');
  fireEvent.change(screen.getByRole('combobox', { name: 'Research theme' }), { target: { value: 'power' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /VRT/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /CEG/ }));
  const link = screen.getByRole('link', { name: 'Open Research Calendar →' });
  expect(link).toHaveAttribute('href', '#calendar?theme=power');
  act(() => {
    window.history.pushState({}, '', link.getAttribute('href'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(screen.getByRole('heading', { level: 1, name: 'Research Catalyst Calendar' })).toHaveFocus();
  expect(screen.getByRole('combobox', { name: 'Research theme' })).toHaveValue('power');
  fireEvent.click(screen.getByRole('button', { name: 'Thematic Research' }));
  expect(screen.getByRole('combobox', { name: 'Research theme' })).toHaveValue('power');
  expect(screen.getByRole('checkbox', { name: /CEG/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /VRT/ })).not.toBeChecked();
});

test('comparison controls preserve Overview selection and the company action moves focus to that company', () => {
  render(<App snapshot={snapshot} />);
  fireEvent.click(screen.getByRole('button', { name: /Select ORCL/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Thematic Research' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Research theme' }), { target: { value: 'hardware' } });
  fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
  expect(screen.getByRole('button', { name: /Select ORCL/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Thematic Research' }));
  fireEvent.click(screen.getByRole('button', { name: /^View AVGO company research/ }));
  expect(window.location.hash).toBe('#overview?ticker=AVGO');
  expect(document.getElementById('overview-company-research')).toHaveFocus();
  expect(within(screen.getByRole('region', { name: 'Company research' })).getByRole('heading', { name: /AVGO/ })).toBeVisible();
});

test('validates a directly linked calendar theme filter', () => {
  window.history.pushState({}, '', '#calendar?theme=unknown');
  render(<App snapshot={snapshot} />);
  expect(screen.getByRole('combobox', { name: 'Research theme' })).toHaveValue('all');
});
