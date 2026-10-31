import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { listMembers } from "@/lib/members";
import { toTaipeiLocalInput } from "@/lib/format";
import { updateContactAction } from "../../actions";
import { ContactForm } from "../../contact-form";

export const metadata = { title: "編輯客戶" };

export default async function EditContactPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const tid = ws.tenant.id;
  const [{ data: c }, { data: canEdit }, { data: canPii }, members] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", id).eq("tenant_id", tid).is("deleted_at", null).maybeSingle(),
    supabase.rpc("can_edit_contact", { p_tenant: tid, p_contact: id }),
    supabase.rpc("can_view_contact_pii", { p_tenant: tid, p_contact: id }),
    listMembers(supabase, tid),
  ]);
  if (!c) notFound();
  const { data: pii } = canPii ? await supabase.from("contact_pii").select("phone, phone_alt, email, line_id, address").eq("contact_id", id).maybeSingle() : { data: null };

  return (
    <div className="space-y-5">
      <PageHeader title={`編輯：${c.display_name}`} back={{ href: `/w/${slug}/contacts/${id}`, label: "回客戶" }} />
      {canEdit ? (
        <ContactForm
          action={updateContactAction.bind(null, slug, id)}
          defaults={{ ...c, next_follow_up_local: toTaipeiLocalInput(c.next_follow_up_at), ...(pii ?? {}) }}
          members={members.filter((m) => m.status === "active" && m.role !== "viewer")}
          canAssign={roleAtLeast(ws.member.role, "manager")}
          showPii={!!canPii}
          submitLabel="儲存變更"
        />
      ) : (
        <p className="rounded-md bg-muted px-3 py-3 text-sm">只有負責業務或經理可以編輯此客戶。</p>
      )}
    </div>
  );
}
