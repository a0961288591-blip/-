# 陳庭妍 AI 房仲智慧系統｜REBECCA ESTATE AI

台灣房仲業務 SaaS 平台：開發案件、經營屋主、買方需求、建商、智慧配對、行銷、追蹤到成交，一筆資料輸入一次、全模組依權限共用。

- 技術：Next.js App Router · TypeScript · Tailwind CSS · shadcn/ui · Supabase（Auth / PostgreSQL RLS / Storage）· Vitest · Playwright · Vercel
- 多租戶：shared schema + `tenant_id`，RLS + 複合外鍵雙重隔離
- 介面：繁體中文、新台幣、坪、Asia/Taipei；支援 iPhone 與 PWA

## 文件

- [系統架構、ERD、頁面清單、階段規劃](docs/ARCHITECTURE.md)
- [Supabase / Vercel 設定與部署](docs/SETUP.md)
- [測試說明](docs/TESTING.md)

## 快速開始

```bash
npm install
cp .env.example .env.local   # 填入 Supabase URL 與 anon key
npm run dev
```

未設定 Supabase 時，系統只會顯示設定說明頁，不會出現假資料或假功能。

## 目前進度

Phase 1（基礎架構、Auth、多租戶 RLS、安全測試、Dashboard）與 Phase 2（房源、客戶、買方需求、聯繫紀錄、任務、成員邀請、提醒）已完成程式與測試，尚待接上真實 Supabase 做端對端驗證。上線步驟見 [docs/SETUP.md](docs/SETUP.md)。
