import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { listMembers } from "@/lib/members";
import { pick } from "@/lib/search";
import { CONTACT_TYPE } from "@/lib/labels";
import { createContactAction } from "../actions";
import { ContactForm } from "../contact-form";

export const metadata = { title: "新增客戶" };

export default async function NewContactPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> }) {
  const { slug } = await params;
  const { type } = await searchParams;
  const { supabase, ws } = await getWorkspace(slug);
  if (!roleAtLeast(ws.member.role, "agent")) redirect(`/w/${slug}/contacts`);
  const members = (await listMembers(supabase, ws.tenant.id)).filter((m) => m.status === "active" && m.role !== "viewer");
  const preset = pick(type, Object.keys(CONTACT_TYPE));

  return (
    <div className="space-y-5">
      <PageHeader title="新增客戶" back={{ href: `/w/${slug}/contacts`, label: "客戶" }} />
      <ContactForm
        action={createContactAction.bind(null, slug)}
        defaults={{ owner_user_id: ws.userId, contact_types: preset ? [preset] : [] }}
        members={members}
        canAssign={roleAtLeast(ws.member.role, "manager")}
        showPii
        submitLabel="建立客戶"
      />
    </div>
  );
}
