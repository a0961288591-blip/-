import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { UNKNOWN } from "@/lib/format";

export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="space-y-2">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-primary">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/60 px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

/** 欄位顯示：值為空顯示「待確認」（橘色），不補任何推測值 */
export function DataRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  const empty = value === null || value === undefined || value === "" || value === UNKNOWN;
  return (
    <div className={cn("flex justify-between gap-4 border-b py-2 text-sm last:border-0", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-right", empty && "text-warning")}>{empty ? UNKNOWN : value}</dd>
    </div>
  );
}

export function Section({ title, actions, children, className }: { title: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4 md:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
