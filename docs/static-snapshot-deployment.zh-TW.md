# 靜態每日快照部署

## 流程

Gridline 將**資料更新**與**網站部署**分開處理。

1. `Refresh daily dashboard snapshot` 排程於每日台北時間 06:17（前一日 `22:17 UTC`）啟動，也可用 `workflow_dispatch` 手動選擇 `all` 或 `company-coverage`。GitHub 排程可能延遲，請以快照內的 `generatedAt` 為準。
2. Node 22 工作直接執行 `scripts/publish-snapshot.js`，不安裝前端相依套件。發布程式呼叫快照產生器，依序更新已設定的來源並採有限重試。只重試可重試的失敗 ticker；被拒絕的公司來源進入冷卻期，不由外層反覆重試。事件來源使用自己的有限重試政策。
3. 股價歷史會逐一檢查每個 ticker。Stooq 是示範用主要來源，Yahoo Finance chart 資料作為備援。空資料、過舊、筆數不足或 ticker 涵蓋不完整都視為 `degraded`，不會當成成功。週末及休市日只有在每個追蹤 ticker 都已有至少 60 筆有效且有來源的收盤價，並包含最新應有 NYSE 交易日時，才跳過價格請求；否則會補抓。最新應有收盤日的準備度 gate 不會放寬。
4. 成功 ticker 的結果會取代其對應來源的觀察值；降級 ticker／來源保留上次成功資料，避免空結果把歷史洗掉。逐次發現的基礎設施事件及公司公告即使檢查成功仍會累積保留，來源游標與先前驗證日期也會保留。
5. 產生器寫入 **schemaVersion 4** 的 `public/data/dashboard-snapshot.json`，內容包含來源健康狀態、更新結果、觀察值、版本化分數、`companyHistory`、`backtestCoverage`，以及精簡的 `demoReadiness` 摘要，並同步產生相符的執行期精簡版 `dashboard-overview.json`。
6. 在提交檔案前，workflow 會執行 `npm run demo:check` 驗證示範關鍵條件。若存在 blocker，更新 workflow 會失敗，現有公開快照維持不變。
7. 產生的快照 artifact 有變更且通過 gate 後，發布程式才提交到 `main`。它要求乾淨的已追蹤工作目錄且無未發布 commit。最多三次發布嘗試會偵測同時發生的 `main` 更新，只捨棄產生的快照變更、快轉並重新產生；push 被拒絕時只可撤銷程式自身已驗證、僅含快照的 commit。權限、驗證或歷史衝突會中止，不會 force-push。
8. 接著由 refresh workflow **明確 dispatch** `Deploy to GitHub Pages` 的 `workflow_dispatch`。這一步是必要的，因為使用 repository `GITHUB_TOKEN` 產生的 push 不會自動觸發另一個 push-based workflow。
9. Pages workflow 從更新後的 `main` 依 lockfile 安裝，執行共用回歸測試與快照準備度檢查，再建置 React 及部署 Pages artifact。僅更新快照的部署跳過 Lighthouse，應用程式部署則執行。僅修改文件／已追蹤 build 輸出的 push 不部署。每週一台北時間 10:37 的 Pages 排程只以 Lighthouse 檢查已部署網站，不重新建置或發布。

無論更新成功或失敗，都會產生工作摘要，揭露來源／ticker 涵蓋、保留證據、缺少財務欄位分類及新鮮度警示。收集失敗時會明確標示摘要可能描述的是先前已發布快照。發布保護及排程詳見 [Actions 維運說明](actions-maintenance.md)。

上傳部署 artifact 前，Pages 也會驗證新的 production source maps／執行期依賴路徑，並套用[安全例外政策](security-exception-policy.md)。唯一接受的 `braces` 風險於台北時間 2026-11-11 00:00 到期；新的／已變更的高風險弱點、任何嚴重弱點、無效稽核結果或過期／缺少的證據都會阻擋發布。僅更新快照的 dispatch 不會略過這些檢查。

因此「snapshot commit 已成功」**不等於** GitHub Pages 已更新。請確認後續的 `Deploy to GitHub Pages` workflow 也有執行成功，或比對部署網站 `#health` 的產生時間是否已更新。

