# 設定與部署說明

## 需要準備的外部服務

| 服務 | 用途 | 何時需要 |
|---|---|---|
| Supabase | Auth、PostgreSQL、Storage | **Phase 1 起必要** |
| Vercel | 部署 Next.js、Cron | 上線時 |
| OpenAI API | AI 行銷文案 | Phase 4 |

> 金鑰請自行填入 `.env.local` 或 Vercel 環境變數，**不要貼到對話或提交到 git**。

## 1. 建立 Supabase 專案

1. 到 supabase.com 建立專案，區域建議 **Northeast Asia (Tokyo)**。
2. Authentication → URL Configuration：
   - Site URL：`https://你的網域`（本機開發為 `http://localhost:3000`）
   - Redirect URLs 加入：`https://你的網域/auth/callback`、`http://localhost:3000/auth/callback`
3. 安裝 Supabase CLI，登入並連結專案後套用 migrations：

```bash
cd rebecca-estate-ai
supabase link --project-ref <你的 project ref>
supabase db push
```

4. 套用後確認：Database → Tables 每張表都顯示「RLS enabled」；Storage 出現私有 bucket `property-files`。

## 2. 排程（每日延續任務）

**建議：Supabase pg_cron**（Database → Extensions 啟用 `pg_cron`），在 SQL Editor 執行：

```sql
-- 每天台北 00:05（UTC 16:05）執行
select cron.schedule('rea-carry-over-tasks', '5 16 * * *', $$select public.carry_over_tasks()$$);
```

**或 Vercel Cron**：`vercel.json` 已設定每天 UTC 16:05 呼叫 `/api/cron/daily`，需在 Vercel 設定 `CRON_SECRET`（至少 16 字元隨機字串）與 `SUPABASE_SERVICE_ROLE_KEY`。

兩者擇一即可；函式可重複執行，不會重複延續。

## 3. 本機開發

```bash
cd rebecca-estate-ai
cp .env.example .env.local   # 填入 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

## 4. 部署到 Vercel

1. Import 此 repo，Root Directory 設為 `rebecca-estate-ai`。
2. 環境變數：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SITE_URL`、`CRON_SECRET`。
3. `vercel.json` 已指定東京區域 `hnd1`，與 Supabase 東京區域同區以降低延遲。

## 5. iPhone 安裝

Safari 開啟網站 → 分享 → 「加入主畫面」。系統不會在手機上離線保存客戶與案件資料。

## 安全提醒

- `SUPABASE_SERVICE_ROLE_KEY` 會繞過 RLS，只能放在伺服器環境變數，程式中只有 `/api/cron/daily` 使用（有自動化測試把關）。
- `supabase/tests/supabase_shim.sql` 只供本機測試，**切勿**在正式資料庫執行。
