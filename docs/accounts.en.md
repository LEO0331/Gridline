# Accounts on Supabase Free

The public dashboard needs no login. Accounts are optional and currently save a watchlist, language and capacity weight. The React side now covers sign-up, email confirmation/resend, sign-in, session restoration, password reset, password change, preference load/save, and sign-out. The deployed project is configured; the setup below is for a new project or reconfiguration.

## Project setup and migration reference

1. Create a **Free** project at https://supabase.com/dashboard. Do not enable paid add-ons unless you intentionally need them.
2. Run `supabase/user-preferences.sql` in the project's SQL Editor. The script is safe to rerun: it creates the preference table when missing, enables Row Level Security, recreates the own-row policy, blocks anonymous preference access, and grants authenticated CRUD access.
3. Enable Email authentication, keep email confirmation enabled, and set the minimum password length to at least 8.
4. Under Authentication → URL Configuration:
   - Site URL: `https://leo0331.github.io/Gridline/`
   - Allow both `https://leo0331.github.io/Gridline/` and `https://leo0331.github.io/Gridline`
   - For local development, allow the URL you actually use, normally `http://localhost:3000/` (or a suitable localhost wildcard while developing).
   - PKCE confirmation/recovery links must be opened in the same browser that started the flow.
5. Copy the project URL and **publishable** key (`sb_publishable_...`) from the project's Connect/API Keys screen. Never put a secret/service-role key in React.
6. Local development: put these in `.env.local`, then restart `npm start`:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_PUBLISHABLE_KEY`
7. GitHub Pages: Settings → Secrets and variables → Actions → **Variables** → create the same two repository variables. The deployment workflows inject them at build time. These are browser configuration values, not secrets.
8. The repository CSP permits HTTPS/WebSocket traffic only to the configured `eomxjtbaefakfxtaoiwj.supabase.co` project. For a different project, update both hosts in `public/index.html`. If you later use a custom Supabase domain, add that host to `connect-src` in `public/index.html`.

## Implemented application behavior

- **No Supabase config:** Sign in / Create account remain visible, but the dialog clearly says accounts are not enabled; the public dashboard continues working.
- **Sign up:** email + password + password confirmation; uses PKCE and an explicit redirect URL.
- **Email confirmation:** when confirmation is required, the dialog stays open and provides a resend-confirmation action.
- **Sign in:** restores the session on reload and avoids flashing a signed-out state while local session restoration is in progress.
- **Forgot password:** sends a reset link and always shows a generic response so the UI does not reveal whether an account exists.
- **Password recovery:** the `PASSWORD_RECOVERY` auth event opens a new-password form and calls `updateUser`.
- **Change password while signed in:** asks for the current password and a confirmed new password.
- **Preferences:** loads only the signed-in user's `user_preferences` row under RLS; save is explicit and uses an upsert on `user_id`. A failed preference load can be retried without logging out.
- **Sign out:** removes the local browser session.
- **Security boundary:** the browser accepts only an `sb_publishable_...` key. Secret/service-role credentials are never supported by the frontend.

Supabase stores only account/session data plus the preference row. Market, EIA, SEC, PJM and other research-source payloads are not uploaded to Supabase by this feature.

## Expanded watchlists and daily health check

Fresh setups use the 20-symbol constraint in `supabase/user-preferences.sql`. Existing installations with the original four-symbol constraint apply `supabase/migrations/20261008_expand_watchlist.sql`; it widens the allowed watchlist without deleting rows or changing RLS. Research/news/financial coverage itself requires no Supabase migration.

`supabase/migrations/20261008_add_database_health.sql` creates `gridline_health()`, an invoker-rights RPC returning only `ok`, executable by anonymous and authenticated roles. It does not read or modify accounts or preferences. The separate GitHub workflow calls it daily at 14:43 Asia/Taipei using the configured public project variables; `npm run health:supabase` uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` locally and requires three successful requests. It rejects privileged credentials, redirects and unexpected responses and bounds transient retries. This provides database activity and health visibility; inspect failures or missed schedules because it does not guarantee free-tier availability or automatic unpausing. See [Actions operation](actions-maintenance.md).

## Email delivery before public launch

Supabase's built-in email sender is intended for testing and has delivery/rate limitations. Before inviting general users, configure and verify custom SMTP, then test signup confirmation and password recovery end to end.

## Acceptance checks after Supabase setup

1. Register with a new email → receive confirmation → confirm in the same browser → sign in.
2. Try a mismatched signup password confirmation and verify the browser blocks the request.
3. Resend the signup confirmation email.
4. Reload while signed in and verify the session is restored.
5. Change language / capacity weight / watchlist, save, reload, and verify restoration.
6. Enter a wrong password and verify the dialog remains open with the provider error.
7. Request password recovery, follow the email link, set a new password, then sign in with it.
8. Change the password while already signed in.
9. Sign out and verify the authenticated controls disappear.
10. Use a second account and verify it cannot read or write the first account's preference row through the Data API.

Until the Supabase project, redirect URLs, SQL and repository variables are configured, live authentication and RLS cannot be validated from the repository alone.
