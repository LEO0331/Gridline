import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CompanyResearch from './CompanyResearch';
import { buildCompanyResearch } from '../companyResearchModel';

jest.mock('../companyResearchModel', () => ({ buildCompanyResearch: jest.fn() }));

const metric = { id: 'revenue', label: 'Revenue', labelZh: '營收', value: 0, unit: 'USD', periodStart: '2026-01-01', periodEnd: '2026-06-30', filedAt: '2026-08-05', form: '10-Q', sourceUrl: 'https://www.sec.gov/Archives/revenue' };
const base = { company: { ticker: 'APLD', name: 'Applied Digital' }, financials: [metric], filings: [{ form: '10-Q', filedAt: '2026-08-05', sourceUrl: 'https://www.sec.gov/Archives/filing' }], coverage: { status: 'ok', lastSuccessAt: '2026-10-08T01:00:00Z' }, profile: { focus: ['Capacity delivery'], focusZh: ['容量交付'], risks: ['Are power connections ready?'], risksZh: ['電力連接是否已就緒？'], sourceUrl: 'https://ir.applieddigital.com/' }, events: [] };
beforeEach(() => buildCompanyResearch.mockReturnValue(base));

test('shows a real zero, native units and dated filing evidence without treating zero as missing', () => {
  render(<CompanyResearch snapshot={{}} ticker="APLD" />);
  expect(screen.getByRole('heading', { name: 'APLD · Applied Digital' })).toBeInTheDocument();
  expect(screen.getByText('USD')).toBeInTheDocument();
  expect(screen.getByText('USD').closest('strong')).toHaveTextContent('0 USD');
  expect(screen.getByText('Period: 2026-01-01 → 2026-06-30')).toBeInTheDocument();
  expect(screen.getByText('Filed: 2026-08-05 · 10-Q')).toBeInTheDocument();
  const source = screen.getByRole('link', { name: 'SEC source ↗' });
  expect(source).toHaveAttribute('href', metric.sourceUrl);
  expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  source.focus();
  expect(source).toHaveFocus();
});

test('uses Traditional Chinese labels and sourced focus questions', () => {
  render(<CompanyResearch snapshot={{}} ticker="APLD" language="zh-TW" />);
  expect(screen.getByRole('heading', { name: 'SEC 財務紀錄' })).toBeInTheDocument();
  expect(screen.getByText('營收')).toBeInTheDocument();
  expect(screen.getByText('容量交付')).toBeInTheDocument();
  expect(screen.getByText('電力連接是否已就緒？')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '業務來源 ↗' })).toHaveAttribute('href', base.profile.sourceUrl);
});

test('explains missing financials and profile rather than inventing a value', () => {
  buildCompanyResearch.mockReturnValue({ company: base.company, coverage: { status: 'missing' }, financials: [], events: [], profile: null });
  render(<CompanyResearch snapshot={{}} ticker="APLD" />);
  expect(screen.getByText('No financial data recorded')).toBeInTheDocument();
  expect(screen.getByText('No supported SEC financial metrics are available for this company yet.')).toBeInTheDocument();
  expect(screen.getByText('A sourced business profile is not recorded yet.')).toBeInTheDocument();
  expect(screen.getByText('No verified company-specific announcements are recorded yet.')).toBeInTheDocument();
});

