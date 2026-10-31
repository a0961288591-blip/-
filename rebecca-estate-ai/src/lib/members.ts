import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole } from "@/lib/workspace";

export interface MemberOption {
  user_id: string;
  name: string;
  role: MemberRole;
  status: string;
}

/** 同工作空間成員（指派負責人、顯示名稱用） */
export const listMembers = cache(async (supabase: SupabaseClient, tenantId: string): Promise<MemberOption[]> => {
  const { data: members } = await supabase.from("tenant_members").select("user_id, role, status").eq("tenant_id", tenantId);
  const rows = (members ?? []) as { user_id: string; role: MemberRole; status: string }[];
  if (!rows.length) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", rows.map((m) => m.user_id));
  const names = new Map((profiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name]));
  return rows.map((m) => ({ ...m, name: names.get(m.user_id) ?? "（未設定名稱）" }));
});

export function memberName(members: MemberOption[], id: string | null | undefined) {
  if (!id) return "未指定";
  return members.find((m) => m.user_id === id)?.name ?? "（已離開成員）";
}
