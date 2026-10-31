"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { fieldErrorsOf, keepValues, tenantSchema, type FormState } from "@/lib/validation";

export async function createTenantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = tenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    kind: formData.get("kind"),
  });
  const values = keepValues(formData, ["name", "slug", "kind"]);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/onboarding");

  // 由資料庫 RPC 建立租戶、試用訂閱、額度與 owner 成員（同一交易）
  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_kind: parsed.data.kind,
  });
  if (error) {
    if (error.code === "23505") return { fieldErrors: { slug: ["這個網址代號已被使用，請換一個"] }, values };
    if (error.code === "P0001") return { error: error.message, values };
    return { error: "建立工作空間失敗，請稍後再試", values };
  }
  redirect(`/w/${parsed.data.slug}/dashboard`);
}
