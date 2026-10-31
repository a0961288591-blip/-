import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { listMembers } from "@/lib/members";
import { createPropertyAction } from "../actions";
import { PropertyForm } from "../property-form";

export const metadata = { title: "新增物件" };

export default async function NewPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  if (!roleAtLeast(ws.member.role, "agent")) redirect(`/w/${slug}/properties`);
  const members = (await listMembers(supabase, ws.tenant.id)).filter((m) => m.status === "active" && m.role !== "viewer");

  return (
    <div className="space-y-5">
      <PageHeader title="新增物件" back={{ href: `/w/${slug}/properties`, label: "房源" }} />
      <PropertyForm
        action={createPropertyAction.bind(null, slug)}
        defaults={{ owner_agent_id: ws.userId }}
        members={members}
        canAssign={roleAtLeast(ws.member.role, "manager")}
        showFloorPrice
        submitLabel="建立物件"
      />
    </div>
  );
}
