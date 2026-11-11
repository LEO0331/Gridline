# GitHub Actions operation

The seven repository workflows have separate purposes. The Actions sidebar can also show historical workflows and GitHub-managed Dependabot Updates. Dependabot's weekly configuration is `.github/dependabot.yml`.

| Workflow | Trigger / purpose |
| --- | --- |
| Deploy to GitHub Pages | Relevant `main` pushes/manual publication; Monday 10:37 Asia/Taipei Lighthouse-only audit. |
| Refresh daily dashboard snapshot | Daily primary refresh 12:17 UTC / 20:17 Asia/Taipei; conditional price-only recoveries 15:17 UTC / 23:17 Asia/Taipei and 18:17 UTC / next-day 02:17 Asia/Taipei; manual full or company-coverage refresh. |
| Pull request quality gate | PR/manual tests/build; Monday 11:11 Asia/Taipei fresh build/exposure verification and dependency audit. |
| Check Supabase database health | Daily 14:43 Asia/Taipei; manual heartbeat. |
| Check official event source access | Manual diagnostic with optional inactive-source/article probes. |
| Audit SEC issuer fact tags | Manual diagnostic for one ticker, a comma-separated list, or `ALL`. |
| Sync Research Calendar | Tuesday 03:17 UTC / 11:17 Asia/Taipei, with manual dry-run, review, and verified modes; official-source discovery and calendar-only publishing. |

## Verification and publication

Pull requests and every production deployment run the shared `.github/actions/verify` action. It checks development-server compatibility, workflow safety/reporting, backend behavior, Supabase health-check behavior and frontend behavior. Public snapshot acceptance and production build must also pass before Pages publication. A manual `reason=snapshot` changes Lighthouse selection only; it does not bypass verification. Publication is restricted to `main`.

Documentation-only and tracked build-output-only pushes do not deploy. Application changes run three Lighthouse audits after deployment. Snapshot-only publication skips that expensive audit. Monday at 10:37 Asia/Taipei, the existing Pages workflow audits the deployed site without rebuilding or publishing it. An active publication completes before the latest queued run starts.

## Daily snapshot refresh

The schedule in `.github/workflows/daily-snapshot.yml` is **12:17 UTC / 20:17 Asia/Taipei** for the main refresh, with **15:17 UTC / 23:17 Asia/Taipei** and **18:17 UTC / 02:17 the following day in Asia/Taipei** for conditional price-only recovery. Recovery preflight skips redundant calls once eligible price coverage is current. The full refresh includes SEC, prices, EIA, infrastructure events and company research; recovery refreshes prices only. All schedules are target times and GitHub execution can be delayed.

The daily data pipeline uses Node 22 built-ins and repository modules; it does not install the React dependency tree. It still runs snapshot consistency/readiness validation before publication. Git author identity is configured before `scripts/publish-snapshot.js` runs.

The publisher requires a clean tracked `main` checkout and no unpublished local commits. Its owned publication artifacts are `public/data/dashboard-snapshot.json`, `public/data/dashboard-overview.json`, and `public/data/research-reports.json`. The first two must match, and the research archive must validate against the full snapshot. Eligible new editions are derived from actual sourced sessions; an unchanged refresh does not create a new edition. The archive retains up to 60 editions. Up to three attempts collect and validate data against the latest remote state. Concurrent updates discard only those three generated files, fast-forward, and regenerate. A rejected push may undo only the script’s verified artifact-only commit before regenerating. Permission, validation, unrelated-change and divergent-history errors stop the job. The publisher uses ordinary fast-forward pushes. [Research Reports](research-reports.md)

The source summary runs on success and failure. It distinguishes verified, retained and unavailable ticker coverage; reports periods and missing-field classifications; and annotates source success older than 72 hours, prices older than seven days, financial periods older than 400 days and zero refreshed non-news records. Expected partial publisher coverage remains visible without making every restricted source a fatal error. A failed collection explicitly marks the summary as potentially describing the previous published snapshot.

Supabase remains a separate daily heartbeat. Its always-running summary confirms a successful heartbeat only when the health step succeeds, and points to the latest successful run when it fails. Scheduled times are targets: GitHub can delay or disable schedules. Repository maintainers should inspect failed runs and prolonged gaps.

## Weekly Research Calendar synchronization

`.github/workflows/research-calendar-sync.yml` runs **Tuesdays at 03:17 UTC / 11:17 Asia/Taipei**, searching 30 days backward and 90 days forward in the New York calendar by default. Its sources, limitations and admission rules are documented in [Calendar automation](calendar-automation.md). This workflow is independent of the daily infrastructure-news/event feed and cannot publish snapshot or report files.

