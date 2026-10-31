"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { dbErrorState, invalid } from "@/lib/action-utils";
import { fileMetaSchema, floorPriceSchema, formObject, parcelSchema, propertySchema, uuid, verificationSchema } from "@/lib/forms";
import { echoValues, type FormState } from "@/lib/validation";
import { z } from "zod";

const VIEWER_DENIED: FormState = { error: "檢視者無法修改資料" };

async function ctx(slug: string) {
  const { supabase, ws } = await getWorkspace(slug);
  return { supabase, ws, isManager: roleAtLeast(ws.member.role, "manager"), canWrite: roleAtLeast(ws.member.role, "agent") };
}

function propertyPath(slug: string, id?: string) {
  return id ? `/w/${slug}/properties/${id}` : `/w/${slug}/properties`;
}

// ------------------------------------------------------------ 建立 / 更新
export async function createPropertyAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws, isManager, canWrite } = await ctx(slug);
  if (!canWrite) return VIEWER_DENIED;

  const raw = formObject(fd);
  if (!isManager) raw.owner_agent_id = ws.userId; // 業務只能以自己為負責人
  const parsed = propertySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, fd);
  const floor = floorPriceSchema.safeParse(raw);
  if (!floor.success) return invalid(floor.error, fd);

  // 重複案件提醒
  if (fd.get("confirm_duplicate") !== "on") {
    const { data: dups } = await supabase.rpc("find_duplicate_properties", {
      p_tenant: ws.tenant.id,
      p_title: parsed.data.title,
      p_address: parsed.data.address,
      p_parcel_nos: [],
    });
    if (dups?.length) {
      return {
        values: echoValues(fd),
        duplicates: (dups as { id: string; code: string; title: string; reason: string }[]).map((d) => ({
          href: propertyPath(slug, d.id),
          label: `${d.code} ${d.title}`,
          reason: d.reason,
        })),
      };
    }
  }

  const { data, error } = await supabase
    .from("properties")
    .insert({ ...parsed.data, code: parsed.data.code ?? "", tenant_id: ws.tenant.id })
    .select("id")
    .single();
  if (error || !data) return dbErrorState(error, fd);

  if (floor.data.floor_price !== null || floor.data.commission_terms) {
    const { error: pErr } = await supabase.from("property_private").insert({ tenant_id: ws.tenant.id, property_id: data.id, ...floor.data });
    if (pErr) console.error("[property_private]", pErr.code);
  }
  revalidatePath(propertyPath(slug));
  redirect(propertyPath(slug, data.id));
}

export async function updatePropertyAction(slug: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws, isManager, canWrite } = await ctx(slug);
  if (!canWrite) return VIEWER_DENIED;
  const raw = formObject(fd);
  if (!isManager) {
    // 業務不能把案件轉給別人：沿用原負責人
    const { data: cur } = await supabase.from("properties").select("owner_agent_id").eq("id", id).eq("tenant_id", ws.tenant.id).maybeSingle();
    raw.owner_agent_id = cur?.owner_agent_id ?? ws.userId;
  }
  const parsed = propertySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, fd);

  const { data, error } = await supabase
    .from("properties")
    .update({ ...parsed.data, code: parsed.data.code ?? undefined })
    .eq("id", id)
    .eq("tenant_id", ws.tenant.id)
    .select("id");
  if (error) return dbErrorState(error, fd);
  if (!data?.length) return { error: "你沒有權限編輯此物件（僅負責業務、共同開發或經理可編輯）", values: echoValues(fd) };

  revalidatePath(propertyPath(slug, id));
  redirect(propertyPath(slug, id));
}

export async function toggleArchivePropertyAction(slug: string, id: string, archive: boolean): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const { data, error } = await supabase
    .from("properties")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("tenant_id", ws.tenant.id)
    .select("id");
  if (error) return dbErrorState(error);
  if (!data?.length) return { error: "你沒有權限封存此物件" };
  revalidatePath(propertyPath(slug, id));
  revalidatePath(propertyPath(slug));
  return { ok: true, message: archive ? "已封存" : "已解除封存" };
}

// ------------------------------------------------------------ 底價（機敏）
export async function saveFloorPriceAction(slug: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const parsed = floorPriceSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase
    .from("property_private")
    .upsert({ tenant_id: ws.tenant.id, property_id: id, ...parsed.data }, { onConflict: "property_id" });
  if (error) return dbErrorState(error, fd);
  revalidatePath(propertyPath(slug, id));
  return { ok: true, message: "已更新內部底價" };
}

// ------------------------------------------------------------ 資料查證
export async function saveVerificationAction(slug: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const parsed = verificationSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);

  const { data: cur, error: readErr } = await supabase
    .from("properties")
    .select("field_verifications")
    .eq("id", id)
    .eq("tenant_id", ws.tenant.id)
    .maybeSingle();
  if (readErr || !cur) return dbErrorState(readErr, fd);

  const { field, ...entry } = parsed.data;
  const next = {
    ...(cur.field_verifications as Record<string, unknown>),
    [field]: { ...entry, updated_by: ws.userId, updated_at: new Date().toISOString() },
  };
  const { data, error } = await supabase.from("properties").update({ field_verifications: next }).eq("id", id).eq("tenant_id", ws.tenant.id).select("id");
  if (error) return dbErrorState(error, fd);
  if (!data?.length) return { error: "你沒有權限更新此物件的查證資料" };
  revalidatePath(propertyPath(slug, id));
  return { ok: true, message: "已更新查證狀態" };
}

