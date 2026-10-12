# 資料擷取 API

使用 Node.js 22 與 npm 10。預設涵蓋全部 20 個追蹤標的，可用 `TICKERS` 設定支援的子集合。Supabase 僅用於選配的帳戶／偏好儲存，API 與研究擷取不需要 Supabase。

可以用 `npm run api` 啟動 API，或用 `npm run dev` 一次啟動 API 與 React UI。API 預設網址為 `http://localhost:8787`。執行 provider ingestion 前，請將 `.env.example` 複製為本機環境設定，或匯出相應環境變數。

API 預設只綁定 `127.0.0.1`。若刻意對外開放，請設定 `HOST`、限制 `ALLOWED_ORIGINS`，並建立長且隨機的 `API_WRITE_TOKEN`。所有非 loopback 的狀態變更 POST endpoint 都必須使用 `Authorization: Bearer <token>`，且會套用速率限制。不得將此 token 放入靜態 React build。公開觀察值與分數查詢均有分頁及筆數上限。

| Endpoint | 用途 |
|---|---|
| `GET /api/health` | 各來源狀態、最近成功時間與降級原因。 |
| `GET /api/observations?ticker=ORCL&type=close` | 正規化後的歷史觀察值。 |
| `GET /api/provenance?observationId=...` | 查詢單一觀察值的資料血緣。 |
| `GET /api/scores?ticker=NBIS` | 當前版本價格訊號快照；不回傳舊版人工分數。 |
| `POST /api/ingest?source=prices` | 更新單一來源；支援 `sec`、`eia`、`pjm`、`ferc`、`company-ir`、`company-research`、`events`、`prices`。 |
| `POST /api/ingest/all` | 各來源獨立更新；缺少憑證只會讓該來源降級。 |
| `POST /api/scenario` | 執行／保存一筆情境分析。 |
| `GET /api/scenario/runs` | 當前方法版本的已儲存情境紀錄。 |
| `GET /api/backtest/runs` | 當前方法版本的已儲存回測紀錄。 |
| `POST /api/backtest` | 執行／保存一筆時點回測。 |

## 儲存模型

Gridline 同時保留兩種部署 profile：

- **API／production-style profile：**原始回應存到 `data/bronze`；正規化觀察值、來源健康狀態、版本化分數快照、情境分析與回測紀錄持久化到 SQLite/WAL。觀察值 ID 為 deterministic，因此重新擷取相同來源資料是 idempotent，不會刪除既有歷史。
- **GitHub Pages demo profile：**排程 exporter 寫入 `public/data/dashboard-snapshot.json`。非新聞成功來源會取代先前資料（支援時依 ticker 處理）；失敗標的保留 last-known-good。事件與公司研究持續合併／去重既有已接受紀錄，成功更新也不會清除較早發現。另產生 UI 使用的精簡版 `public/data/dashboard-overview.json`。

`data/` 不會提交到 Git。已提交的靜態 snapshot 是可攜式公開示範 artifact，不等於 API database。

## Provider 需求

- **SEC EDGAR：**公開 API，只應由 server-side 呼叫。`SEC_USER_AGENT` 必須設定且需能識別呼叫者；filing availability time 要與財報涵蓋期間分開保存。
- **EIA：**需要 API key；目前 starter connector 讀取 PJM hourly RTO regional data。
- **PJM Data Miner 2：**需要 PJM account／subscription key；目前 starter connector 讀取 `gen_by_fuel`。正式重新散布資料前應確認 PJM 條款。
- **Data.FERC.gov：**需要 API key；目前 starter connector 驗證並保存 dataset catalog。若要正式當成 live indicator，需指定並實作實際 FERC dataset。
- **Company research：**全部 20 家公司具備已審閱的主要來源研究。每日驗證官方公告與對應發行人的 SEC 鏡像，有限度探索官方列表／SEC 新公告，並保留進度與最後成功時間。出版商回傳 403 後，原來源進入七天冷卻期；失敗檢查保留有日期的已審閱證據，不會冒稱重新驗證。
- **Company IR：**`COMPANY_IR_FEEDS` 只能放官方 RSS/Atom URL；原始資料會保留，以便之後升級 parser/version。
- **Prices：**公開示範先嘗試 Stooq；若資料為空、過舊、筆數不足或不可用，Gridline 會針對該 ticker 改用 Yahoo Finance chart endpoint。每個追蹤 ticker 至少要有 60 筆可用日資料，且最新資料須涵蓋最近預期的 NYSE 交易日，`prices` 才能標為健康。紐約時間 16:15 起要求當日收盤資料；較早檢查、週末與休市日要求前一交易日。未完成與未來交易日資料會排除，快照驗收採相同規則。若是金融公司正式部署，應改用公司核准／授權的市場資料供應商。