- **dry-run** (default manual mode) produces `registry.json` and `review.json` workflow artifacts without committing changes.
- **review** can create or reuse a candidate-evidence PR when unresolved source evidence exists and repository settings permit it. The PR documents candidates without adding them to the live registry; otherwise review the workflow artifact.
- **verified** is the scheduled mode and may publish strictly verified additions, reschedules or cancellations only when `ENABLE_CALENDAR_AUTO_PUBLISH=true`. The maintainer confirmed this variable is set to `true` on 2026-11-11, but the first live scheduled publication was not independently verified at the time of this documentation update. The optional review PR workflow additionally depends on GitHub pull-request permissions.

A successful calendar-only commit updates `src/data/researchCatalysts.json` and dispatches Pages with `reason=application`; a normal merged registry PR uses the existing `main` push deployment. Because `GITHUB_TOKEN`-authored pushes do not start another push workflow, the explicit dispatch is necessary. Verify the downstream Pages job before claiming that the online calendar reflects the new data. Source outages or missing listings are not cancellation evidence. On deployment failure after commit, retry Pages with `reason=application` rather than writing duplicate calendar changes.

## Dependency checks

The PR job is named **Dependency security gate**, matching its blocking behavior. It audits the lockfile using fresh build/exposure evidence from the prerequisite job, without a second installation. Monday 11:11 Asia/Taipei builds and checks exposure before auditing, while skipping full regressions and snapshot-age acceptance. Dependabot checks npm updates Monday at 04:17 and GitHub Actions updates at 04:47 Asia/Taipei, grouping compatible minor/patch npm updates and action updates separately; major npm updates remain separate for review. Action references remain pinned to immutable commit hashes.

The gate blocks unapproved high findings and every critical finding. There are no active exceptions following the October 28 review; the former braces advisory was withdrawn and its approval retired. Raw findings remain reported; there is no blanket exclusion or `continue-on-error`. Pages applies the same exposure/security policy after its production build and before artifact upload. Any future exception must satisfy exact identity, expiry and fresh-proof validation. See [security policy](security-exception-policy.md).

Workflow safety tests exercise real temporary Git remotes, including concurrent collection, rejected-push recovery, permission failure, ownership checks and bounded retries. YAML guards also check shared regression gates, manual snapshot verification and scheduled Lighthouse behavior.

## Current implementation evidence — 2026-11-11

- [Calendar Enhancement PR #55](https://github.com/LEO0331/Gridline/pull/55) was merged; its [PR quality and dependency gates](https://github.com/LEO0331/Gridline/actions/runs/42930306351) and [Pages application deployment](https://github.com/LEO0331/Gridline/actions/runs/42930340946) succeeded. These establish merge/build/deployment, not a completed scheduled calendar synchronization.
- At the documentation update, the versioned research-report archive held a first genuine **2026-11-10 NYSE** daily edition. Weekly synthesis requires at least two distinct retained trading sessions. The archive grows only on eligible validated publications, so edition counts may change over time.
- The deployment's snapshot acceptance reported **0 blockers and 2 partial-source warnings**. Historical evidence and source-check timestamps remain separate; consult current Data Health and Actions logs for live status.

## Historical completion evidence — 2026-10-12

- Clean npm 10 installation succeeded. All 356 tests and production build passed locally; the shared regression gate and build also passed on GitHub Node 22.
- [Application deployment](https://github.com/LEO0331/Gridline/actions/runs/38213625265) passed verification, snapshot acceptance, publication and Lighthouse.
- [Live data refresh](https://github.com/LEO0331/Gridline/actions/runs/38213644942) succeeded without a dependency-install step, published both snapshot artifacts and ran the source coverage summary. Public readiness has zero blockers, with the existing disclosed partial event/news warnings.
- [Snapshot deployment](https://github.com/LEO0331/Gridline/actions/runs/38213864989) passed the same regression/build gate and publication, with Lighthouse explicitly skipped.
- [Supabase heartbeat](https://github.com/LEO0331/Gridline/actions/runs/38213648824) and its summary succeeded.
- [Manual quality workflow](https://github.com/LEO0331/Gridline/actions/runs/38213648752) passed tests/build. Its separate dependency security gate failed on the documented unpatched findings, as required by the retained high/critical threshold.
- Timed weekly execution will be observed on its next scheduled run. No scheduled event was fabricated for validation; workflow guards cover its skip-publication condition.

## Security-policy completion — 2026-10-13

All 380 tests, the fresh exposure-artifact transfer, the dependency policy job, Pages publication and Lighthouse passed on GitHub under the then-approved braces exception. This is historical evidence; the [current security-policy report](security-exception-policy.md) records its retirement and current outstanding findings.
