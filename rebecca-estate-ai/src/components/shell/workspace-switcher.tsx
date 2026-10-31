import Link from "next/link";
import { ChevronsUpDown, Plus } from "lucide-react";
import { ROLE_LABEL, type MemberRole } from "@/lib/workspace";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher({
  current,
  memberships,
  compact = false,
}: {
  current: string;
  memberships: { slug: string; name: string; role: MemberRole }[];
  compact?: boolean;
}) {
  const active = memberships.find((m) => m.slug === current);
  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm [&::-webkit-details-marker]:hidden",
          compact && "py-1.5",
        )}
      >
        <span className="min-w-0 flex-1 truncate font-medium">{active?.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-64 rounded-lg border bg-card p-1 shadow-lg">
        <p className="px-3 py-1.5 text-xs text-muted-foreground">切換工作空間</p>
        <ul>
          {memberships.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/w/${m.slug}/dashboard`}
                className={cn("flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted", m.slug === current && "bg-muted")}
              >
                <span className="truncate">{m.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/onboarding" className="mt-1 flex items-center gap-2 rounded-md border-t px-3 py-2 text-sm text-primary hover:bg-muted">
          <Plus className="size-4" /> 建立新的工作空間
        </Link>
      </div>
    </details>
  );
}
