import Link from "next/link";
import { getWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/page";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { markReadAction } from "./actions";

export const metadata = { title: "通知" };

const KIND_LABEL: Record<string, string> = {
  morning_top3: "今日 TOP 3",
  evening_review: "今日回顧",
  weekly_summary: "週結算",
  mandate_expiring: "委託到期",
};

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("tenant_id", ws.tenant.id)
    .eq("user_id", ws.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[];
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="通知"
        description="由伺服器排程產生；LINE／Email 推播尚未串接"
        actions={unread > 0 && <ActionButton variant="outline" action={markReadAction.bind(null, slug, null)}>全部標為已讀</ActionButton>}
      />
      {error && <ErrorNotice>讀取通知失敗。</ErrorNotice>}
      {rows.length === 0 ? (
        <EmptyState title="目前沒有通知">排程啟用後，每天會在你設定的時段收到 TOP 3、回顧與週結算。</EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((n) => (
            <li key={n.id} className={n.read_at ? "px-4 py-3" : "bg-accent-soft/40 px-4 py-3"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {!n.read_at && <span className="size-2 rounded-full bg-accent" aria-label="未讀" />}
                    <Badge variant="muted">{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                    {n.link ? (
                      <Link href={n.link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  {n.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <ActionButton size="sm" variant="ghost" action={markReadAction.bind(null, slug, n.id)}>
                    已讀
                  </ActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