test('keeps financial values visible when source checks become stale', () => {
  buildCompanyResearch.mockReturnValue({ ...base, coverage: { status: 'stale', lastSuccessAt: '2026-09-01', message: 'Latest request failed; retained prior records.' } });
  render(<CompanyResearch snapshot={{}} ticker="APLD" />);
  expect(screen.getByText('Retained data · refresh needed')).toBeInTheDocument();
  expect(screen.getByText('Last successful SEC check: 2026-09-01')).toBeInTheDocument();
  expect(screen.getByText('Latest request failed; retained prior records.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'SEC source ↗' })).toBeInTheDocument();
});

test('limits recent developments and places older records behind a disclosure', () => {
  const events = [0, 1, 2, 3, 4].map(index => ({ title: `Official release ${index}`, summary: 'Sourced announcement.', source: 'Applied Digital', publishedAt: '2026-08-01', retrievedAt: '2026-10-08', url: `https://ir.applieddigital.com/news/${index}`, archived: index === 4 }));
  buildCompanyResearch.mockReturnValue({ ...base, events });
  render(<CompanyResearch snapshot={{}} ticker="APLD" />);
  const older = screen.getByText('More dated records (2)').closest('details');
  expect(older).not.toHaveAttribute('open');
  expect(screen.getByRole('link', { name: 'Official release 0 ↗' })).toBeInTheDocument();
  expect(screen.getByText('Official release 4 ↗').closest('details')).toBe(older);
  expect(screen.getByText('Older record')).toBeInTheDocument();
  fireEvent.click(screen.getByText('More dated records (2)'));
});

test('passes the selected ticker to the model and omits unsafe source links', () => {
  const snapshot = { generatedAt: '2026-10-08' };
  buildCompanyResearch.mockReturnValue({ ...base, financials: [{ ...metric, sourceUrl: 'javascript:alert(1)' }] });
  const { rerender } = render(<CompanyResearch snapshot={snapshot} ticker="APLD" />);
  expect(screen.queryByRole('link', { name: 'SEC source ↗' })).not.toBeInTheDocument();
  rerender(<CompanyResearch snapshot={snapshot} ticker="IREN" />);
  expect(buildCompanyResearch).toHaveBeenLastCalledWith(snapshot, 'IREN', undefined);
});

test('latest official release remains visible when older than the recent window', () => {
  buildCompanyResearch.mockReturnValue({ ...base, events: [{ title: 'Older official release', summary: 'A dated record.', source: 'Issuer', publishedAt: '2026-08-01', retrievedAt: '2026-10-08', url: 'https://ir.applieddigital.com/news/older', archived: true }] });
  render(<CompanyResearch snapshot={{}} ticker="APLD" />);
  expect(screen.getByRole('link', { name: 'Older official release ↗' }).closest('details')).toBeNull();
  expect(screen.getByText('Older record')).toBeVisible();
});

test('missing fields use localized metric labels instead of internal identifiers', () => {
  buildCompanyResearch.mockReturnValue({ ...base, coverage: { status: 'ok', missingFields: [{ id: 'longTermDebt', label: 'Long-term debt', labelZh: '長期負債借款' }] } });
  render(<CompanyResearch snapshot={{}} ticker="APLD" language="zh-TW" />);
  expect(screen.getByText('尚無可用申報欄位: 長期負債借款')).toBeVisible();
  expect(screen.queryByText(/longTermDebt/)).not.toBeInTheDocument();
});

test('distinguishes audited gaps from zero and uses the precise financial concept', () => {
  buildCompanyResearch.mockReturnValue({ ...base, financials: [{ ...metric, label: 'Current portion of long-term debt', classification: 'reported-zero', extractionMethod: 'sec-inline-xbrl' }], coverage: { status: 'partial', missingFields: [{ id: 'capex', label: 'Cash PP&E expenditure', classification: 'not-separately-reported', reason: 'No separate consolidated total is reported.', auditSourceUrl: 'https://www.sec.gov/Archives/audited-filing' }] } });
  render(<CompanyResearch snapshot={{}} ticker="APLD" />);
  expect(screen.getByText('Current portion of long-term debt')).toBeVisible();
  expect(screen.getByText('Explicitly reported zero')).toBeVisible();
  expect(screen.getByText(/Cash PP&E expenditure: Not separately reported/)).toBeVisible();
  expect(screen.getByText('No separate consolidated total is reported.')).toBeVisible();
  expect(screen.getByText('Extraction: Filing XBRL')).toBeVisible();
  expect(screen.getAllByRole('link', { name: 'SEC source ↗' }).some(link => link.href.endsWith('/audited-filing'))).toBe(true);
});

test('shows original and fallback publisher links with independent review and automatic check dates', () => {
  const event = { title: 'Official release', summary: 'Original English summary', publishedAt: '2026-08-01', reviewedAt: '2026-09-01', automaticVerifiedAt: '2026-10-08', verificationStatus: 'official-fallback-verified', originalSourceUrl: 'https://ir.applieddigital.com/release', url: 'https://www.sec.gov/Archives/release.htm' };
  buildCompanyResearch.mockReturnValue({ ...base, events: [event] });
  render(<CompanyResearch snapshot={{}} ticker="APLD" language="zh-TW" />);
  expect(screen.getByRole('link', { name: 'Official release ↗' })).toBeVisible();
  expect(screen.getByText('Original English summary')).toBeVisible();
  expect(screen.getByRole('link', { name: '原始發布者 ↗' })).toHaveAttribute('href', event.originalSourceUrl);
  expect(screen.getByRole('link', { name: '已驗證 SEC 備援文件 ↗' })).toHaveAttribute('href', event.url);
  expect(screen.getByText(/自動檢查 2026-10-08.*人工審閱 2026-09-01/)).toBeVisible();
});
