import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/lib/env";

/**
 * service_role 連線：會繞過 RLS。
 * 只允許用於伺服器端排程與金流流程，禁止在任何處理使用者請求的程式碼中使用。
 */
export function createAdminClient() {
  const env = getPublicSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY 尚未設定");
  return createClient(env.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
