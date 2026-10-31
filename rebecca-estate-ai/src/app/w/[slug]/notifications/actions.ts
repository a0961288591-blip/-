"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace } from "@/lib/workspace";
import { dbErrorState } from "@/lib/action-utils";
import type { FormState } from "@/lib/validation";

export async function markReadAction(slug: string, id: string | null): Promise<FormState> {
  const { supabase, ws } = await getWorkspace(slug);
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("tenant_id", ws.tenant.id).eq("user_id", ws.userId).is("read_at", null);
  if (id) q = q.eq("id", id);
  const { error } = await q;
  if (error) return dbErrorState(error);
  revalidatePath(`/w/${slug}`, "layout");
  return { ok: true };
}
