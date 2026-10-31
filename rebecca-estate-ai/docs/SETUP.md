# 上線步驟（給庭妍的操作手冊）

> 金鑰、密碼請**不要貼到對話裡**，也不要傳到 LINE 群組。只放在下列指定的設定欄位。

整體順序：**① 建立 Supabase → ② 建立資料庫結構 → ③ 設定登入網址 → ④ 讓 Claude 能連到你的 Supabase（驗證用）→ ⑤ 部署到 Vercel → ⑥ 手機安裝**

---

## ① 建立 Supabase 專案（約 5 分鐘）

1. 到 <https://supabase.com> 用 Google 或 GitHub 帳號註冊。
2. 按 **New project**：
   - Name：`rebecca-estate-ai`（建議另建一個 `rebecca-estate-ai-test` 專門給測試用）
   - Database Password：按 Generate 產生，**存到你的密碼管理工具**
   - Region：**Northeast Asia (Tokyo)**
3. 等專案建立完成（約 2 分鐘）。

## ② 建立資料庫結構（約 2 分鐘）

1. 在 Supabase 左側選 **SQL Editor** → **New query**。
2. 打開 repo 中的 `rebecca-estate-ai/supabase/deploy/all-migrations.sql`，**全選複製**貼上。
3. 按右下角 **Run**，看到 `Success. No rows returned` 即完成。
4. 檢查：左側 **Table Editor** 應看到 `properties`、`contacts`、`tasks` 等資料表；**Storage** 應看到 `property-files`（私有）。
5. 排程會自動建立（每天 00:05 延續待辦、每小時產生提醒）。可在 **Database → Cron Jobs** 看到 `rea-carry-over-tasks`、`rea-generate-reminders`。
   若看不到，到 **Database → Extensions** 啟用 `pg_cron` 後，把 `supabase/migrations/20261101000600_schedules.sql` 的內容在 SQL Editor 再執行一次。

> 這個合併檔只能在**全新**專案執行一次。之後有新版本時，Claude 會提供新增的 migration 檔，或由工程師用 `supabase db push` 更新。

## ③ 設定登入網址（約 1 分鐘）

**Authentication → URL Configuration**：
- Site URL：你的正式網址（還沒部署前先填 `http://localhost:3000`）
- Redirect URLs 新增：`https://你的網域/auth/callback`

**Authentication → Sign In / Providers → Email**：保持開啟。正式上線前建議到 **Authentication → Emails → SMTP Settings** 設定自己的寄信服務（Supabase 內建寄信每小時有數量限制）。

## ④ 讓 Claude 能連到你的 Supabase（完成後我才能做真實環境驗證）

目前這個雲端開發環境的網路政策**擋住了 `supabase.co`**，所以我還不能連到你的專案。

1. 在 Claude Code 對話視窗上方標題列，點雲端環境選單 → **Edit**。
2. **Network access**：在 Allowed domains 加入 `*.supabase.co`（保留「Allow package managers」打勾）。
3. **Environment variables**（或 Network secrets）新增下列變數，值從 Supabase **Project Settings → API**（或 **API Keys**）取得：

   | 變數名稱 | 從哪裡取得 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key（**最高權限，只放這裡**） |
   | `E2E_ALLOW_WRITE` | 填 `1`，表示同意我在專案中建立測試帳號並在測完後刪除 |

4. 存檔後**開一個新的對話**，告訴我「Supabase 已設定好，請做真實環境驗證」。

建議第 ④ 步使用**測試專案**的金鑰，不要用正式專案。

## ⑤ 部署到 Vercel（約 10 分鐘）

1. 到 <https://vercel.com> 用 GitHub 登入 → **Add New → Project** → 選這個 repo。
2. **Root Directory** 設為 `rebecca-estate-ai`。
3. **Environment Variables** 新增：

   | 變數 | 值 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | 正式專案的 Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 正式專案的 anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | 正式專案的 service_role key |
   | `NEXT_PUBLIC_SITE_URL` | 部署後的網址，例如 `https://rebecca-estate-ai.vercel.app` |
   | `CRON_SECRET` | 隨便產生一段 32 字以上的亂碼（備援排程用） |

4. 按 **Deploy**。完成後把網址填回第 ③ 步的 Site URL 與 Redirect URLs。
5. 程式碼目前在分支 `claude/rebecca-estate-ai-phase1`，Vercel 預設部署主分支；要正式上線前請先把分支合併（可以請我開 PR）。

## ⑥ iPhone 安裝

Safari 開啟網站 → 分享 → **加入主畫面**。為保護客戶資料，系統不會在手機上離線保存案件與客戶內容。

---

## 工程師參考

```bash
cd rebecca-estate-ai
cp .env.example .env.local     # 填入 Supabase 設定
npm install
npm run dev

# 修改 migration 後重新產生合併檔
node scripts/bundle-migrations.mjs

# 以 CLI 套用 migration（取代步驟 ②）
supabase link --project-ref <project ref>
supabase db push
```

### 安全提醒

- `SUPABASE_SERVICE_ROLE_KEY` 會繞過所有權限規則，只能放在伺服器環境變數；程式中只有 `/api/cron/daily` 使用（有自動化測試把關）。
- `supabase/tests/supabase_shim.sql` 只供本機測試，**切勿**在正式資料庫執行。
- 邀請連結目前需手動傳送（尚未串接寄信服務），連結 7 天內有效、只能用一次，且必須用受邀 Email 登入才能接受。
