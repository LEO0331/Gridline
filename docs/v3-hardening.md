# Gridline v3.0 hardening review — 2026-10-28

## Production evidence

The latest main revision inspected was `3c7f84de6354acb4148e62bd6cc5c2af39b19297`. [Pages run 40609721800](https://github.com/LEO0331/Gridline/actions/runs/40609721800) succeeded, including the existing deployment gates. Direct HTTP smoke checks from this execution environment could not reach the Pages host; live visual/account checks remain a manual review item.

Both committed artifacts have publication time `2026-10-27T22:11:17.774Z`, 20 company tickers and **no SPY or QQQ observations**. The full snapshot has 260 closes per company; the compact snapshot has 120. Do not interpret absent benchmark values as zero performance. Benchmark readiness is warning-only, separate from the company universe. It reports current-session, continuous-source and 21/61-observation coverage in snapshot acceptance and bilingual Data Health. Failed updates retain existing observations and their original dates.

A separate real-provider probe through the existing adapter returned 260 Yahoo Finance closes each for SPY and QQQ through October 27 (520 observations total). Evidence remains local under `.omx/research/benchmark-provider-probe.json`; it was not inserted into published artifacts or used to advance publication dates. Existing daily publication and price-retry paths include both benchmarks and can publish actual source results on their next run.

## Research validation

Current published benchmark comparisons are unavailable. For validation only, combining the separate real Yahoo benchmark probe with the full company history yields matching-provider endpoints through October 27: NBIS relative to SPY is -28.8938 pp over 20 shared sessions (September 29–October 27) and -21.3915 pp over 60 (August 3–October 27). QQQ differences are -25.9189 and -22.8344 pp. These are sourced closing-price differences, not RSI, rankings or evidence of predictive skill. Shared missing dates can extend the calendar interval; consistent provider identity does not prove split/dividend adjustment compatibility.

Market Context now excludes known retrieval dates after publication before selecting daily revisions, matching benchmark readiness and v2 cutoffs. Records with unknown retrieval dates remain usable but cannot prove availability at the historical publication time. The NYSE holiday calendar currently covers 2026–2028; extending operational use beyond that range requires calendar maintenance.

With default v2 assumptions, full-history completed trade counts across the 20 tickers are MA 9–13 and momentum 4–9; compact-history counts are MA 3–6 and momentum 0–4. APLD has no completed compact momentum trades. Chronological momentum samples are often only 0–1 trades out of sample. NBIS full history has 12 MA and 9 momentum trades; the out-of-sample periods have 3 and 2 respectively. All remain descriptive small samples.

The UI distinguishes insufficient history, no completed trades and low samples in both the main result and chronological periods. Fewer than 20 completed trades triggers a display caution; 20 is a disclosure convention, not a statistical validation boundary. Unsupported history does not produce an equity curve or a one-date benchmark return. Signal rules, execution timing, capital accounting, costs, v2 version and v1 behavior are preserved.

## Dependencies and gates

`qs` 6.16.0 → 6.16.1; `serialize-javascript` 7.0.5 → 7.1.4. The existing overrides are updated without introducing dependencies or changing react-scripts 5.0.1. Node 22 in CI meets serializer's Node >=20 requirement.

Local validation passed: clean `npm ci --no-audit --no-fund`; `npm run verify` (241 Node tests, 35 frontend suites / 187 tests, optimized production build); `npm run demo:check` (zero blockers, four nonblocking warnings); fresh production dependency exposure verification; and live `npm run security:audit` (14 low entries, zero moderate/high/critical, no accepted exceptions). The draft PR records the current GitHub CI result as well. Dependency deprecations and Node's SQLite/legacy API notices remain visible.

The braces exception is retired because its advisory was withdrawn, not because braces was patched. Exact exception machinery and fresh exposure checks remain tested. The remaining unpatched originating advisory is low-severity deepmerge GHSA-gcqx-w48m-w2h4; its latest published release is also affected. See [security policy](security-exception-policy.md). Deprecation notices in the current build toolchain remain a maintenance limitation.

## Manual review after merge

- Confirm real SPY/QQQ rows appear in both artifacts after the next normal snapshot publication, with original retrieval dates, current completed sessions and consistent source histories.
- Inspect bilingual Market Context, Data Health and both backtest versions. Check unavailable and low-sample states, chronological counts and account sign-in/preferences.
- Confirm Pages deployment from the merged revision and perform a browser smoke check; no deployment is performed from this feature branch.
- Recheck the registry audit and remaining deepmerge advisory; do not restore the withdrawn exception or bypass exposure/security gates.

## 繁體中文摘要

本次只強化既有 v3 功能。最新成功部署對應的完整與精簡快照仍缺少 SPY、QQQ；缺失會顯示警告，不阻擋其他公司研究。另以既有來源介面取得真實 Yahoo 基準資料供驗證，未改寫公開快照、價格或發布日期。下一次正常發布後須確認兩種快照的基準涵蓋與時效。

回測主結果與時間分割期間會明確顯示歷史不足、沒有完成交易及小樣本。20 筆交易門檻僅用於提醒，不代表統計有效或歷史預測能力。保留既有策略、成本、成交假設及 v1。價格調整、供應商修訂、缺失交易日及精簡歷史長度仍限制解讀。

更新 qs 與 serialize-javascript 的既有覆寫並驗證乾淨安裝；不降級建置工具。braces 公告已撤回，因此移除將於 11 月 11 日到期的有效例外，保留測試用歷史範例與所有安全閘門。deepmerge 仍有低風險未修補公告，需持續追蹤。合併後由使用者確認部署、雙語介面與帳戶流程。
