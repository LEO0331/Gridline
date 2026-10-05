# Gridline — 資料中心基礎設施情報

Gridline 是雙語、聚焦特定問題的研究流程：**資料中心建設是否反映在電網需求、專案決策、公司揭露及市場價格上？** 它將具日期的證據與原始來源放在一起，協助研究者檢視四個面向，同時避免把相關性誤當因果關係。

券商平台提供交易功能，[Yahoo Finance](https://finance.yahoo.com/portfolios) 則已有股票清單、市場資料、新聞、圖表及研究資訊。Gridline 的價值在於較聚焦、以來源為先的查證流程：說明每筆紀錄能支持甚麼、上次何時檢查，以及哪些證據仍然不足。它沒有獨家市場資料，也未證明預測能力；不是自動交易系統或投資建議。

公開示範：[Gridline](https://leo0331.github.io/Gridline/)

示範準備度：[繁體中文](docs/demo-readiness.zh-TW.md) · [English](docs/demo-readiness.en.md)  
帳戶設定（選用 Supabase）：[繁體中文](docs/accounts.zh-TW.md) · [English](docs/accounts.en.md)

## 研究流程

| 研究問題 | 目前的證據 | 單靠這項證據不能證明甚麼 |
| --- | --- | --- |
| 電網需求是否變化？ | EIA 公布、日期完整且可比較的 PJM 實際用電資料。 | 區域需求無法單獨辨識資料中心，也不能證明個別專案已取得供電。 |
| 專案是否推進或遇到限制？ | 有日期、經驗證的一級許可、電網及公司來源紀錄，並標示每筆紀錄最近一次成功驗證日期。 | 沒有明確文件連結時，里程碑無法量化容量，也不能歸因於追蹤公司。 |
| 公司揭露了甚麼？ | 標明報告期間、連結至申報文件的 SEC 營收與稀釋每股盈餘（EPS）資料。 | 單一揭露無法證明獲利品質、估值或資料中心建設貢獻。 |
| 市場價格如何變動？ | 具日期的收盤價、描述性趨勢／動能／波動度方法，以及獨立的回溯價格測試。 | 價格走勢無法說明成因，也不能證明未來報酬。 |

先選公司或區域，檢視四個證據面向，再開啟原始紀錄，並到「資料狀態」查看日期與缺口。綜合判斷由研究者作出；儀表板不把不同面向合成買賣分數。新功能若要進入主要流程，必須回答上述其中一個問題，並提供具日期的來源、明確規則及證據界線。

## 這個 Demo 展示什麼

- **基礎設施情報**：區域導覽及有一級來源的里程碑；無來源的容量與階段數值不顯示。
- **四面向證據摘要**：針對所選公司與區域，並列電網需求、專案決策、公司揭露及市場價格，各自標示日期、來源與證據界線。
- **具來源的關係紀錄**：顯示一筆由一級來源支持的 Oracle–阿比林–ERCOT 連結與發布、審查日期；其他公司與專案的關係沒有證據時不推論。
- **價格回溯**：30D / 90D / 1Y 已觀察收盤價；資料不足時明確顯示 unavailable。
- **輕量價格圖表**：原生 SVG 提供 30 / 60 / 90 個交易觀察值區間，使用同一份具日期收盤價、維持單一連續 provider 區段並連回價格來源，同時疊加目前所選技術方法的具日期狀態變化標記。
- **前後快照差異**：每次更新都與前一份已提交快照比較重要的使用者可見變化，包括最新收盤價、已記錄趨勢訊號狀態、已驗證事件新增／更新／封存轉換，以及來源健康狀態。
- **Demo hardening**：明確區分 snapshot 載入／錯誤／空資料狀態與 retry；顯示觀察資料時效；SVG 圖表可用鍵盤逐筆查看；drawer 具焦點管理；提供清楚 focus 狀態、skip navigation，且行動版仍保留主導覽。
- **可稽核 provenance**：deterministic observation ID、provider/source metadata、觀察與擷取日期、來源 URL 與 lineage。
- **可擴充技術訊號**：以共同 registry 支援趨勢／移動平均、RSI 動能與布林通道波動度；保留日期、provider 連續性檢查，並只輸出描述性狀態，不產生買賣結論。
- **持久化歷史**：Node API profile 以 SQLite/WAL 保存不可變觀察值、來源健康狀態、分數快照、情境分析與回測執行紀錄。
- **情境假設（輔助工作表）**：記錄供電、需求、CAPEX、法規的使用者假設，不將假設當成觀察證據或未校準預測。
- **回溯價格測試（方法檢查）**：MA5/MA10 交叉後以下一筆交易日及十筆交易日後收盤價評估，揭露待完成結果與禁止前視偏誤規則；它不是對整體建設論點的回測。
- **資料健康**：`#health` 顯示市場快照新鮮度、來源狀態、價格涵蓋及獨立日期的事件審查。
- **涵蓋例外**：事件頁列出設定來源／候選紀錄的範圍、通過與排除筆數、排除原因，以及各使用中發布者獨立的探索與文章驗證狀態。
- **Fail-closed ingestion**：空白／無效 provider 回應標為 degraded，不視為成功；保留 last-known-good 歷史。
- **雙語研究 UX**：Research Lab 的主要流程支援 English / 繁中。
- **選用帳戶**：Supabase 註冊、登入、密碼恢復與偏好設定已完成 React 專案端實作，但不會阻擋公開研究 demo。
- **工程品質 Gate**：PR 測試／build／audit、snapshot acceptance gate、GitHub Pages 部署與 Lighthouse CI。

設計文件：[資料血緣](docs/data-provenance.md) · [技術訊號方法](docs/signal-methods.md) · [快照差異](docs/snapshot-changes.md) · [Demo hardening](docs/demo-hardening.md) · [Scoring](docs/scoring-methodology.md) · [持久化儲存](docs/persistent-storage.md) · [情境分析](docs/scenario-analysis.md) · [回測](docs/backtesting.md) · [PR CI](docs/pr-ci.md)。

## 目前的證據界線

- 具來源的關係紀錄目前只有一筆 [Oracle 阿比林–ERCOT 紀錄](docs/relationship-evidence.md)，不代表其他追蹤公司已有相同連結。公開快照的 EIA 需求資料涵蓋 PJM，因此 Oracle–ERCOT 連結**不會**產生 ERCOT 需求數值。
- 事件涵蓋設定的來源與候選紀錄，不等於全美所有基礎設施進展。未通過的候選紀錄不會作為已驗證事件發布；較早通過的紀錄仍顯示上次成功驗證日期。
- 情境假設與純價格回測收在**方法與假設**工具中，供研究紀律與方法檢查使用；兩者都不能回答完整建設問題，也不提供預測。

## 系統需求

- Node.js **22+**（API/storage profile 使用 `node:sqlite`）
- 依 repository 已提交的 `package-lock.json` 使用 npm

## 快速啟動

```bash
npm ci
npm run dev
```

`npm run dev` 會同時啟動：

- React UI：`http://localhost:3000/Gridline`
- Research API：`http://localhost:8787`

按 `Ctrl+C` 可一起停止。只開 UI 可用 `npm start`；只開 API 可用 `npm run api`。

Provider 設定請參考 [.env.example](.env.example) 與 [資料擷取 API 說明](docs/api-ingestion.zh-TW.md)。

## 架構

```text
 SEC 申報 / EIA PJM 用電 / 已驗證事件 / 市場價格
                         │
                         ▼
                 公開示範來源 adapter
                         │
                 validate + fail closed
                         │
                         ▼
          normalized observations + provenance
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       SQLite/WAL 歷史          versioned scoring
             │                       │
             └───────────┬───────────┘
                         ▼
                    research API
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        證據視角       方法檢查      稽核查詢
                         │
                         ▼
                     React UI

GitHub Pages profile：
provider refresh → 完整版及精簡版快照 → 一致性與準備度 gate
                → 兩份檔案提交 main → 明確 dispatch Pages workflow
                → Pages build/deploy → Lighthouse CI
```

主要模組：

- `server/sources.js`：公開示範使用 SEC、EIA、事件及市場價格 adapter；PJM Data Miner、FERC 與公司投資人關係 adapter 只屬選用 API 實驗，目前不供應主要研究視角。
- `server/price-history.js`：驗證 Stooq 歷史資料，失敗時使用 Yahoo Finance demo fallback。
- `server/service.js`：cache/source health 與 zero-row fail-closed 行為。
- `server/provenance.js`：deterministic observation identity 與 audit metadata。
- `server/database.js` / `server/store.js`：SQLite schema 與持久化研究歷史。
- `server/scoring/`：有價格來源的 MA5/MA10 訊號；無來源的公司分數為 null。
- `server/scenario-engine.js`：只保存受界定的使用者假設，不產生未校準預測。
- `server/backtest.js` / `src/backtestModel.js`：純價格 MA5/MA10 回溯交叉測試。
- `server/historical-reconstruction.js`：實際紀錄歷史涵蓋摘要；不再產生 v1 重建。
- `server/demo-readiness.js`：公開 snapshot 的驗收條件。
- `src/signals/registry.js`：前端趨勢、動能、波動度方法的共同 contract；最新 provider 資料區段不足時採 fail-closed。
- `src/Components/PriceChart.js` / `src/Components/priceChartModel.js`：不依賴第三方圖表套件的 SVG 價格歷史，與訊號層共用正規化且來源連續的收盤價觀察值。
- `src/Components/chartSignalMarkers.js`：將目前選定的 registered method 具日期事件對應到圖表中同日期的可見觀察值，不在 chart 元件內重算技術指標。
- `server/snapshot-changes.js` / `src/Components/SnapshotChanges.js`：產生 deterministic 前後快照差異，並在總覽提供雙語稽核介面。
- `src/Components/SnapshotLoadState.js` / `src/freshness.js`：明確處理 snapshot lifecycle，並提供共用的市場觀察資料時效呈現。
- `src/DataHealth.js`：營運／示範準備度 workspace。
- `src/ScenarioLab.js` / `src/BacktestLab.js`：研究工作區。

Storage interface 刻意保持窄介面，正式環境要把 SQLite 換成 Postgres 時，不必重寫 scoring／scenario／backtest domain logic。

## Research API

API 預設只綁定 `127.0.0.1`。若刻意部署到網路，請設定 `HOST`、`ALLOWED_ORIGINS` 與長且隨機的 `API_WRITE_TOKEN`；非 loopback 的狀態變更 request 需要 bearer token。不可把 token 放進靜態 React build。

主要 endpoints：

```text
GET  /api/health
GET  /api/observations
GET  /api/provenance?observationId=...
GET  /api/scores?ticker=NBIS
POST /api/ingest?source=prices
POST /api/scenario
GET  /api/scenario/runs
POST /api/backtest
GET  /api/backtest/runs
```

詳見 [docs/api-ingestion.zh-TW.md](docs/api-ingestion.zh-TW.md)。

## 市場價格擷取

每日事件探索會檢查 Loudoun County News、Oracle 企業新聞與 Texas Governor 新聞，各自揭露探索／文章驗證狀態、存取錯誤與候選筆數上限。Texas Governor 已通過 GitHub runner 的列表與文章驗證，保留發布者名稱，不將其標示為 ERCOT 聲明。Oracle OCI Blog 與 FERC 在 runner 檢查回傳 403 後，僅保留為需主動啟用的診斷來源，不每日抓取。PJM、ERCOT 及 Oracle 投資人新聞仍暫停抓取；先前已驗證的事件歷史仍保留。使用中的公開來源不需 API key，且不宣稱完整涵蓋。詳見[事件探索與 GitHub runner 檢查](docs/event-discovery.md)。

公開 demo 先使用 Stooq。如果某個 ticker 的歷史為空、過舊、筆數不足或不可用，會改用 Yahoo Finance chart endpoint。`prices` 要標為健康時，每個設定的 ticker 都至少要有 60 筆可用日收盤資料，且包含最新應有的 NYSE 交易日。紐約時間下午 4:15 起要求當日收盤；在此之前、週末或休市日則要求前一交易日。未完成及未來交易日的資料會排除，快照準備度 gate 也使用相同檢查。

HTTP `200` 但 0 筆可用資料會標成 **degraded**，不會標 `ok`。降級更新不會刪掉既有歷史；實際使用的 provider 與 origin URL 會保存到 provenance。若用於商業金融情境，應改成公司核准／授權的市場資料 provider。

## 專題訊號視角與回溯測試

總覽可切換**市場訊號、公司執行、電網需求、專案里程碑**。各視角說明來源、日期、規則及無資料原因，不合成買賣分數。公司執行需具期間資訊與精確連結的 SEC 營收或稀釋 EPS；電網需求需明確類型的 EIA 實際負載及完整可比較日期；專案里程碑需特定一級來源紀錄。詳見 [訊號視角](docs/signal-lenses.md) 與 [市場訊號方法](docs/scoring-methodology.zh-TW.md)。

前端 signal explorer 以同一份結果 contract 支援三種常見技術分析類型：移動平均趨勢、14 期 Wilder RSI 動能，以及 20 期布林通道波動度。使用者在總覽切換方法後，同一選擇會同步驅動「市場訊號」視角、「了解此訊號」抽屜，以及價格圖表上的具日期狀態變化標記；滑過標記可查看事件說明。各方法維持描述性，不把技術狀態變化轉成買進／賣出指示。詳見 [技術訊號方法](docs/signal-methods.md)。

MA5/MA10 回測只用有日期的收盤價，於下一筆觀察交易日收盤價進場，十筆交易日後評估。此為不含交易成本的描述性回溯計算，不證明預測能力。詳見 [回測說明](docs/backtesting.md)。

## 驗證

程式品質 gate：

```bash
npm run verify
```

等同：

```bash
npm run test:api
npm run test:unit
npm run build
```

產生最新靜態 snapshot 後，可驗證公開 demo 的資料狀態：

```bash
npm run demo:check
```

或一次執行程式驗證與 snapshot 驗收：

```bash
npm run verify:demo
```

`verify:demo` 比 PR CI 更嚴格；repository 目前若仍是舊／不完整 snapshot，它可以合理失敗。PR CI 只驗證 code，不依賴 live provider 是否可用。

## 靜態每日 Snapshot 與 Pages 部署

`Refresh daily dashboard snapshot` 每日於 **22:17 UTC** 執行，也支援手動 dispatch。市場價格只在紐約證交所交易日抓取；SEC、EIA 及事件來源可在非交易日更新。工作流程會重試各來源、對降級來源保留上次成功資料、產生 schemaVersion 4 完整版快照與總覽精簡版，然後執行 `npm run demo:check`。

兩份快照須完全一致並通過示範關鍵 gate，才會一併提交到 `main`。接著更新工作流程會明確 dispatch `Deploy to GitHub Pages`，再執行 Node 22 lockfile install、production build、Pages deploy 與 Lighthouse CI。這個明確 dispatch 是必要的，因為使用 repository `GITHUB_TOKEN` 產生的 push 不會再觸發另一個以 `push` 為條件的 workflow。

Gate 的關鍵條件包含四個追蹤 ticker 均有近期可用價格歷史。舊版 v1 歷史重建不再公布或要求；選用來源降級會顯示警示。

部署文件：[繁體中文](docs/static-snapshot-deployment.zh-TW.md) · [English](docs/static-snapshot-deployment.en.md)。

## 資料健康

開啟 **研究實驗室 → 資料健康** 或直接前往 `#health`，可以檢查公開儀表板正在使用的同一份 committed snapshot。畫面包含：

- 產生時間／資料年齡；
- source health 與 degraded 原因；
- 每個 ticker 的價格筆數、期間與 provider；
- 保留的不同事件紀錄筆數與來源檢查日期；
- `價格資料可用`、`價格可用，部分來源未更新`或`價格資料涵蓋不足`。

這是營運透明度畫面，不表示所有選用 provider 都必須即時在線。

## 選用 Supabase 帳戶

React 專案端已具備註冊、Email 確認／重寄、登入、session restoration、密碼恢復／變更、偏好載入／保存與登出。未設定 Supabase 時，公開研究 demo 仍可正常使用。

若面試需要展示 live account，請依 [docs/accounts.zh-TW.md](docs/accounts.zh-TW.md) 設定 Supabase project、redirect、RLS SQL 與 browser-safe publishable variables。Service-role／secret key 不應放在前端。

## EIA 來源標示

顯示 EIA 觀察值之處，Gridline 會標示**美國能源資訊署（EIA）**為來源，並保留 observation/retrieval timestamps。Gridline 分數不是由 EIA 製作、背書或核准。任何衍生研究結果都應保留 EIA attribution 與時間脈絡。

English README：[README.md](README.md)。
