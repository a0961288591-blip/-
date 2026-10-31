import Link from "next/link";
import { BrandLockup } from "@/components/brand";
import { NavLinks, MobileNav } from "./nav-links";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { ROLE_LABEL, type Workspace } from "@/lib/workspace";
import { Bell, LogOut } from "lucide-react";

function BellLink({ href, unread }: { href: string; unread: number }) {
  return (
    <Link href={href} aria-label={unread ? `通知（${unread} 則未讀）` : "通知"} className="relative inline-grid size-9 shrink-0 place-items-center rounded-md hover:bg-muted">
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-accent-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

export function AppShell({ ws, unread = 0, children }: { ws: Workspace; unread?: number; children: React.ReactNode }) {
  const base = `/w/${ws.tenant.slug}`;
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      {/* 桌面側欄 */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card/60 md:flex">
        <div className="px-4 py-5">
          <Link href={`${base}/dashboard`}>
            <BrandLockup />
          </Link>
        </div>
        <div className="flex items-center gap-1 px-3">
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher current={ws.tenant.slug} memberships={ws.memberships} />
          </div>
          <BellLink href={`${base}/notifications`} unread={unread} />
        </div>
        <nav aria-label="主要導航" className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
          <NavLinks base={base} />
        </nav>
        <div className="border-t p-3 text-sm">
          <div className="truncate font-medium">{ws.displayName}</div>
          <div className="text-xs text-muted-foreground">{ROLE_LABEL[ws.member.role]}</div>
          <form action="/auth/signout" method="post" className="mt-2">
            <button type="submit" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <LogOut className="size-3.5" /> 登出
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* 手機頂部列 */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <Link href={`${base}/dashboard`} aria-label="回首頁">
            <BrandLockup compact />
          </Link>
          <div className="flex min-w-0 max-w-[60%] items-center gap-1">
            <div className="min-w-0 flex-1">
              <WorkspaceSwitcher current={ws.tenant.slug} memberships={ws.memberships} compact />
            </div>
            <BellLink href={`${base}/notifications`} unread={unread} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>
        <MobileNav base={base} />
      </div>
    </div>
  );
}