## 成功更新時會改變哪些內容

Action 每次都會寫入新的 `generatedAt` 以及各來源的執行結果與健康狀態。成功 ticker 的結果會更新其來源觀察值；降級結果保留先前可用資料，並更新檢查時間與錯誤狀態。事件及公司公告保留逐次累積的歷史。之後計算有來源的 MA5/MA10 市場訊號、只保留 v2 實際記錄歷史，並重新評估示範準備度。價格及 EIA 資料在對應來源成功時更新；手動 `company-coverage` 僅更新 `sec,company-research`，保留價格／電網資料，仍須通過完整快照 gate。

儀表板的快照日期直接讀取已部署 JSON 的 `generatedAt`，並以瀏覽者的本地時區顯示；資料健康頁仍會顯示精確 UTC 時間。`generatedAt` 代表檔案產生時間；各筆資料自己的 `observedAt` 才是市場或營運資料的實際觀察日期。

舊版擴張／阻力指數、人工設定驅動數值、區域 MW／階段／阻力估計及公司基本面／曝險分數已從使用中畫面及新匯出資料移除。若缺乏有日期的一級來源觀察值，介面會顯示無資料。

歷史背景：2026-09-22 快照的舊 SEC 數值及 EIA `rtoLoad` 曾因完整性問題下架；後續修正後的更新已恢復具日期的 SEC 及 EIA 資料，當時的降級狀態並非目前涵蓋。20 家公司目前都有 SEC 營收／EPS 與個別研究資訊；財務補齊已恢復 15 個原缺少的負債／資本支出欄位，其餘五個明確標示未單獨揭露。實際狀態請看目前快照健康資料及[公司研究涵蓋說明](company-research-coverage.md)。

事件頁使用獨立的基礎設施事件流程：目前排程從 Loudoun County News RSS（列表備援）、Oracle 公司新聞室及 Texas Governor 新聞 RSS／列表尋找候選紀錄，也讀取 `server/event-candidates.json` 中的精確網址，目前包含兩筆 Loudoun 文章及一筆 Texas Governor 政策文章。PJM、ERCOT 及 Oracle 投資人新聞依使用者要求維持暫停；每日工作不請求其端點或候選紀錄，先前已驗證紀錄則保留原日期。Texas Governor 不會改標成 ERCOT，Oracle 公司新聞也不代表恢復投資人新聞。未啟用的 Oracle OCI Blog／FERC 僅供診斷，詳見[事件探索](event-discovery.md)及[來源決策紀錄](event-source-decisions.md)。

候選紀錄須具已知一級來源網域、特定文章路徑、發布日期、相關分類及區域，而且頁面可存取、標題及發布證據相符。失敗檢查會列為排除，不產生公開事件。獨立的公司研究流程可使用綁定申報公司的 SEC 公告；SEC 申報不會自動變成基礎設施事件。

事件發布後 30 天內顯示於「目前紀錄」，之後顯示於「封存」。兩者是同一批持久紀錄的不同檢視方式。成功更新會在靜態快照與 SQLite 中保留較舊事件及修訂版本；部分來源受限時整體涵蓋標示部分，全部無法取得時標示降級，仍保留上次成功事件及各來源成功日期。歷史 `public/data/event-review.json` 仍記錄 2026-09-23 審查的三個頁面，涵蓋至 2026-09-22，範圍僅人工候選且未驗證 PJM RSS；它不是目前自動檢查結果。較新的快照事件健康狀態優先，人工審查不改變 `generatedAt`。10 月 12 日快照對啟用的 Loudoun／Oracle／Texas Governor 仍回報部分涵蓋；目前檢查與最後成功日期位於 `sourceHealth.events.coverage.sources`。外部頁面可能在驗證後變動或拒絕存取，封存仍保留原網址及日期。

可在 `server/event-candidates.json` 提供精確一級來源紀錄：啟用的 `source`（`Loudoun`、`Oracle` 公司新聞或 `Texas Governor`）、與頁面標題相符的 `title`、`category`（`POWER`、`GRID`、`PERMIT` 或 `CAPEX`）、ISO 格式 `publishedAt`、`region` 及文章 `url`。新增候選不會啟用已暫停出版來源。事實摘要 `summary` 必須附頁面可見的 `evidenceText` 與 `dateText`，後者須符合發布日期。每日工作會拒絕一般入口頁、不相關網域、無法存取的頁面、標題／日期不符及缺乏支持文字的紀錄；不可填入推測標題或未驗證日期。

