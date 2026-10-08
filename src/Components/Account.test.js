import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Account from './Account';
import { __query, supabase } from '../auth/client';

jest.mock('../auth/client', () => {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
    upsert: jest.fn()
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  return {
    redirectUrl: () => 'http://localhost/Gridline',
    __query: query,
    supabase: {
      auth: {
        getSession: jest.fn(),
        onAuthStateChange: jest.fn(),
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        resetPasswordForEmail: jest.fn(),
        updateUser: jest.fn(),
        resend: jest.fn(),
        signOut: jest.fn()
      },
      from: jest.fn(() => query)
    }
  };
});

let authListener;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

beforeEach(() => {
  jest.clearAllMocks();
  authListener = null;

  supabase.from.mockReturnValue(__query);
  __query.select.mockReturnValue(__query);
  __query.eq.mockReturnValue(__query);
  __query.maybeSingle.mockResolvedValue({ data: null, error: null });
  __query.upsert.mockResolvedValue({ error: null });

  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  supabase.auth.onAuthStateChange.mockImplementation(callback => {
    authListener = callback;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  supabase.auth.signOut.mockResolvedValue({ error: null });
  supabase.auth.resend.mockResolvedValue({ error: null });
  supabase.auth.updateUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } }, error: null });
});

async function openSignIn() {
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
}

test('failed login displays a generic error without closing the dialog', async () => {
  supabase.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
  render(<Account language="en" weight={100} onPreferences={() => {}} />);

  await openSignIn();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } });
  fireEvent.submit(screen.getByLabelText('Email').closest('form'));

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unable to sign in. Check your email and password.'));
  expect(screen.getByRole('dialog')).toBeVisible();
});

test('signup validates password confirmation before calling Supabase', async () => {
  render(<Account language="en" weight={100} onPreferences={() => {}} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'strong-password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-password' } });
  fireEvent.submit(screen.getByLabelText('Email').closest('form'));

  expect(await screen.findByRole('status')).toHaveTextContent('does not match');
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test('signup with confirmation required can resend the confirmation email', async () => {
  supabase.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  render(<Account language="en" weight={100} onPreferences={() => {}} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'strong-password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'strong-password' } });
  fireEvent.submit(screen.getByLabelText('Email').closest('form'));

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('confirm the account'));
  expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
    options: { emailRedirectTo: 'http://localhost/Gridline' }
  }));

  fireEvent.click(screen.getByRole('button', { name: 'Resend confirmation email' }));
  await waitFor(() => expect(supabase.auth.resend).toHaveBeenCalledWith({
    type: 'signup',
    email: 'test@example.com',
    options: { emailRedirectTo: 'http://localhost/Gridline' }
  }));
});

test('password reset keeps the response generic and uses the configured redirect', async () => {
  supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  render(<Account language="en" weight={100} onPreferences={() => {}} />);

  await openSignIn();
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'unknown@example.com' } });
  fireEvent.submit(screen.getByLabelText('Email').closest('form'));

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('If this email is linked to an account'));
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
    'unknown@example.com',
    { redirectTo: 'http://localhost/Gridline' }
  );
});

test('PASSWORD_RECOVERY opens the new-password flow and updates the password', async () => {
  render(<Account language="en" weight={100} onPreferences={() => {}} />);
  await screen.findByRole('button', { name: 'Sign in' });

  await act(async () => {
    authListener('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'test@example.com' } });
  });

  expect(screen.getByRole('heading', { name: 'Set new password' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-123' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password-123' } });
  fireEvent.submit(screen.getByLabelText('New password').closest('form'));

  await waitFor(() => expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-123' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Password updated successfully');
});

test('restored sessions load preferences and allow explicit save and sign out', async () => {
  const onPreferences = jest.fn();
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'u1', email: 'test@example.com' } } },
    error: null
  });
  __query.maybeSingle.mockResolvedValue({
    data: { language: 'zh-TW', weight: 90, watchlist: ['NBIS', 'ORCL'] },
    error: null
  });

  render(<Account language="en" weight={100} onPreferences={onPreferences} />);

  const avatar = await screen.findByRole('button', { name: 'Account options' });
  await waitFor(() => expect(onPreferences).toHaveBeenCalledWith({
    language: 'zh-TW',
    weight: 90,
    watchlist: ['NBIS', 'ORCL']
  }));

  fireEvent.click(avatar);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save preferences' })).toBeEnabled());
  expect(screen.queryByText(/capacity weight/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

  await waitFor(() => expect(__query.upsert).toHaveBeenCalledWith(
    { user_id: 'u1', language: 'en', weight: 100, watchlist: ['NBIS', 'ORCL'] },
    { onConflict: 'user_id' }
  ));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
});

test('Chinese account error uses customer-facing wording and offers retry', async () => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'u1', email: 'test@example.com' } } },
    error: null
  });
  __query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'policy denied' } });

  render(<Account language="zh-TW" weight={100} onPreferences={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '帳戶選項' }));

  expect(await screen.findByText('無法載入您儲存的偏好設定，請再試一次。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重試' })).toBeEnabled();
  expect(screen.queryByText(/資料表|權限政策|容量權重/)).not.toBeInTheDocument();
});

test('watchlist groups all 20 companies and saves newly added symbols', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'test@example.com' } } } });
  render(<Account language="zh-TW" weight={100} onPreferences={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '帳戶選項' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '儲存偏好設定' })).toBeEnabled());
  expect(screen.getAllByRole('checkbox')).toHaveLength(20);
  expect(screen.getByRole('region', { name: '發電與能源' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'BE' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'APLD' }));
  fireEvent.click(screen.getByRole('button', { name: '儲存偏好設定' }));
  await waitFor(() => expect(__query.upsert).toHaveBeenCalledWith(
    { user_id: 'u1', language: 'zh-TW', weight: 100, watchlist: ['BE', 'APLD'] },
    { onConflict: 'user_id' }
  ));
});
