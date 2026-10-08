# Scheduled Supabase database health check

The `Check Supabase database health` GitHub Actions workflow runs daily at approximately 14:43 Asia/Taipei (06:43 UTC), and can also be run manually from Actions. GitHub schedules can be delayed. This workflow is independent of market-data refreshes and runs even when your computer is off.

Each run sends three sequential requests to `public.gridline_health()` through the Supabase REST API. The SQL function returns only `ok`, uses invoker permissions and an empty search path, and does not read or write account tables. Execute access is granted only to the API's `anon` and `authenticated` roles, rather than PostgreSQL PUBLIC. Existing authentication, preference rows and RLS policies are unchanged.

Apply `supabase/migrations/20261008_add_database_health.sql` before running the workflow. It reloads the PostgREST schema cache after creating the function. Fresh projects must apply this migration as well as the account schema.

The workflow reuses these existing repository Actions variables:

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_PUBLISHABLE_KEY`

It never requires an administrator/service-role key. `scripts/supabase-health.js` accepts only hosted Supabase HTTPS project URLs and `sb_publishable_` keys, refuses redirects, checks the exact RPC response, and retries transient network/408/429/5xx failures at most three times with bounded timeouts. Permanent failures fail the workflow; GitHub's normal Actions notification settings determine whether you receive failure notifications. Errors do not include credential values or upstream response bodies. No dependencies are installed in the scheduled job.

For local execution, export the two values as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, then run `npm run health:supabase`. Regression tests run with `npm run test:supabase-health` and are included in `npm run verify` and PR CI.

This is a best-effort activity and availability check, not a guarantee against free-tier pauses. Supabase documents that a few user database requests per day typically suffice; paid plans are exempt from inactivity pausing. A health probe cannot resume a project that is already paused. Public GitHub repositories can have scheduled workflows disabled after 60 days without repository activity; inspect Actions and Supabase warning emails if checks stop. Disable this workflow in Actions to stop recurring requests. To remove the endpoint, revoke its execute grants or drop only `public.gridline_health()`.

Sources: [Supabase pausing policy](https://supabase.com/docs/guides/platform/free-project-pausing), [database function security](https://supabase.com/docs/guides/database/functions), [GitHub workflow disabling](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).
