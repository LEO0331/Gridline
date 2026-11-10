# Research Reports

Open **Research Reports** at `#reports`. Daily view lists retained editions by NYSE session and shows the snapshot generation timestamp separately. Weekly view uses Monday through Sunday in New York. The theme filter uses Gridline’s existing themes. Company, Overview, Thematic Research, and Calendar links open the current research workspaces. Source links retain the exact URLs saved with the edition.

## What an edition records

An edition is a compact projection of a validated full snapshot at its generation cutoff. It contains sourced closing prices, recorded trend states, dated company developments and infrastructure evidence, selected SEC facts, source health, and a few deterministic follow-up questions. Its snapshot diff keeps the actual previous and current publication timestamps. An unchanged price on a new observation date and a change in numerical price are distinct observations. A snapshot diff can span multiple sessions or part of one session.

The exporter uses existing market sessions and recorded methods. Reporting keeps observed time, retrieval, publication, filing, review, economic period, and generation separate. Evidence with dates beyond the cutoff is excluded. A retained observation keeps its original date and provenance. Financial amounts keep native units, source classifications, and definitions. The archive is separate from the current schedule registry and from later manual source checks. A past question remains a question unless a separately verified outcome establishes an answer.

## Weekly reviews

Weekly coverage counts unique NYSE sessions, using the existing holiday calendar. The latest retained edition supplies a session’s displayed market context. Reviews distinguish elapsed sessions without reports from sessions still pending. Two recorded sessions are required to present a weekly synthesis. A review with gaps is partial. Beyond years covered by the bundled holiday calendar, session counts are provisional. An unexpected closure may require an update to the shared calendar.

Developments and financial evidence are deduplicated by source and record identity. Their publication and filing dates are retained. A record first seen in the retained archive may have been published earlier. Change records keep the edition that carried them. Weekly views display retained evidence and coverage, with no weekly return calculation or cross-company accounting comparison derived from the report sequence.

## Storage and publication

`public/data/research-reports.json` has a versioned envelope with `schemaVersion`, `trimmedEditions`, and an `editions` array. Each edition has a content-derived identity, an actual session and snapshot timestamp, and bounded evidence sections. The archive keeps the latest 60 editions, with validation limits of 128 KiB per edition and 8 MiB for the archive. The oldest editions are removed first and the trimmed count is retained. Trimming leaves the remaining editions intact. The workspace fetches the archive only when opened.

The checked-in bootstrap archive is valid and empty. The first qualifying publication after merge adds the first genuine edition. A report requires a sourced tracked-company close for the expected market session. For a session already observed before archive bootstrap, the first report requires changed market evidence. Later same-session revisions require changed projected evidence. Changed run, retrieval, and check timestamps alone do not create a revision. Earlier editions remain individually selectable while retained.

The archive admits observations with recorded retrieval by the cutoff and eligible source dates. It preserves up to two official developments per company, twelve infrastructure records, and eighty supported diff rows per edition. It also retains dated SEC coverage gaps when the snapshot supplies an audited missing-field classification. Questions prioritize a verified infrastructure addition or update, a recorded trend transition, then an audited financial gap or older retained disclosure. A read-only projection of the November 9 snapshot measured about 108 KiB. The projection was checked in memory and the bootstrap file contains zero editions.

The existing daily publisher validates the previous committed archive and the newly generated full and compact snapshots. It derives and validates the next archive before committing generated artifacts together. Concurrent changes cause the publisher to discard only its owned generated edits, fast-forward, and regenerate against the latest committed archive and snapshot. The retry limit remains three. Failed validation or pushes leave the published artifacts at the previously accepted revision. GitHub Pages and pull request gates also check the archive.

For maintenance, inspect the existing **Refresh daily dashboard snapshot** run and the `research-report-archive` line in `npm run demo:check`. Check the published snapshot timestamp, recorded session, latest edition, and archive validation output when diagnosing a gap. An edition that exceeds the validation budget blocks the candidate publication for review. Preserve the existing archive when repairing input or workflow failures. A schema or projection change requires an explicit compatibility or migration plan. The public archive is bounded, and SQLite and Supabase are separate from it.

## Accessibility

The workspace uses native selectors, buttons, dates, and expandable evidence with source links. Loading, valid empty history, and invalid or unavailable history are separate states. On small screens, the evidence stacks vertically.

## 繁體中文

從導覽列開啟「研究報告」，可選擇日報或週報與研究主題。日報分開標示實際 NYSE 交易日及快照產生時間，保留各版次的資料、原始來源與限制。具日期的收盤價、公司與基礎設施進展、財務申報及來源狀態各自呈現。財務資料保留原始幣別、單位、報告期間與申報日期。

週報以紐約時間週一至週日為界，使用實際保留的日報。每週至少需兩個有報告的交易日才會整理週報，並分開顯示缺漏與尚未到期的交易日。相同證據只列一次，保留原發布日期。研究問題保有當時的證據及待查事項。

初始封存為空，首次符合條件的快照發布才會建立首份日報。既有發布流程同時驗證快照及報告封存；若驗證或推送失敗，線上版本會保留上次成功發布的資料。總覽、主題研究、日曆及公司研究連結會開啟目前的研究工作區。

## Phase 4 verification on 2026-11-10

- `npm run verify` passed 542 tests, including 281 frontend tests, 182 backend tests and 35 workflow tests. The production build compiled successfully. Publisher tests exercised local Git repositories for concurrency recovery and failure handling.
- `npm run demo:check` passed the empty archive, full/compact snapshot parity, and snapshot acceptance. It reported zero blockers and the existing partial event and company-research coverage warnings. `git diff --check` passed.
- Chrome checked Daily and Weekly in both languages at 320, 390, 768, 1024, and 1440 pixels. The checks used the actual empty bootstrap and separate synthetic test editions. Keyboard controls, focus, visible report contrast, evidence links, prior routes, and unavailable or malformed archive states passed. The run recorded no page overflow, JavaScript errors, or provider requests. Manual screen-reader testing was outside this run.