## 示範準備度 Gate

每日 workflow 要發布公開快照前，必須通過以下關鍵條件：

- 快照 schema 為 v4 或更新版本；
- `generatedAt`、`companyHistory`、`backtestCoverage` 與公司分數方法論版本存在；
- 啟用的 `trackedTickers` 須為支援 20 標的的非空、不重複子集合；每個 ticker 至少有 60 筆正值、具日期與 HTTPS 來源的日收盤資料，且包含最新應有 NYSE 交易日（紐約時間下午 4:15 起要求當日收盤，其餘時間要求前一交易日，跳過週末及休市日），最新價格亦不可超過十天；
- 除事件來源可合法回傳零筆外，其餘來源不得在 `recordCount = 0` 時標示為 `ok`；
- 不再要求或匯出歷史重建資料。

完整／精簡快照須相符；若存在具日期的事件審查檔案，須通過範圍、日期及 HTTPS 檢查。公司分數僅能使用已公布的價格訊號方法，不可帶有人工基本面／曝險分數。快照超過 96 小時會警示。目前公開快照啟用全部 20 標的：NBIS、CRWV、ORCL、AVGO、APLD、IREN、CIFR、CORZ、GDS、VNET、EQIX、DLR、IRM、VRT、ETN、ANET、PWR、GEV、CEG、BE。

若選用來源降級，但保留下來的快照仍滿足上述關鍵資料需求，會被視為**警示**而不是自動阻擋。這樣可以如實揭露 partial-data 狀態，同時保留仍有價值的示範環境。

本機可執行同一個 gate：

```bash
npm run demo:check
```

若要先跑測試／建置，再檢查目前的靜態快照：

```bash
npm run verify:demo
```

如果 repository 內仍是舊快照或刻意不完整的快照，`verify:demo` 失敗是預期結果。要驗證完整端到端示範狀態時，請先產生最新快照。

## 設定

在 repository 的 **Settings → Secrets and variables → Actions** 加入你實際要使用的 provider 設定：

- `SEC_USER_AGENT`
- `EIA_API_KEY`
- `PJM_API_KEY`
- `FERC_API_KEY`
- 選用的 `COMPANY_IR_FEEDS`

目前示範用市場價格來源不需要 repository secret。若正式部署改用核准／授權的供應商，可在其他部署 profile 覆寫 `PRICE_BASE_URL` 與 `PRICE_FALLBACK_BASE_URL`。

Supabase 變數供 Pages build 設定選用帳戶功能，也供獨立每日資料庫健康檢查使用：

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_PUBLISHABLE_KEY`

公開研究儀表板與每日快照更新都不依賴登入功能。既有專案已套用擴充追蹤清單與健康函式 migration。新專案請先套用 `supabase/user-preferences.sql`（已支援全部 20 標的），再套用 `20261008_add_database_health.sql` 建立健康端點。`20261008_expand_watchlist.sql` 用於升級舊四標的限制；由目前 schema 建立的新表不必重複套用。詳見 [Supabase 健康檢查](supabase-health-check.md)。

## 失敗處理

Gridline 在資料邊界採 fail-closed：

- HTTP 成功但沒有可用觀察值，仍視為降級，不視為成功；
- 來源失敗／降級不會刪除上次成功的靜態歷史；
- 若保留資料仍符合示範關鍵 gate，可帶著明確警示發布；
- 若缺少市場歷史、schema-v4 時點資料或其他關鍵條件，`demo:check` 會在提交快照前失敗；
- 若整個 snapshot script 失敗，workflow 也會失敗，現有公開 artifact 維持不變；
- 若 snapshot commit 成功但 Pages dispatch 失敗，repository 已有新資料，但公開網站仍維持舊 build。此時手動重跑 `Deploy to GitHub Pages`，並檢查 dispatch step。

可由主要導覽的 **資料狀態**（`#health`）檢查部署網站實際正在使用的 snapshot。
