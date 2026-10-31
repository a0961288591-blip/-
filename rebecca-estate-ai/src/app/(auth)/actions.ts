"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";
import { credentialsSchema, fieldErrorsOf, keepValues, safeNextPath, signupSchema, type FormState } from "@/lib/validation";

const NOT_CONFIGURED: FormState = { error: "系統尚未連接 Supabase，請先完成設定（見 /setup）。" };

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const values = keepValues(formData, ["email"]);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };
  if (!isSupabaseConfigured()) return { ...NOT_CONFIGURED, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // 不區分帳號不存在或密碼錯誤，避免帳號列舉
    return { error: error.message.includes("Email not confirmed") ? "請先至信箱完成 Email 驗證" : "Email 或密碼不正確", values };
  }
  redirect(safeNextPath(formData.get("next"), "/"));
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  const values = keepValues(formData, ["email", "displayName"]);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };
  if (!isSupabaseConfigured()) return { ...NOT_CONFIGURED, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/onboarding`,
    },
  });
  if (error) return { error: "註冊失敗，請稍後再試或更換 Email", values };

  // 專案若關閉 Email 驗證，會直接拿到 session
  if (data.session) redirect("/onboarding");
  return { ok: true, message: "已寄出驗證信，請至信箱點擊連結完成註冊。" };
}
