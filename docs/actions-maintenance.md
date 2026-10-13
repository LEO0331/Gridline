# GitHub Actions operation

The six repository workflows have separate purposes. The ten visible Actions sidebar entries also include three historical workflows whose files were removed (auth-test capture and two temporary lockfile generators) and GitHub-managed Dependabot Updates. Historical entries do not represent active scheduled jobs. Dependabot's weekly configuration is `.github/dependabot.yml`.

| Workflow | Trigger / purpose |
| --- | --- |
| Deploy to GitHub Pages | Relevant `main` pushes/manual publication; Monday 10:37 Asia/Taipei Lighthouse-only audit. |
| Refresh daily dashboard snapshot | Daily 06:17 Asia/Taipei (22:17 UTC on the preceding date); manual full or company-coverage refresh. |
| Pull request quality gate | PR/manual tests/build; Monday 11:11 Asia/Taipei fresh build/exposure verification and dependency audit. |
| Check Supabase database health | Daily 14:43 Asia/Taipei; manual heartbeat. |
| Check official event source access | Manual diagnostic with optional inactive-source/article probes. |
| Audit SEC issuer fact tags | Manual diagnostic for one ticker, a comma-separated list, or `ALL`. |

## Verification and publication

Pull requests and every production deployment run the shared `.github/actions/verify` action. It checks development-server compatibility, workflow safety/reporting, backend behavior, Supabase health-check behavior and frontend behavior. Public snapshot acceptance and production build must also pass before Pages publication. A manual `reason=snapshot` changes Lighthouse selection only; it does not bypass verification. Publication is restricted to `main`.

Documentation-only and tracked build-output-only pushes do not deploy. Application changes run three Lighthouse audits after deployment. Snapshot-only publication skips that expensive audit. Monday at 10:37 Asia/Taipei, the existing Pages workflow audits the deployed site without rebuilding or publishing it. An active publication completes before the latest queued run starts.

## Daily snapshot refresh

The daily data pipeline uses Node 22 built-ins and repository modules; it does not install the React dependency tree. It still runs snapshot consistency/readiness validation before publication. Git author identity is configured before `scripts/publish-snapshot.js` runs.

The publisher requires a clean tracked `main` checkout and no unpublished local commits. Up to three attempts collect and validate data against the latest remote state. Concurrent updates discard only the two generated snapshot files, fast-forward, and regenerate. A rejected push may undo only the script's verified snapshot-only commit before regenerating. Permission, validation, unrelated-change and divergent-history errors stop the job. It never force-pushes or blindly rebases snapshots.

The source summary runs on success and failure. It distinguishes verified, retained and unavailable ticker coverage; reports periods and missing-field classifications; and annotates source success older than 72 hours, prices older than seven days, financial periods older than 400 days and zero refreshed non-news records. Expected partial publisher coverage remains visible without making every restricted source a fatal error. A failed collection explicitly marks the summary as potentially describing the previous published snapshot.

Supabase remains a separate daily heartbeat. Its always-running summary confirms a successful heartbeat only when the health step succeeds, and points to the latest successful run when it fails. Scheduled times are targets: GitHub can delay or disable schedules. Repository maintainers should inspect failed runs and prolonged gaps.

## Dependency checks

The PR job is named **Dependency security gate**, matching its blocking behavior. It audits the lockfile using fresh build/exposure evidence from the prerequisite job, without a second installation. Monday 11:11 Asia/Taipei builds and checks exposure before auditing, while skipping full regressions and snapshot-age acceptance. Dependabot checks npm updates Monday at 04:17 and GitHub Actions updates at 04:47 Asia/Taipei, grouping compatible minor/patch npm updates and action updates separately; major npm updates remain separate for review. Action references remain pinned to immutable commit hashes.

The gate blocks new or changed high findings and every critical finding. One exact, owner-approved `braces@3.0.3` risk exception expires at 2026-11-11 00:00 Asia/Taipei and requires fresh matching exposure proof. Raw findings remain reported; there is no blanket exclusion or `continue-on-error`. Pages applies the same exposure/security policy after its production build and before artifact upload. An expired exception blocks publication as well as PR/weekly checks. See [security policy](security-exception-policy.md).

Workflow safety tests exercise real temporary Git remotes, including concurrent collection, rejected-push recovery, permission failure, ownership checks and bounded retries. YAML guards also check shared regression gates, manual snapshot verification and scheduled Lighthouse behavior.

## Historical completion evidence — 2026-10-12

- Clean npm 10 installation succeeded. All 356 tests and production build passed locally; the shared regression gate and build also passed on GitHub Node 22.
- [Application deployment](https://github.com/LEO0331/Gridline/actions/runs/38213625265) passed verification, snapshot acceptance, publication and Lighthouse.
- [Live data refresh](https://github.com/LEO0331/Gridline/actions/runs/38213644942) succeeded without a dependency-install step, published both snapshot artifacts and ran the source coverage summary. Public readiness has zero blockers, with the existing disclosed partial event/news warnings.
- [Snapshot deployment](https://github.com/LEO0331/Gridline/actions/runs/38213864989) passed the same regression/build gate and publication, with Lighthouse explicitly skipped.
- [Supabase heartbeat](https://github.com/LEO0331/Gridline/actions/runs/38213648824) and its summary succeeded.
- [Manual quality workflow](https://github.com/LEO0331/Gridline/actions/runs/38213648752) passed tests/build. Its separate dependency security gate failed on the documented unpatched findings, as required by the retained high/critical threshold.
- Timed weekly execution will be observed on its next scheduled run. No scheduled event was fabricated for validation; workflow guards cover its skip-publication condition.

## Security-policy completion — 2026-10-13

The [current security-policy report](security-exception-policy.md) supersedes the historical unconditional audit failure above. All 380 tests, the fresh exposure-artifact transfer, the dependency policy job, Pages publication and Lighthouse passed on GitHub. The owner-approved `braces` exception expires at 2026-11-11 00:00 Asia/Taipei; the raw vulnerable findings remain visible. The [replacement experiment](build-tool-remediation.md) passed a clean candidate audit/build and 165 frontend tests, but is not the production toolchain.
