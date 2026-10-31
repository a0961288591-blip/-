import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { listMembers } from "@/lib/members";
import { updatePropertyAction } from "../../actions";
import { PropertyForm, type PropertyDefaults } from "../../property-form";

export const metadata = { title: "編輯物件" };

export default async function EditPropertyPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const [{ data: p }, { data: canEdit }, members] = await Promise.all([
    supabase.from("properties").select("*").eq("id", id).eq("tenant_id", ws.tenant.id).is("deleted_at", null).maybeSingle(),
    supabase.rpc("can_edit_property", { p_tenant: ws.tenant.id, p_property: id }),
    listMembers(supabase, ws.tenant.id),
  ]);
  if (!p) notFound();

  return (
    <div className="space-y-5">
      <PageHeader title={`編輯：${p.title}`} back={{ href: `/w/${slug}/properties/${id}`, label: "回物件" }} />
      {canEdit ? (
        <PropertyForm
          action={updatePropertyAction.bind(null, slug, id)}
          defaults={p as PropertyDefaults}
          members={members.filter((m) => m.status === "active" && m.role !== "viewer")}
          canAssign={roleAtLeast(ws.member.role, "manager")}
          showFloorPrice={false}
          submitLabel="儲存變更"
        />
      ) : (
        <p className="rounded-md bg-muted px-3 py-3 text-sm">只有負責業務、共同開發或經理可以編輯此物件。</p>
      )}
    </div>
  );
}
