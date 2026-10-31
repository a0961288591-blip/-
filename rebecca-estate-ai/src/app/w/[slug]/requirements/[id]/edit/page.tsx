import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page";
import { getWorkspace } from "@/lib/workspace";
import { updateRequirementAction } from "../../../contacts/actions";
import { RequirementForm, type RequirementDefaults } from "../../../contacts/requirement-form";

export const metadata = { title: "編輯買方需求" };

export default async function EditRequirementPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const { data: r } = await supabase.from("buyer_requirements").select("*").eq("id", id).eq("tenant_id", ws.tenant.id).is("deleted_at", null).maybeSingle();
  if (!r) notFound();
  const { data: canEdit } = await supabase.rpc("can_edit_contact", { p_tenant: ws.tenant.id, p_contact: r.contact_id });
  return (
    <div className="space-y-5">
      <PageHeader title={`編輯需求：${r.title}`} back={{ href: `/w/${slug}/contacts/${r.contact_id}`, label: "回客戶" }} />
      {canEdit ? (
        <RequirementForm action={updateRequirementAction.bind(null, slug, id)} defaults={r as RequirementDefaults} submitLabel="儲存變更" />
      ) : (
        <p className="rounded-md bg-muted px-3 py-3 text-sm">只有客戶的負責業務或經理可以修改需求。</p>
      )}
    </div>
  );
}
