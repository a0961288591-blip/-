import { AppShell } from "@/components/shell/app-shell";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ws.tenant.id)
    .eq("user_id", ws.userId)
    .is("read_at", null);
  return (
    <AppShell ws={ws} unread={count ?? 0}>
      {children}
    </AppShell>
  );
}