// ------------------------------------------------------------ 地號
export async function addParcelAction(slug: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const parsed = parcelSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase.from("property_parcels").insert({ tenant_id: ws.tenant.id, property_id: id, ...parsed.data });
  if (error) return dbErrorState(error, fd);
  revalidatePath(propertyPath(slug, id));
  return { ok: true, message: `已新增地號 ${parsed.data.parcel_no}` };
}

export async function deleteParcelAction(slug: string, propertyId: string, parcelId: string): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const { data, error } = await supabase.from("property_parcels").delete().eq("id", parcelId).eq("tenant_id", ws.tenant.id).select("id");
  if (error) return dbErrorState(error);
  if (!data?.length) return { error: "你沒有權限刪除此地號" };
  revalidatePath(propertyPath(slug, propertyId));
  return { ok: true };
}

// ------------------------------------------------------------ 屋主關聯 / 共同開發
export async function linkContactAction(slug: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const parsed = z
    .object({ contact_id: uuid(), relation: z.enum(["owner", "co_owner", "representative", "mandator"]) })
    .safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase.from("property_contacts").insert({ tenant_id: ws.tenant.id, property_id: id, ...parsed.data });
  if (error) return dbErrorState(error, fd);
  revalidatePath(propertyPath(slug, id));
  return { ok: true, message: "已建立關聯" };
}

export async function unlinkContactAction(slug: string, propertyId: string, linkId: string): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const { data, error } = await supabase.from("property_contacts").delete().eq("id", linkId).eq("tenant_id", ws.tenant.id).select("id");
  if (error) return dbErrorState(error);
  if (!data?.length) return { error: "你沒有權限移除此關聯" };
  revalidatePath(propertyPath(slug, propertyId));
  return { ok: true };
}

export async function addAssignmentAction(slug: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const parsed = z
    .object({
      user_id: uuid(),
      role: z.enum(["co_developer", "assistant"]),
      share_pct: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).max(100).nullable()),
    })
    .safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase.from("property_assignments").insert({ tenant_id: ws.tenant.id, property_id: id, ...parsed.data });
  if (error) return dbErrorState(error, fd);
  revalidatePath(propertyPath(slug, id));
  return { ok: true, message: "已加入共同開發" };
}

export async function removeAssignmentAction(slug: string, propertyId: string, assignmentId: string): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const { data, error } = await supabase.from("property_assignments").delete().eq("id", assignmentId).eq("tenant_id", ws.tenant.id).select("id");
  if (error) return dbErrorState(error);
  if (!data?.length) return { error: "只有經理或主負責人可以調整共同開發" };
  revalidatePath(propertyPath(slug, propertyId));
  return { ok: true };
}

// ------------------------------------------------------------ 附件
/** 第 1 步：建立中繼資料（RLS 驗證權限），回傳 Storage 路徑讓瀏覽器上傳 */
export async function prepareUploadAction(
  slug: string,
  propertyId: string,
  meta: { kind: string; sensitivity: string; file_name: string; mime_type: string | null; size_bytes: number },
): Promise<{ ok: true; fileId: string; path: string } | { ok: false; error: string }> {
  const { supabase, ws } = await ctx(slug);
  const parsed = fileMetaSchema.safeParse(meta);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "檔案資料不正確" };

  const fileId = crypto.randomUUID();
  const ext = (parsed.data.file_name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] ?? "bin").toLowerCase();
  // 路徑只用 ASCII，原始中文檔名存在 file_name 欄位
  const path = `${ws.tenant.id}/${propertyId}/${fileId}/file.${ext}`;
  const { error } = await supabase
    .from("property_files")
    .insert({ id: fileId, tenant_id: ws.tenant.id, property_id: propertyId, storage_path: path, ...parsed.data });
  if (error) {
    const msg = dbErrorState(error).error ?? "無法建立檔案資料";
    return { ok: false, error: msg };
  }
  return { ok: true, fileId, path };
}

/** 上傳失敗時把中繼資料標記刪除 */
export async function abortUploadAction(slug: string, fileId: string) {
  const { supabase, ws } = await ctx(slug);
  await supabase.from("property_files").update({ deleted_at: new Date().toISOString() }).eq("id", fileId).eq("tenant_id", ws.tenant.id);
}

export async function finishUploadAction(slug: string, propertyId: string) {
  revalidatePath(propertyPath(slug, propertyId));
}

/** 短效下載連結（60 秒）；Storage RLS 再次驗證權限 */
export async function fileDownloadUrlAction(slug: string, fileId: string): Promise<{ url?: string; error?: string }> {
  const { supabase, ws } = await ctx(slug);
  const { data: file } = await supabase
    .from("property_files")
    .select("storage_path, file_name")
    .eq("id", fileId)
    .eq("tenant_id", ws.tenant.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!file) return { error: "找不到檔案或沒有權限" };
  const { data, error } = await supabase.storage.from("property-files").createSignedUrl(file.storage_path, 60, { download: file.file_name });
  if (error || !data) return { error: "無法產生下載連結" };
  return { url: data.signedUrl };
}

export async function deleteFileAction(slug: string, propertyId: string, fileId: string): Promise<FormState> {
  const { supabase, ws } = await ctx(slug);
  const { data, error } = await supabase
    .from("property_files")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", fileId)
    .eq("tenant_id", ws.tenant.id)
    .select("id");
  if (error) return dbErrorState(error);
  if (!data?.length) return { error: "你沒有權限刪除此檔案" };
  revalidatePath(propertyPath(slug, propertyId));
  return { ok: true };
}
