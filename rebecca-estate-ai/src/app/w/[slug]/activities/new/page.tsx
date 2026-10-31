import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { toTaipeiLocalInput } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/page";
import { logActivityAction } from "../../contacts/actions";
import { ActivityForm } from "../../contacts/activity-form";

export const metadata = { title: "記錄聯繫" };

/** 手機快速記錄：帶看、通話後馬上填 */
export default async function NewActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  if (!roleAtLeast(ws.member.role, "agent")) redirect(`/w/${slug}/contacts`);

  const tid = ws.tenant.id;
  const [mine, others, props] = await Promise.all([
    supabase.from("contacts").select("id, display_name, company").eq("tenant_id", tid).eq("owner_user_id", ws.userId).is("deleted_at", null).is("archived_at", null).order("updated_at", { ascending: false }).limit(200),
    supabase.from("contacts").select("id, display_name, company").eq("tenant_id", tid).neq("owner_user_id", ws.userId).is("deleted_at", null).is("archived_at", null).order("updated_at", { ascending: false }).limit(200),
    supabase.from("properties").select("id, code, title").eq("tenant_id", tid).is("deleted_at", null).is("archived_at", null).order("updated_at", { ascending: false }).limit(100),
  ]);
  type C = { id: string; display_name: string; company: string | null };
  const contacts = [...((mine.data ?? []) as C[]), ...((others.data ?? []) as C[])].map((c) => ({ id: c.id, display_name: c.company ? `${c.display_name}（${c.company}）` : c.display_name }));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="記錄聯繫" description="電話、LINE、面談、帶看、議價都在這裡記錄" back={{ href: `/w/${slug}/dashboard`, label: "首頁" }} />
      {contacts.length === 0 ? (
        <EmptyState title="還沒有客戶">
          請先
          <Link href={`/w/${slug}/contacts/new`} className="text-primary underline">
            新增客戶
          </Link>
          。
        </EmptyState>
      ) : (
        <div className="rounded-lg border bg-card p-4">
          <ActivityForm
            action={logActivityAction.bind(null, slug, null)}
            contacts={contacts}
            properties={((props.data ?? []) as { id: string; code: string; title: string }[]).map((p) => ({ id: p.id, label: `${p.code} ${p.title}` }))}
            nowLocal={toTaipeiLocalInput(new Date().toISOString())!}
            submitLabel="儲存紀錄"
          />
        </div>
      )}
    </div>
  );
}
