import { AppShell } from "@/components/shell/app-shell";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ws } = await getWorkspace(slug);
  return <AppShell ws={ws}>{children}</AppShell>;
}
