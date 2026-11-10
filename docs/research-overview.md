# Overview research workflow

Start with the After-Market Research Brief for dated market evidence, recorded snapshot changes and gaps in source coverage. Use the theme, category and search controls to find company cards. Selecting a card or opening company research from the brief updates the company used by the four evidence lanes, Market Context, Company Research, signals and price chart. Filtering only changes the displayed cards. The matching-card and evidence controls move focus to the existing section and preserve the current Overview URL. Data Health opens at `#health`.

## Brief inputs and rules

- **Market.** Uses the existing normalized price series and Market Context calculations for SPY, QQQ, tracked-basket MA20 participation and 20-observation relative comparisons for the selected company. It shows the latest eligible observed session separately from the expected NYSE session, which uses the existing 4:15 p.m. New York publication buffer and holiday calendar. Older closes retain their observation dates. Missing closes and incompatible, stale or insufficient comparison histories surface as unavailable.
- **Snapshot comparison.** Uses the published `snapshotChanges` period and recorded close, trend, verified event and source-health changes. The brief prioritizes the selected company for close and trend rows. The date can advance with the same numerical close. Snapshot publication dates identify the comparison endpoints and may span more or less than one trading session. An absent baseline and an available comparison with zero material changes have distinct states.
- **Developments.** Uses official dated company records from the existing company research model, prioritizing the selected company. When that company has no dated record, the brief can display the most recent dated official record from an enabled Neocloud or Hardware company. Verified infrastructure records added or updated in the snapshot diff take priority over existing records. Original links, publication dates and applicable archive or retention labels accompany the evidence. A record added to a snapshot can have an older publication date.
- **Research questions.** Up to three questions can appear in this order. A dated, recorded trend transition between two available states for the selected company prompts a follow-up on whether it persists. A dated verified infrastructure addition or update prompts a search for a documented subsequent milestone. An archived or retained reviewed disclosure prompts a search for a more recent official update. With no qualifying record, the brief displays insufficient evidence.
- **Source limitations.** The snapshot timestamp, source status, missing or older market closes and comparison availability are separate from publication, retrieval and verification dates on the original evidence. The existing snapshot freshness convention marks the snapshot retained after 96 hours. Partial, degraded and missing coverage remain explicit. Interpret price, grid, project and company evidence independently. The display provides dated observations and follow-up questions, without causal attribution, rankings or investment recommendations.

## Research themes

These navigation groups intersect with the canonical category and ticker/name search. **All Companies** includes every company enabled by the snapshot. Membership describes a research role and carries no claim about revenue attribution or project-to-grid relationships.

| Theme | 主題 | Tickers |
| --- | --- | --- |
| Neocloud / GPU Cloud | 新型雲端／GPU 雲端 | NBIS, CRWV |
| Compute Infrastructure & Transition | 運算基礎設施與轉型 | APLD, IREN, CIFR, CORZ |
| Networking & AI Hardware | 網路與 AI 硬體 | AVGO, ANET |
| Power, Cooling & Grid Infrastructure | 電力、冷卻與電網基礎設施 | VRT, ETN, PWR, GEV, CEG, BE |

The dated-event and company-development models, the NYSE session helper and the shared company selection are extension points for a future catalyst calendar.

## 繁體中文

從「盤後研究簡報」查看美股交易日、前後快照的變化及來源缺口。用主題、類別和搜尋篩選公司卡片。從卡片或簡報選擇公司後，四面向證據摘要、市場背景、公司研究、訊號與價格圖表會使用同一家公司。篩選只改變顯示的卡片，清除篩選會恢復所有已啟用的公司。上表主題只供研究導覽，並不代表營收歸屬或專案與電網之間的關係。

美股觀察日期沿用既有 NYSE 交易日曆及紐約時間下午 4:15 的更新緩衝。快照發布時間與交易日分開顯示；快照比較可能涵蓋多個交易日，也可能沒有跨日。收盤價即使相同，觀察日期仍可能更新。簡報標示較早的保留資料、缺少的收盤價、比較基準不足及部分或降級的來源涵蓋。公司與基礎設施紀錄附上原始連結與發布日期；新增至快照的紀錄可能早已發布。

研究問題依據三種有日期的證據產生：所選公司的已記錄趨勢轉變、新增或更新的已驗證基礎設施紀錄、以及較舊或保留的已審閱公司揭露。分別追查趨勢是否延續、是否有具文件佐證的後續里程碑，以及是否有更新的官方資料。無符合條件的證據時會顯示資料不足。可在「資料健康」工作區查閱完整的來源狀態；價格變化、公司揭露及專案進展各自解讀。

## Phase 1 verification on 2026-11-10

- `npm run verify` passed 448 tests, including 201 frontend tests, and compiled the production build. Verification used a writable temporary directory for Jest and the local Git test fixtures.
- `npm run demo:check` passed snapshot acceptance and compact/full parity with zero blockers. The five existing warnings were missing SPY and QQQ histories, partial event and company-research coverage, and snapshot age.
- Local Chrome checks passed in English and Traditional Chinese at 320, 390, 768, 1024 and 1440 pixels with no page-level horizontal overflow. Checks covered keyboard operation of the theme selector and disclosure, focus on evidence targets, company selection, text contrast in the brief's three cards, and loading the existing Data Health, Scenario Lab, Backtest Lab, Events, Infrastructure and Methodology routes.
