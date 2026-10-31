import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page";
import { getWorkspace } from "@/lib/workspace";
import { createRequirementAction } from "../../../actions";
import { RequirementForm } from "../../../requirement-form";

export const metadata = { title: "新增買方需求" };

export default async function NewRequirementPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const [{ data: c }, { data: canEdit }] = await Promise.all([
    supabase.from("contacts").select("display_name").eq("id", id).eq("tenant_id", ws.tenant.id).is("deleted_at", null).maybeSingle(),
    supabase.rpc("can_edit_contact", { p_tenant: ws.tenant.id, p_contact: id }),
  ]);
  if (!c) notFound();
  return (
    <div className="space-y-5">
      <PageHeader title={`新增需求：${c.display_name}`} back={{ href: `/w/${slug}/contacts/${id}`, label: "回客戶" }} />
      {canEdit ? (
        <RequirementForm action={createRequirementAction.bind(null, slug, id)} submitLabel="建立需求" />
      ) : (
        <p className="rounded-md bg-muted px-3 py-3 text-sm">只有客戶的負責業務或經理可以新增需求。</p>
      )}
    </div>
  );
}
