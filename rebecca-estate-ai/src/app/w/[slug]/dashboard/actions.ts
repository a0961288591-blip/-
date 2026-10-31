"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { fieldErrorsOf, keepValues, quickTaskSchema, type FormState } from "@/lib/validation";

/** 快速新增待辦：指派給自己。tenant_id 由伺服器依網址工作空間決定，並再經 RLS 驗證。 */
export async function quickAddTaskAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, ws } = await getWorkspace(slug);
  if (!roleAtLeast(ws.member.role, "agent")) return { error: "檢視者無法新增待辦" };

  const parsed = quickTaskSchema.safeParse({
    title: formData.get("title"),
    priority: formData.get("priority"),
    dueAt: formData.get("dueAt") || undefined,
  });
  const values = keepValues(formData, ["title", "priority", "dueAt"]);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { error } = await supabase.from("tasks").insert({
    tenant_id: ws.tenant.id,
    title: parsed.data.title,
    priority: parsed.data.priority,
    due_at: parsed.data.dueAt,
    assignee_id: ws.userId,
  });
  if (error) return { error: "新增失敗，請稍後再試", values };

  revalidatePath(`/w/${slug}/dashboard`);
  return { ok: true, message: `已新增：${parsed.data.title}` };
}
