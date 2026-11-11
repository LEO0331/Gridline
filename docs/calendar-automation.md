# Research Calendar automation

**Sync Research Calendar** runs Tuesdays at **03:17 UTC / 11:17 Asia/Taipei**. It scans 30 preceding and 90 upcoming New York calendar days by default. Manual runs can use 0–60 preceding days and 1–180 upcoming days. The workflow runs on Node 22 and keeps the calendar registry separate from market snapshots and historical reports.

## Run and review

In Actions, open **Sync Research Calendar**, choose **Run workflow** on `main`, and select a mode.

- **dry-run** uploads the proposed registry and the review report.
- **review** also attempts a review PR when there are unresolved candidates and repository settings allow it.
- **verified** also publishes accepted changes when `ENABLE_CALENDAR_AUTO_PUBLISH=true`. Scheduled runs use this mode.

For a local read-only check, run `node scripts/sync-research-calendar.js --mode dry-run --output <directory>`. The output contains `registry.json` and `review.json`. The report lists source checks, classifications, candidate dates or original date labels, checked source URLs, evidence fields, reasons, and any existing matching record. The official links are the evidence to review. For unsupported or conflicting candidates, a reviewer must establish the schedule and correct the registry through a normal PR. The automatically generated review PR contains a Markdown evidence proposal. It has no registry edits.

Identical unresolved candidate sets reuse the same deterministic branch and PR across scans. A change in evidence can create a new review set. When repository settings deny PR creation, the run summary points to the structured artifact.

## Approved inputs and verification

| Publisher | Source-specific rule |
| --- | --- |
| BLS | The official iCalendar feed binds a release family to an explicit date or timezone and either the reporting month or an official occurrence UUID. A cancellation requires an explicit cancellation status. An automatic date change requires an explicit rescheduling label and the matching occurrence. |
| BEA | The release schedule table binds its displayed year, typed release date and time, and GDP or personal-income reporting period. Ambiguous dates and status changes go to review. |
| Federal Reserve | The annual FOMC panel must contain eight regular, chronological meetings. Meeting identity uses the annual occurrence order and preserves existing registry IDs. Future tentative dates require the publisher’s explicit notice. |
| Nebius | The issuer’s structured investor events index must bind an official event ID and explicit timestamp to the earnings webcast or investor presentation. Changed dates and ambiguous status go to review. |
| Broadcom | The issuer event widget binds a fiscal quarter to its matching conference-call entry and explicit EST or EDT time. Ambiguous dates and status go to review. |
| CoreWeave | Official investor event listings provide review candidates when the publisher returns a supported server-rendered listing. |
| Other tracked issuers | Existing issuer-bound newsroom URLs provide up to three review candidates per listing when schedule announcement headlines qualify. Oracle uses the corporate newsroom. |
| Loudoun County | The official planning timeline provides review candidates for grid and permitting work. A calendar occurrence can qualify automatically when its exact county detail page binds the occurrence URL, explicit structured event status and date, and a named grid, permitting, or data-center milestone. Unsupported detail and quarter or month targets stay in review. |

The configured reader restricts requests to exact reviewed URLs and the bounded Loudoun calendar detail path. It rejects redirects, limits responses to 2 MiB, uses a seven-second request deadline, and permits at most one retry for transient failures. A source may receive up to four detail requests. The workflow uses a five-minute discovery budget. PJM, ERCOT, Oracle Investor Relations, and FERC are outside the calendar configuration. An additional provider needs an approved URL scope, representative parser fixtures, and access evidence from the intended runner.

## Updates, retention, and provenance

Schedule reconciliation requires matching identities and associations. Conflicting official dates, dates that change without explicit revision evidence, cancellations without an existing occurrence, and unsupported status transitions go to review. A verified rescheduling keeps the ID and previous start when the start changes. A verified cancellation keeps the scheduled date and links to the checked cancellation evidence. Absent entries and outages leave existing events in place.

An accepted automated addition or material update records `verifiedAt`, `verificationMethod`, and `verificationSourceUrl`. Existing `reviewedAt` values remain historical. Successful source access and unchanged confirmations are visible in the scan artifact. The calendar displays the latest verification recorded on an accepted event. When a vetted translation is unavailable, it labels the original-language title.

Retention runs with a material registry update. Events whose latest schedule date and automated verification are both older than 180 calendar days are pruned. A canceled event remains visible in the full calendar while retained and is excluded from the upcoming preview. A passed date retains its unverified outcome unless there is separately reviewed evidence.

## GitHub and Pages

Discovery uses a read-only token. Publication needs `contents: write`, `actions: write`, `ENABLE_CALENDAR_AUTO_PUBLISH=true`, and repository rules that permit the workflow token to push a normal fast-forward to `main`. Review PRs need `contents: write`, `pull-requests: write`, and the repository setting allowing Actions to create pull requests. Set `ENABLE_CALENDAR_REVIEW_PRS=false` to use artifacts alone.

The publisher validates the proposed registry and runs `npm run verify`, `npm run demo:check`, and Git whitespace checks. It owns only `src/data/researchCatalysts.json`. It can retry against a newer snapshot-only revision, with a limit of three attempts. A concurrent registry or code change requires a fresh discovery run. Branch protections apply to every push.

After a successful push, the workflow dispatches **Deploy to GitHub Pages** with reason `application`. The Pages job rebuilds the bundled calendar and runs its existing acceptance and security gates. A human-approved registry PR merged into `main` uses the normal Pages push trigger. If dispatch fails after the registry is accepted, rerun **Deploy to GitHub Pages** on `main` with reason `application`. Check the Pages run before reporting a site update.

## 繁體中文

「Sync Research Calendar」每週二台北時間 11:17 執行。預設查閱前 30 天及未來 90 天的官方時程。手動選擇 `dry-run` 可取得建議登錄檔與審閱報告。來源證據不足時可由人工檢查；只有符合來源驗證及發布條件的更新才會進入日曆。人工審閱日期與自動驗證時間分開記錄。已取消的事件仍可在完整日曆查閱，並從近期預覽排除。

## Verification on 2026-11-11

- A local read-only scan checked 21 of 26 endpoints, proposed five additions from BLS and BEA, confirmed eight existing records, and routed 17 candidates to review. CoreWeave, Iron Mountain, and Vertiv returned HTTP 403. Cipher Digital and Digital Realty returned HTTP 404. Loudoun planning supplied review candidates and its calendar had no matching event listing. The dry run found no verified live rescheduling, cancellation, or infrastructure addition. Those paths were exercised with synthetic fixtures.
- `npm run verify` passed 569 tests, including 290 frontend, 194 backend, and 41 workflow tests. The production build compiled successfully. `npm run demo:check` passed with zero blockers and two existing snapshot warnings for partial event and company-research coverage. `git diff --check` passed.
- Local Chrome verified Week, Month, and Agenda in both languages at 320, 390, 768, 1024, and 1440 pixels. Checks covered synthetic schedule states, keyboard focus, official evidence links, category filtering, Taipei conversion, and existing routes. The browser recorded no page overflow or JavaScript errors. Manual screen-reader testing and GitHub-hosted execution are unverified.
