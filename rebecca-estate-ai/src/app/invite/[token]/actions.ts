"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation";

export async function acceptInviteAction(token: string): Promise<FormState> {
  const { supabase, user } = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  // Email 比對、到期、一次性、席次上限都在資料庫 RPC 內檢查
  const { data: slug, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !slug) {
    return { error: error?.code === "P0001" || error?.code === "42501" ? error.message : "無法接受邀請，請稍後再試" };
  }
  redirect(`/w/${slug}/dashboard`);
}
