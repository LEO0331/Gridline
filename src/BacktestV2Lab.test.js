import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import BacktestV2Lab from './BacktestV2Lab';

test('v2 assumptions and unavailable results are explained in both languages', () => {
  const { rerender } = render(<BacktestV2Lab ticker="NBIS" observations={[]} language="en"/>);
  expect(screen.getByText('SIMULATION ASSUMPTIONS')).toBeInTheDocument();
  expect(screen.getByText(/No completed trades/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'momentum-breakout' } });
  expect(screen.getByLabelText('Method')).toHaveValue('momentum-breakout');
  rerender(<BacktestV2Lab ticker="NBIS" observations={[]} language="zh-TW"/>);
  expect(screen.getByText('模擬假設')).toBeInTheDocument();
  expect(screen.getByText(/沒有已完成交易/)).toBeInTheDocument();
});
