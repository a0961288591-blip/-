"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { dbErrorState, invalid } from "@/lib/action-utils";
import { activitySchema, contactPiiSchema, contactSchema, formObject, requirementSchema } from "@/lib/forms";
import { echoValues, type FormState } from "@/lib/validation";

const VIEWER_DENIED: FormState = { error: "檢視者無法修改資料" };

async function ctx(slug: string) {
  const { supabase, ws } = await getWorkspace(slug);
  return { supabase, ws, isManager: roleAtLeast(ws.member.role, "manager"), canWrite: roleAtLeast(ws.member.role, "agent") };
}
const contactPath = (slug: string, id?: string) => (id ? `/w/${slug}/contacts/${id}` : `/w/${slug}/contacts`);

// ------------------------------------------------------------ 客戶
export async function createContactAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws, isManager, canWrite } = await ctx(slug);
  if (!canWrite) return VIEWER_DENIED;
  const raw = formObject(fd, ["contact_types"]);
  if (!isManager) raw.owner_user_id = ws.userId;
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, fd);
  const pii = contactPiiSchema.safeParse(raw);
  if (!pii.success) return invalid(pii.error, fd);

  if (fd.get("confirm_duplicate") !== "on") {
    const { data: dups } = await supabase.rpc("find_duplicate_contacts", {
      p_tenant: ws.tenant.id,
      p_display_name: parsed.data.display_name,
      p_phone: pii.data.phone,
      p_email: pii.data.email,
    });
    if (dups?.length) {
      return {
        values: echoValues(fd),
        duplicates: (dups as { id: string; display_name: string; reason: string }[]).map((d) => ({
          href: contactPath(slug, d.id),
          label: d.display_name,
          reason: d.reason,
        })),
      };
    }
  }

  const { data: id, error } = await supabase.rpc("create_contact", {
    p_contact: { ...parsed.data, tenant_id: ws.tenant.id },
    p_pii: pii.data,
  });
  if (error || !id) return dbErrorState(error, fd);
  revalidatePath(contactPath(slug));
  redirect(contactPath(slug, id as string));
}

export async function updateContactAction(slug: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws, isManager, canWrite } = await ctx(slug);
  if (!canWrite) return VIEWER_DENIED;
  const raw = formObject(fd, ["contact_types"]);
  if (!isManager) {
    const { data: cur } = await supabase.from("contacts").select("owner_user_id").eq("id", id).eq("tenant_id", ws.tenant.id).maybeSingle();
    raw.owner_user_id = cur?.owner_user_id ?? ws.userId;
  }
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, fd);

  const { data, error } = await supabase.from("contacts").update(parsed.data).eq("id", id).eq("tenant_id", ws.tenant.id).select("id");
  if (error) return dbErrorState(error, fd);
  if (!data?.length) return { error: "只有負責業務或經理可以編輯此客戶", values: echoValues(fd) };

  // 只有能看個資的人才會在表單中看到並送出個資欄位
  if (fd.has("phone")) {
    const pii = contactPiiSchema.safeParse(raw);
    if (!pii.success) return invalid(pii.error, fd);
    const { error: piiErr } = await supabase
      .from("contact_pii")
      .upsert({ tenant_id: ws.tenant.id, contact_id: id, ...pii.data }, { onConflict: "contact_id" });
    if (piiErr) return dbErrorState(piiErr, fd);
  }
  revalidatePath(contactPath(slug, id));
  redirect(contactPath(slug, id));
}

export async function toggleArchiveContactAction(slug: string, id: string, archive: boolean): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const { data, error } = await supabase
    .from("contacts")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("tenant_id", ws.tenant.id)
    .select("id");
  if (error) return dbErrorState(error);
  if (!data?.length) return { error: "你沒有權限封存此客戶" };
  revalidatePath(contactPath(slug, id));
  revalidatePath(contactPath(slug));
  return { ok: true };
}

// ------------------------------------------------------------ 聯繫紀錄
export async function logActivityAction(slug: string, returnTo: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws, canWrite } = await ctx(slug);
  if (!canWrite) return VIEWER_DENIED;
  const parsed = activitySchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { create_task, ...activity } = parsed.data;

  const { error } = await supabase.from("contact_activities").insert({ ...activity, tenant_id: ws.tenant.id, owner_user_id: ws.userId });
  if (error) return dbErrorState(error, fd);

  let taskNote = "";
  if (create_task && activity.next_follow_up_at) {
    const { data: c } = await supabase.from("contacts").select("display_name").eq("id", activity.contact_id).maybeSingle();
    const { error: tErr } = await supabase.from("tasks").insert({
      tenant_id: ws.tenant.id,
      title: `追蹤 ${c?.display_name ?? "客戶"}${activity.next_step ? `：${activity.next_step}` : ""}`.slice(0, 200),
      kind: "follow_up",
      priority: 2,
      due_at: activity.next_follow_up_at,
      scheduled_date: new Date(new Date(activity.next_follow_up_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10),
      assignee_id: ws.userId,
      contact_id: activity.contact_id,
      property_id: activity.property_id,
      next_step: activity.next_step,
    });
    taskNote = tErr ? "（追蹤待辦建立失敗，請手動新增）" : "，並建立追蹤待辦";
  }

  revalidatePath(contactPath(slug, activity.contact_id));
  revalidatePath(`/w/${slug}/dashboard`);
  if (returnTo) redirect(returnTo);
  return { ok: true, message: `已記錄${taskNote}` };
}

// ------------------------------------------------------------ 買方需求
function requirementPayload(data: ReturnType<typeof requirementSchema.parse>, wasConfirmedAt: string | null) {
  const { confirmed, ...rest } = data;
  return { ...rest, confirmed_at: confirmed ? (wasConfirmedAt ?? new Date().toISOString()) : null };
}

export async function createRequirementAction(slug: string, contactId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws, canWrite } = await ctx(slug);
  if (!canWrite) return VIEWER_DENIED;
  const parsed = requirementSchema.safeParse(formObject(fd, ["property_types"]));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase
    .from("buyer_requirements")
    .insert({ ...requirementPayload(parsed.data, null), tenant_id: ws.tenant.id, contact_id: contactId });
  if (error) return dbErrorState(error, fd);
  revalidatePath(contactPath(slug, contactId));
  redirect(contactPath(slug, contactId));
}

export async function updateRequirementAction(slug: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws, canWrite } = await ctx(slug);
  if (!canWrite) return VIEWER_DENIED;
  const parsed = requirementSchema.safeParse(formObject(fd, ["property_types"]));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { data: cur } = await supabase.from("buyer_requirements").select("contact_id, confirmed_at").eq("id", id).eq("tenant_id", ws.tenant.id).maybeSingle();
  if (!cur) return { error: "找不到此需求" };
  const { data, error } = await supabase
    .from("buyer_requirements")
    .update(requirementPayload(parsed.data, cur.confirmed_at))
    .eq("id", id)
    .eq("tenant_id", ws.tenant.id)
    .select("id");
  if (error) return dbErrorState(error, fd);
  if (!data?.length) return { error: "只有客戶的負責業務或經理可以修改需求", values: echoValues(fd) };
  revalidatePath(contactPath(slug, cur.contact_id));
  redirect(contactPath(slug, cur.contact_id));
}
