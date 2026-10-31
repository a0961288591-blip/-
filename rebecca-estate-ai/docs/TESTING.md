# 測試說明

| 指令 | 內容 | 需要 |
|---|---|---|
| `npm run typecheck` | TypeScript | — |
| `npm run lint` | ESLint | — |
| `npm run test:unit` | 格式、待辦排序、表單驗證、金鑰外洩靜態檢查 | — |
| `npm run test:db` | **多租戶 RLS、權限、稽核、Storage、任務延續**（真實 PostgreSQL） | `TEST_DATABASE_URL` |
| `npm run test:e2e` | 未設定憑證時的行為、PWA、排程端點、手機寬度（Playwright） | 先 `npm run build` |
| `npm run test:e2e`（live） | `tests/e2e/live-flow.spec.ts`：登入→建立工作空間→物件→客戶→聯繫紀錄→需求→任務→邀請→跨租戶阻擋，結束後刪除測試資料 | 真實 Supabase 憑證 + `E2E_ALLOW_WRITE=1`，且 build 時已設定 `NEXT_PUBLIC_*` |
| `npm run check` | typecheck + lint + test + build | — |

## 資料庫測試如何運作

`tests/db/harness.ts` 會：

1. 在 `TEST_DATABASE_URL` 指向的 PostgreSQL 建立一個暫存資料庫；
2. 套用 `supabase/tests/supabase_shim.sql`（模擬 Supabase 的 `anon`/`authenticated`/`service_role` 角色、`auth.uid()`、`storage.objects`，以及 Supabase 預設會自動授權新資料表的行為）；
3. 依序套用 `supabase/migrations/*.sql`；
4. 每個查詢以 `set local role authenticated` + `request.jwt.claims` 執行，等同 PostgREST 對每個 API 請求的處理；
5. 結束後刪除暫存資料庫。

未設定 `TEST_DATABASE_URL` 時，資料庫測試會顯示為 **skipped**（不是通過）。

本機啟動測試用 PostgreSQL（例）：

```bash
docker run -d --name rea-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 54322:5432 postgres:16
export TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54322/postgres
npm run test:db
```

## 尚未自動化的部分

- 登入後所有頁面的**端對端流程**需要真實 Supabase（Auth + PostgREST + Storage）。`live-flow.spec.ts` 已寫好，但在設定憑證前會顯示 skipped，**尚未實際執行過**。
- 附件上傳/下載需要 Supabase Storage API，目前只驗證了 Storage 權限規則（資料庫層）。
- 模擬層與正式 Supabase 的差異：`storage.objects` 僅模擬資料表與 RLS，未包含 Storage API 本身。
