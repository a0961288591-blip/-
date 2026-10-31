"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CURRENT_PHASE, MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";

export function NavLinks({ base, onNavigate }: { base: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {MODULES.map((m) => {
        const href = `${base}/${m.key}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const Icon = m.icon;
        return (
          <li key={m.key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{m.label}</span>
              {m.phase > CURRENT_PHASE && (
                <span className={cn("text-[10px]", active ? "text-primary-foreground/70" : "text-muted-foreground")}>規劃中</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 手機底部導航：常用 4 項 + 全部選單 */
export function MobileNav({ base }: { base: string }) {
  const pathname = usePathname();
  const items = MODULES.filter((m) => m.mobile);
  return (
    <nav
      aria-label="手機導航"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((m) => {
          const href = `${base}/${m.key}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = m.icon;
          return (
            <li key={m.key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="size-5" />
                {m.label}
              </Link>
            </li>
          );
        })}
        <li>
          <details className="group relative">
            <summary className="flex cursor-pointer list-none flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Menu className="size-5" />
              全部
            </summary>
            <div className="absolute bottom-full right-2 mb-2 w-56 rounded-lg border bg-card p-2 shadow-lg">
              <NavLinks base={base} />
              <form action="/auth/signout" method="post" className="mt-1 border-t pt-1">
                <button type="submit" className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted">
                  登出
                </button>
              </form>
            </div>
          </details>
        </li>
      </ul>
    </nav>
  );
}
