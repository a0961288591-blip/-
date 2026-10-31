import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-grid size-9 place-items-center rounded-lg bg-primary text-[15px] font-semibold text-accent", className)}
    >
      妍
    </span>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-semibold text-primary">陳庭妍 AI 房仲</span>
        {!compact && <span className="text-[11px] tracking-[0.14em] text-accent">REBECCA ESTATE AI</span>}
      </span>
    </span>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 flex justify-center">
        <BrandLockup />
      </div>
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">房地產妍究所 · 房仲業務輔助工具，不代替專業判斷</p>
    </main>
  );
}
