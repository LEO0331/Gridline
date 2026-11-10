# Thematic Research

Open **Thematic Research** from Overview or the primary navigation at `#themes`. The workspace starts with Neocloud / GPU Cloud. Compare two to four enabled companies in the same theme, in the existing registry order. Themes with up to four enabled companies start with all of them selected. Larger themes start with the first four and show the other available companies in the selector. A theme with fewer than two enabled companies reports the coverage limit and keeps its own membership.

| Reviewed theme | Companies in the full universe |
| --- | --- |
| Neocloud / GPU Cloud | NBIS, CRWV |
| Compute Infrastructure & Transition | APLD, IREN, CIFR, CORZ |
| Networking & AI Hardware | AVGO, ANET |
| Power, Cooling & Grid Infrastructure | VRT, ETN, PWR, GEV, CEG, BE |

Theme and peer selections stay in the workspace when navigating between it and Calendar or Overview during the same dashboard visit. **View company research** intentionally selects the company in the existing Overview and focuses its evidence section when the snapshot is ready. The remaining tracked companies are available through Overview.

## Market comparison

The workspace uses the existing expected NYSE session and Market Context. A source-backed close for that session is current. An earlier retained close keeps its date and provider and is marked separately. MA20 participation reports how many covered members of the **enabled theme** are above their own MA20 and how many theme members have sufficient current data. With zero eligible members, participation is unavailable.

The selected-company panels show the 20- and 60-observed-interval differences in price return versus SPY and QQQ, in percentage points. The model requires 21 or 61 shared closes with a common provider and a current endpoint. Available comparisons show their own dates, provider, source links, and supporting observation IDs. Different company windows are flagged for each benchmark and horizon. Missing observations, insufficient overlap, stale endpoints, and incompatible providers remain explicit. The model computes each company-to-benchmark result independently and provides no peer ranking or common-window return. The underlying method does not establish consistent adjustments or verified total returns. [Market Context methodology](market-context.md)

## Financial comparison

The five supported metrics are revenue, diluted EPS, capital expenditure, current debt, and long-term debt. Values come from the existing SEC research model. Each fact retains its native currency and unit, reported start and end dates or balance-sheet instant, filing date, SEC link, classification, and available accounting and extraction metadata. A reported zero is displayed as zero. A missing or not-separately-reported fact stays missing. Retained and stale facts remain visible with their original evidence.

The comparability indicator requires an available, nonstale report for every selected company, matching native units, the same supported period kind and exact economic dates, and matching reviewed accounting concept metadata. A quarter, annual period, year-to-date period, or instant is evaluated separately. Different currencies, inconsistent definitions and unsupported concept metadata prevent a comparability claim. A matching label alone is insufficient. The workspace displays filed figures without converting currencies, combining debt definitions, or calculating financial ratios. [Company research and SEC coverage](company-research-coverage.md)

## Evidence, questions, and catalysts

Company profiles supply reviewed business roles and research focus. Company developments retain publication, retrieval, automated verification and manual review dates where present. Retained reviewed sources and older records are labeled separately. Company–facility–grid links come only from the existing [relationship register](relationship-evidence.md). The workspace reports gaps when there is no supported relationship. Regional or thematic membership does not establish a link to a project or a change in market price.

The model produces at most one question per selected company and displays up to three overall. It prioritizes a documented relationship, a recorded financial field gap with an SEC audit source, a reviewed company profile risk, then a dated official development. The supporting evidence remains linked. A follow-up question identifies what remains to verify and leaves the outcome open.

The seven-day New York calendar preview uses the same validated schedules and status rules as Phase 2. A company-specific event must explicitly name a selected ticker. A record with a documented theme and no ticker can appear as theme context. The full Calendar opens with the explicit theme filter, which can be changed there. Past dates, canceled schedules, and completed outcomes remain distinct from upcoming active catalysts. [Calendar guide](research-calendar.md)

## Accessibility and extension points

Native selects, checkboxes, buttons, links, and disclosures support keyboard navigation. Comparison layouts use readable per-company content or locally scrollable tables with semantic headers. Evidence retains source links when the UI language changes. Snapshot errors and unavailable data have distinct labels.

The presentation model can supply a future report with the selected context, dated observations, comparability reasons, and separate evidence sections. A future report would need its own explicit publication and retention policy.

## Coverage checked on 2026-11-10

The compact snapshot was generated at 2026-11-09 22:26 UTC. All 14 companies in the four themes had a sourced close for the expected November 9 NYSE session and qualified for all four benchmark comparisons at the time of review. MA20 coverage was 2/2 Neocloud, 4/4 Compute, 2/2 Hardware, and 6/6 Power. These availability figures describe that snapshot and session.

Revenue, diluted EPS, and capital expenditure were available for all 14 theme companies. Current debt was available for 12, and long-term debt for 13. CORZ current debt and ANET current and long-term debt were classified as not separately reported. Under the default selections, the Power group qualified for reported revenue and diluted EPS comparison. Other metric rows had differences in periods or definitions, or lacked sufficient reported values.

## 繁體中文

由總覽或導覽列開啟「主題研究」。預設為新型雲端／GPU 雲端。每個主題可選擇二至四家目前已啟用的公司，依既有公司清單順序排列。若主題內不足兩家公司，會直接標示涵蓋限制。開啟日曆並返回時會保留本次選擇；只有按下查看公司研究時，才會切換總覽所選的公司並將焦點移到公司證據。

市場比較沿用既有 NYSE 交易日和市場背景方法。較早的保留收盤價保有原日期與供應商。MA20 參與情況以該主題具足夠當期資料的公司為分母。相對 SPY／QQQ 的比較使用相同供應商的共同觀察日期，並保留各自期間、涵蓋資料和來源。公司間期間不一致時會標示，並保留每筆結果原有的證據範圍。

財務資料保留原幣別、單位、報告期間、申報日、分類及 SEC 來源。須有相同的經濟期間、單位、已審閱會計概念，且所選公司都有非過舊的有效資料，才會標示為符合比較條件。明確申報為零、未單獨申報、過舊及無資料分別標示。

已發布的公司進展、具文件的設施及電網關係、觀察到的價格與排定的未來時程各自呈現。研究問題以現有證據或已記錄的資料缺口為依據。近期事件只包含明確關聯至所選公司或主題的已審閱時程；總體經濟事件可在完整研究日曆查閱。

## Phase 3 verification on 2026-11-10

- `npm run verify` passed 518 tests, including 271 frontend tests, and compiled the production build.
- `npm run demo:check` accepted the compact and full snapshots with zero blockers and two existing warnings for partial event and company-research coverage.
- Local Chrome checks covered two- and four-company layouts in both languages at 320, 390, 768, 1024, and 1440 pixels. Keyboard selection, evidence disclosure, official source links, company and calendar navigation, existing routes, and snapshot failure passed. The browser recorded no page-level horizontal overflow, JavaScript errors, or live provider requests. Screen-reader output was not manually tested.
