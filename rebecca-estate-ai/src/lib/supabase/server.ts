import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@/lib/env";

/**
 * 以「目前登入使用者」身分連線（anon key + 使用者 JWT），所有查詢都受 RLS 約束。
 */
export async function createClient() {
  const env = getPublicSupabaseEnv();
  if (!env) throw new Error("Supabase 尚未設定");
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 中無法寫入 cookie；由 middleware 負責刷新 session
        }
      },
    },
  });
}

/** 取得已驗證的使用者（透過 Supabase Auth 伺服器驗證 JWT，而非只讀 cookie） */
export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}
