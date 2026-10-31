// 將 supabase/migrations/*.sql 依序合併為單一檔案，方便在 Supabase SQL Editor 一次貼上執行。
// 用法：node scripts/bundle-migrations.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "supabase");
const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();

export function bundle() {
  const header = [
    "-- =====================================================================",
    "-- REBECCA ESTATE AI · 全部資料庫結構（自動產生，請勿手動修改）",
    "-- 使用方式：Supabase 後台 → SQL Editor → New query → 貼上全部內容 → Run",
    "-- 只能在「全新」的 Supabase 專案執行一次；之後的更新請用 supabase db push",
    `-- 內含 ${files.length} 個 migration：${files.join(", ")}`,
    "-- =====================================================================",
    "",
  ].join("\n");
  return header + files.map((f) => `\n-- ▼▼▼ ${f} ▼▼▼\n` + readFileSync(join(root, "migrations", f), "utf8")).join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("bundle-migrations.mjs")) {
  writeFileSync(join(root, "deploy", "all-migrations.sql"), bundle());
  console.log(`已產生 supabase/deploy/all-migrations.sql（${files.length} 個 migration）`);
}
