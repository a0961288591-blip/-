import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 進入點：依狀態導向設定說明 / 登入 / 建立工作空間 / 最近的工作空間 */
export default async function Home() {
  if (!isSupabaseConfigured()) redirect("/setup");
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id, tenants!inner(slug, deleted_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("tenants.deleted_at", null)
    .order("joined_at", { ascending: true })
    .limit(1);

  const first = data?.[0] as { tenants: { slug: string } | { slug: string }[] } | undefined;
  const slug = first ? (Array.isArray(first.tenants) ? first.tenants[0]?.slug : first.tenants.slug) : undefined;
  redirect(slug ? `/w/${slug}/dashboard` : "/onboarding");
}
