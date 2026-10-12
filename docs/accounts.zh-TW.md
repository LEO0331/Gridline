# Supabase 免費方案帳戶

公開儀表板不需要登入。帳戶功能是選配，目前可儲存追蹤清單、語言與容量權重。React 專案端已涵蓋註冊、Email 確認／重寄、登入、工作階段恢復、忘記密碼、變更密碼、偏好載入／儲存與登出；目前部署的專案已完成設定；以下步驟供新專案或重新設定使用。

## 專案設定與 migration 參考

1. 在 https://supabase.com/dashboard 建立 **Free** 專案；除非確定需要，否則不必啟用付費附加功能。
2. 在 SQL Editor 執行 `supabase/user-preferences.sql`。此腳本可重複執行：缺少資料表時建立 `user_preferences`、啟用 RLS、重新建立「只能存取自己資料列」政策、禁止匿名偏好存取，並授權 authenticated 使用者 CRUD。
3. 啟用 Email 登入、保留 Email 確認，密碼最短長度至少設為 8。
4. Authentication → URL Configuration：
   - Site URL：`https://leo0331.github.io/Gridline/`
   - 允許 `https://leo0331.github.io/Gridline/` 與無尾端斜線版本。
   - 本機開發請允許你實際使用的網址，通常是 `http://localhost:3000/`；開發期間也可使用合適的 localhost wildcard。
   - PKCE 的註冊確認／密碼重設連結，要在發起流程的同一個瀏覽器開啟。
5. 從 Connect/API Keys 複製專案 URL 與 **publishable** key（`sb_publishable_...`）。React 前端絕對不要放 secret／service-role key。
6. 本機 `.env.local` 設定下列兩項後，重新啟動 `npm start`：
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_PUBLISHABLE_KEY`
7. GitHub Pages：Settings → Secrets and variables → Actions → **Variables** 建立相同兩個 repository variables。部署 workflow 會在 build 時注入；這兩項是瀏覽器端設定，不是秘密憑證。
8. CSP 僅允許已設定的 `eomxjtbaefakfxtaoiwj.supabase.co` 專案 HTTPS／WebSocket；更換專案時須同步更新 `public/index.html` 中兩個 host。若之後改用自訂 Supabase 網域，要同步把該網域加入 `public/index.html` 的 `connect-src`。

## 專案端已完成的行為

- **尚未設定 Supabase：**「登入／註冊」仍可開啟，但會清楚顯示帳戶功能尚未啟用；公開儀表板不受影響。
- **註冊：** Email + 密碼 + 再次確認密碼，使用 PKCE 並帶入明確 redirect URL。
- **Email 確認：** 若 Supabase 要求確認 Email，畫面會留在註冊狀態，並提供「重新寄送確認信」。
- **登入：** 重新整理頁面時會恢復本機 session，恢復期間不會先閃成登出狀態。
- **忘記密碼：** 寄送 reset link；畫面固定使用泛化結果，不洩漏該 Email 是否存在帳戶。
- **密碼復原：** 收到 `PASSWORD_RECOVERY` 事件時自動打開新密碼表單，再呼叫 `updateUser`。
- **登入後變更密碼：** 需輸入目前密碼，再輸入並確認新密碼。
- **偏好設定：** 只讀取登入使用者自己的 `user_preferences`；儲存採明確操作並以 `user_id` upsert。載入偏好若失敗，可直接重試，不必登出。
- **登出：** 清除目前瀏覽器的本機 session。
- **安全界線：** 前端只接受 `sb_publishable_...` key，不支援 secret／service-role 憑證。

Supabase 只會保存帳戶／session 與偏好資料列；市場、EIA、SEC、PJM 等研究資料不會因這個帳戶功能上傳到 Supabase。

## 擴充追蹤清單與每日健康檢查

新專案使用 `supabase/user-preferences.sql` 的 20 標的限制；原本僅允許四個標的的既有專案套用 `supabase/migrations/20261008_expand_watchlist.sql`，只擴大允許清單，不刪除資料列或改變 RLS。研究／新聞／財務涵蓋本身無需 Supabase migration。

`supabase/migrations/20261008_add_database_health.sql` 建立 `gridline_health()`，以呼叫者權限執行，僅回傳 `ok`，允許匿名與已登入角色呼叫。函式不讀取或修改帳戶與偏好。獨立 GitHub workflow 每日台北時間 14:43 使用公開專案 variables 呼叫；本機 `npm run health:supabase` 使用 `SUPABASE_URL` 與 `SUPABASE_PUBLISHABLE_KEY`，要求三次成功請求。檢查拒絕高權限金鑰、重新導向與非預期回應，短暫錯誤採有限重試。它提供資料庫活動與健康狀態；需留意失敗或排程中斷，並不保證免費方案永不暫停或自動恢復。詳見[Actions 操作](actions-maintenance.md)。

## 對外開放前的 Email 寄送

Supabase 內建寄信主要適合測試，寄送量與可靠度有限。正式開放一般使用者前，建議設定並驗證 custom SMTP，再完整測試註冊確認與密碼重設。

## Supabase 設定完成後的驗收

1. 新 Email 註冊 → 收到確認信 → 同一瀏覽器確認 → 登入。
2. 註冊時輸入不一致的新密碼，確認前端會阻止送出。
3. 測試重新寄送註冊確認信。
4. 登入後重新整理，確認 session 可恢復。
5. 修改語言／容量權重／追蹤清單，儲存後重新整理，確認偏好可恢復。
6. 輸入錯誤密碼，確認 dialog 不會關閉且會顯示 provider error。
7. 執行忘記密碼 → 點 Email link → 設定新密碼 → 使用新密碼登入。
8. 已登入狀態下直接變更密碼。
9. 登出後確認登入狀態相關控制項消失。
10. 用第二個帳戶驗證無法透過 Data API 讀寫第一個帳戶的偏好資料。

在 Supabase 專案、redirect URL、SQL 與 repository variables 尚未完成前，repository 本身無法驗證真實登入與 RLS。
