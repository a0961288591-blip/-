"use client";

import { createBrowserClient } from "@supabase/ssr";

/** 瀏覽器端連線（anon key + 使用者 session），只用於直接上傳檔案到 Storage；權限由 Storage RLS 判斷 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase 尚未設定");
  return createBrowserClient(url, anonKey);
}
