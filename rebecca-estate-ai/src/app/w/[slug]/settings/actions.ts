"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { dbErrorState, invalid } from "@/lib/action-utils";
import { formObject, inviteSchema, memberUpdateSchema, prefsSchema } from "@/lib/forms";
import { siteUrl } from "@/lib/env";
import type { FormState } from "@/lib/validation";

export type InviteState = FormState & { link?: string };

/** 產生邀請連結。V1 未串接寄信服務：由邀請人自行以 LINE/Email 傳給對方。 */
export async function inviteMemberAction(slug: string, _prev: InviteState, fd: FormData): Promise<InviteState> {
  const { supabase, ws } = await getWorkspace(slug);
  if (!roleAtLeast(ws.member.role, "manager")) return { error: "只有負責人或經理可以邀請成員" };
  const parsed = inviteSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const d = parsed.data;
  const { data: token, error } = await supabase.rpc("invite_member", {
    p_tenant: ws.tenant.id,
    p_email: d.email,
    p_role: d.role,
    p_can_view_floor_price: d.can_view_floor_price,
    p_can_view_contact_pii: d.can_view_contact_pii,
    p_can_export: d.can_export,
    p_can_manage_files: d.can_manage_files,
  });
  if (error || !token) return dbErrorState(error, fd);
  revalidatePath(`/w/${slug}/settings`);
  return { ok: true, message: `已建立給 ${d.email} 的邀請（7 天內有效，只能使用一次）`, link: `${siteUrl()}/invite/${token}` };
}

export async function revokeInvitationAction(slug: string, invitationId: string): Promise<FormState> {
  const { supabase } = await getWorkspace(slug);
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: invitationId });
  if (error) return dbErrorState(error);
  revalidatePath(`/w/${slug}/settings`);
  return { ok: true };
}

export async function updateMemberAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await getWorkspace(slug);
  const parsed = memberUpdateSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const d = parsed.data;
  const { error } = await supabase.rpc("update_tenant_member", {
    p_tenant: ws.tenant.id,
    p_user: d.user_id,
    p_role: d.role,
    p_status: d.status,
    p_can_view_floor_price: d.can_view_floor_price,
    p_can_view_contact_pii: d.can_view_contact_pii,
    p_can_export: d.can_export,
    p_can_manage_files: d.can_manage_files,
  });
  if (error) return dbErrorState(error, fd);
  revalidatePath(`/w/${slug}/settings`);
  return { ok: true, message: "已更新" };
}

export async function savePreferencesAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await getWorkspace(slug);
  const parsed = prefsSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase
    .from("member_preferences")
    .upsert({ tenant_id: ws.tenant.id, user_id: ws.userId, ...parsed.data }, { onConflict: "tenant_id,user_id" });
  if (error) return dbErrorState(error, fd);
  revalidatePath(`/w/${slug}/settings`);
  return { ok: true, message: "已儲存提醒設定" };
}
