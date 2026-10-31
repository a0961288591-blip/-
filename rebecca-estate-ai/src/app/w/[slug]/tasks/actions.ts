"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { dbErrorState, invalid } from "@/lib/action-utils";
import { formObject, taskSchema, taskStatusSchema } from "@/lib/forms";
import { taipeiDate } from "@/lib/format";
import type { FormState } from "@/lib/validation";

export async function createTaskAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await getWorkspace(slug);
  if (!roleAtLeast(ws.member.role, "agent")) return { error: "檢視者無法新增待辦" };
  const raw = formObject(fd);
  if (!roleAtLeast(ws.member.role, "manager")) raw.assignee_id = ws.userId;
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, fd);

  const scheduled = parsed.data.due_at ? taipeiDate(new Date(parsed.data.due_at)) : taipeiDate();
  const { error } = await supabase.from("tasks").insert({
    ...parsed.data,
    tenant_id: ws.tenant.id,
    // 排定日不早於今天；未來截止的待辦排在截止當天
    scheduled_date: scheduled < taipeiDate() ? taipeiDate() : scheduled,
  });
  if (error) return dbErrorState(error, fd);
  revalidatePath(`/w/${slug}/tasks`);
  revalidatePath(`/w/${slug}/dashboard`);
  return { ok: true, message: `已新增：${parsed.data.title}` };
}

export async function setTaskStatusAction(slug: string, taskId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, ws } = await getWorkspace(slug);
  const parsed = taskStatusSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const patch: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "blocked") patch.blocker = parsed.data.blocker;
  else if (parsed.data.status !== "cancelled") patch.blocker = null;
  if (parsed.data.next_step !== null) patch.next_step = parsed.data.next_step;

  const { data, error } = await supabase.from("tasks").update(patch).eq("id", taskId).eq("tenant_id", ws.tenant.id).select("id");
  if (error) return dbErrorState(error, fd);
  if (!data?.length) return { error: "只有指派對象、建立者或經理可以更新此待辦" };
  revalidatePath(`/w/${slug}/tasks`);
  revalidatePath(`/w/${slug}/dashboard`);
  return { ok: true };
}
