import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

export type MemberRole = "owner" | "manager" | "agent" | "viewer";

export interface Workspace {
  tenant: { id: string; name: string; slug: string; kind: string };
  member: {
    role: MemberRole;
    can_view_floor_price: boolean;
    can_view_contact_pii: boolean;
    can_export: boolean;
    can_manage_files: boolean;
  };
  memberships: { slug: string; name: string; role: MemberRole }[];
  userId: string;
  displayName: string;
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "負責人",
  manager: "經理",
  agent: "業務",
  viewer: "檢視者",
};

const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, agent: 1, manager: 2, owner: 3 };

export function roleAtLeast(role: MemberRole, min: MemberRole) {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * 依網址代號載入工作空間。查詢走 RLS：非成員查不到租戶即回 404，
 * 不洩露該工作空間是否存在。每個請求內以 React cache 去重。
 */
export const getWorkspace = cache(async (slug: string) => {
  const { supabase, user } = await getUser();
  if (!user) redirect(`/login?next=/w/${encodeURIComponent(slug)}/dashboard`);

  const { data: rows, error } = await supabase
    .from("tenant_members")
    .select("role, status, can_view_floor_price, can_view_contact_pii, can_export, can_manage_files, tenants!inner(id, name, slug, kind, deleted_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("tenants.deleted_at", null);
  if (error) throw new Error("讀取工作空間失敗");

  type Row = {
    role: MemberRole;
    can_view_floor_price: boolean;
    can_view_contact_pii: boolean;
    can_export: boolean;
    can_manage_files: boolean;
    tenants: { id: string; name: string; slug: string; kind: string } | { id: string; name: string; slug: string; kind: string }[];
  };
  const memberships = ((rows ?? []) as Row[]).map((r) => ({ ...r, tenant: Array.isArray(r.tenants) ? r.tenants[0] : r.tenants }));
  const current = memberships.find((m) => m.tenant.slug === slug);
  if (!current) notFound();

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();

  const ws: Workspace = {
    tenant: current.tenant,
    member: {
      role: current.role,
      can_view_floor_price: current.can_view_floor_price,
      can_view_contact_pii: current.can_view_contact_pii,
      can_export: current.can_export,
      can_manage_files: current.can_manage_files,
    },
    memberships: memberships.map((m) => ({ slug: m.tenant.slug, name: m.tenant.name, role: m.role })),
    userId: user.id,
    displayName: profile?.display_name ?? user.email ?? "使用者",
  };
  return { supabase, ws };
});
