/**
 * 環境變數集中讀取。未設定 Supabase 時，系統顯示設定說明頁，不假裝可用。
 */
export function getPublicSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !/^https?:\/\//.test(url)) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return getPublicSupabaseEnv() !== null;
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