每一筆價格觀察值都會在 provenance 中保存實際採用的 provider 與 origin URL。

## Fail-closed ingestion

HTTP `200` 不等於健康資料更新。價格、SEC 與電網 adapter 必須產生可用觀察值，空結果標為 `degraded`。事件檢查可合法產生零筆新事件，並記錄檢查日期及保留既有事件歷史。

事件探索每日檢查 Loudoun County 新聞 RSS／列表、Oracle corporate news 與 Texas Governor news。PJM、ERCOT 與 Oracle investor news 依使用者要求暫停新請求，但保留已驗證歷史。各來源分別記錄探索與文章驗證結果、錯誤及請求／候選上限；部分可用標為 `partial`，通過的紀錄仍可發布。Oracle OCI Blog 與 FERC news 因 runner 回傳 403 僅保留選配診斷，不在每日請求範圍。不同出版機構不會被錯標為 ERCOT 或 PJM。詳見[官方事件探索](event-discovery.md)；設定來源檢查不代表涵蓋全美所有基礎設施事件。

SEC 財務欄位保留原始幣別、期間、申報連結、已稽核概念名稱與擷取方式；一般標籤、公司自訂標籤、明確申報零值、過期、未單獨申報及不可用分類各自呈現。未取得數字不會被當成零，詳見[公司研究涵蓋報告](company-research-coverage.md)。

靜態 snapshot 遇到降級來源會保留 last-known-good 資料；SQLite profile 則保留不可變歷史觀察值。這對價格歷史尤其重要，因為 30D／90D lookback 與時點回測都依賴連續資料。

缺失資料絕不會轉成零。

## Demo acceptance

產生靜態快照後可執行：

```bash
npm run demo:check
```

Gate 會檢查 schema-v4 metadata、所有追蹤 ticker 的完整／近期市場價格、健康的非事件來源不可為零筆資料。舊版 v1 歷史重建不再要求或發布。排程 snapshot workflow 也會在提交新的公開快照前自動執行這個 gate。

UI 可從 `#health`／**資料狀態**檢查同一份已提交快照。

## EIA 來源標示與資料完整性

顯示衍生自 EIA 的觀察值時，必須標示美國能源資訊署（EIA）為來源，並連結至 EIA Open Data。原始 EIA 觀察值、觀察期間與擷取時間需與 Gridline 衍生指標分開保存。不得使用 EIA 標誌，也不得以文字暗示 EIA 背書本儀表板、分數或投資結論。

EIA 資料僅限 Gridline 的研究與決策輔助用途。不得傳送至不相關的產品或服務，呈現資料時也不得移除來源標示或時間脈絡。

## 排程

本機排程器會略過非交易日的價格請求。靜態快照 exporter 則可在任何日期補回缺少或筆數不足的價格涵蓋；已涵蓋最新應有收盤日就不重抓，因此週末／休市日仍可修復缺口。GitHub 的排程對應 **台北時間 06:17**（前一天 22:17 UTC）；實際執行可能延遲。

當 `SCHEDULE_ENABLED=true` 時，本機 API 排程器會每分鐘檢查一次，並在每日 **America/New_York 16:15** 之後執行一次更新。GitHub Pages 的快照工作流程每日於 `22:17 UTC` 執行（美東夏令與標準時間皆在正常收盤後），也支援手動執行。預設 `SCHEDULE_SOURCES` 是 `sec,prices,eia,events,company-research`，PJM、FERC 與自訂 company-IR 仍可選用但不在公開每日更新範圍。手動 `company-coverage` 僅更新 SEC 與公司研究。工作流程無需安裝前端套件，遇並行推送時會在有限次重試內重新取得遠端資料並產生／驗證快照，詳見[Actions 操作](actions-maintenance.md)。SEC、EIA、公司研究與事件來源可每日更新；市場價格只在紐約證交所交易日抓取。2026 至 2028 年的休市日期依據[紐約證交所行事曆](https://www.nyse.com/trade/hours-calendars)；若公布新年度日期或臨時休市，須重新檢查。超出已公布年度時，價格仍由供應商資料的日期驗證把關，不會直接停止更新。事件檢查是否過期以紐約當地日期判定。

示範環境刻意採低頻更新，而不是持續 polling。正式部署時，provider licensing、SLA、historical-vintage availability 與 redistribution rights 仍需由實際部署環境負責。
