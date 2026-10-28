import React from 'react';
import { render, screen } from '@testing-library/react';
import MarketContext from './MarketContext';

test.each([['en', 'Market context', 'Unavailable'], ['zh-TW', '市場背景', '無法提供']])('presents unavailable benchmark context in %s', (language, section, unavailable) => {
  render(<MarketContext snapshot={{ generatedAt: new Date().toISOString(), observations: [] }} tickers={['NBIS']} ticker="NBIS" language={language} />);
  expect(screen.getByLabelText(section)).toBeTruthy();
  expect(screen.getAllByText(unavailable).length).toBeGreaterThan(0);
});
