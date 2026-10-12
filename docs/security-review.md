# Security review report and current operational status

**Scope:** Gridline React client, Supabase authentication/RLS, Node research API, ingestion adapters, local persistence, dependencies, and GitHub Actions
**Historical review date:** 2026-09-16
**Historical status:** High and critical findings identified in that review were remediated; verification passed at that time.

## Current status — 2026-10-12

The review findings and test counts below are historical evidence, not a current clean dependency audit. Current unpatched build-tool advisories still fail the high/critical PR and weekly dependency security gate; no exceptions were added. A compatible parser patch was applied. Production deployments run the shared regression gate, snapshot acceptance and build before publishing, while the dependency audit remains a separate PR/weekly job. See [Actions operation](actions-maintenance.md) for the 356-test completion evidence and live run links.

Supabase remains optional account/preference storage. The expanded 20-symbol watchlist migration preserves rows and owner-only RLS. The daily health RPC returns a constant and exposes no account data; it uses the browser-safe publishable key and does not supply research storage. The CSP permits only the configured project origin.

## Remediated findings

### High — unauthenticated state-changing API

The research API accepted scenario, backtest, and ingestion POST requests with wildcard CORS and listened on every interface. It now binds to `127.0.0.1` by default, restricts browser origins, requires a timing-safe bearer token for non-loopback writes, and rate-limits write requests. Provider keys are never accepted from requests or returned in responses.

### High — mutable CI action references and broad workflow permissions

All GitHub Actions are pinned to immutable commit SHAs. At the review date, the snapshot publication path used a separate deployment. The current snapshot workflow has repository-content and Actions write permission and explicitly dispatches Pages after a changed snapshot; `GITHUB_TOKEN` pushes do not automatically trigger deployment. Pages/OIDC permissions are limited to the deploy job. Checkout credentials are disabled where pushes are unnecessary. High/critical dependency advisories block pull-request CI.

### Medium — unbounded requests, responses, and result sets

JSON request limits are enforced while streaming. Outbound provider requests use HTTPS, DNS/private-address checks, redirect validation, a 20-second timeout, and a 25 MiB response ceiling. Observation and score APIs apply bounded pagination; run-history limits are clamped. Large raw IR/FERC payloads remain only in ignored bronze storage rather than public normalized observations.

### Medium — vulnerable dependencies

Non-breaking updates and explicit transitive overrides removed the reported advisories. `npm audit` reported zero known vulnerabilities on the historical review date; this is no longer the current dependency status. The full server/client test suite and production build pass with the fixed versions.

### Low — information and authentication error disclosure

API health no longer exposes absolute database paths, ingestion responses no longer expose raw file locations, unexpected API errors return a generic response, and browser authentication errors are normalized rather than forwarding provider internals.

### Low — browser policy and repository hygiene

The static page now uses a restrictive CSP with an exact Supabase project origin, blocks object/frame content and form posts, upgrades insecure requests, and removes unused third-party preconnects. The stale tracked authentication test log was removed. Secret scanning found no secret/service-role keys, private keys, or committed `.env.local` file.

## Verified controls

- Supabase uses PKCE with a browser-safe publishable key only.
- `user_preferences` has RLS enabled, anonymous privileges revoked, and owner-only `USING` and `WITH CHECK` policy conditions.
- Anonymous preference access was independently confirmed denied by Supabase.
- React escaping is used; no `dangerouslySetInnerHTML`, `eval`, or dynamic code execution was found.
- SQLite queries use parameters; dynamic column names come only from fixed internal mappings.
- Raw provider credentials are confined to local environment or GitHub secret variables.

## Remaining operational limitations

- GitHub Pages cannot set an HTTP `frame-ancestors` or `X-Frame-Options` response header. The meta CSP blocks frames loaded by Gridline but cannot prevent another site from framing Gridline. If header-level clickjacking protection becomes necessary, serve Pages through a host/proxy that supports security headers.
- Before opening email enrollment to the public, configure custom SMTP and CAPTCHA in Supabase and review Auth rate limits. Provider-side rate limits are active now.
- Create React App is a legacy toolchain. The historical audit was clean, but current unresolved build-tool advisories remain documented by the dependency gate; migrating the toolchain is a separate implementation task.
- If the optional Node API is deployed beyond localhost, generate `API_WRITE_TOKEN`, keep it server-only, set the exact `ALLOWED_ORIGINS`, terminate TLS at the hosting layer, and add centralized audit/abuse monitoring.

## Historical verification evidence — 2026-09-16

- Server tests: 44 passed
- Frontend tests: 26 passed
- Production build: compiled successfully
- Dependency audit: zero known vulnerabilities after remediation
- Git diff whitespace check: passed
