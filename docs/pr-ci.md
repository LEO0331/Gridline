# Pull-request quality gate

Every pull request targeting `main` runs the `Pull request quality gate` workflow on Node.js 22. It also supports manual execution. Monday 11:11 Asia/Taipei (03:11 UTC) performs a fresh production build/exposure check and dependency audit, skipping the full test suite and snapshot-age acceptance.

Blocking checks:

1. install exactly from the committed lock file with `npm ci`;
2. the shared `.github/actions/verify` regression action: development-server, workflow publication/reporting, security-policy/exposure, server/domain, Supabase health-check and frontend tests;
3. public snapshot acceptance (`npm run demo:check`);
4. production build (`npm run build`).

A separate **Dependency security gate** job requires the successful fresh build/exposure artifact from the same workflow run. It runs `npm run security:audit -- dependency-exposure.json`, querying the complete current registry audit without another dependency installation.

The job remains blocking. The repository owner authorized one exact, expiring `braces` advisory exception after exposure review; it expires 2026-11-11 at 00:00 Asia/Taipei. Changed or unknown high findings, any critical findings, expired exceptions, stale/missing exposure proof and failed audit requests block. Successful accepted-risk checks do not mean a clean raw audit. See [security policy](security-exception-policy.md) and [dependency maintenance](dependency-maintenance.md). Keep npm 10 aligned with the Node 22 runner when regenerating the lockfile.

`npm run verify` reproduces the code-test/build sequence locally. It does not contact external providers and does not require the committed public snapshot to be demo-ready.

Snapshot acceptance is deliberately separate:

```bash
npm run demo:check
```

This checks the data artifact itself (schema v4, recent price coverage, source health, etc.). Historical v1 reconstruction is no longer required. The scheduled daily snapshot workflow runs `demo:check` before committing refreshed public data. For a complete pre-demo check after generating a fresh snapshot, use:

```bash
npm run verify:demo
```

The separate Pages workflow applies the same shared regression action, snapshot acceptance and production build before deploying `main`, including direct pushes and manual snapshot dispatches. Documentation-only and tracked build-output-only pushes skip deployment. Application deployments run Lighthouse; snapshot-only deployments skip it. Monday at 10:37 Asia/Taipei, Pages runs Lighthouse against the deployed site without rebuilding or publishing it. See [Actions operation](actions-maintenance.md) for scheduling and publishing details.

For repository settings, require the PR quality-gate checks before merging to `main`.
