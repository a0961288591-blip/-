import Link from "next/link";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** GET 表單篩選列：不需 JavaScript 也能運作，網址可分享 */
export function FilterBar({
  q,
  placeholder,
  selects = [],
  toggles = [],
  resetHref,
}: {
  q?: string;
  placeholder: string;
  selects?: { name: string; label: string; value?: string | null; options: { value: string; label: string }[] }[];
  toggles?: { name: string; label: string; checked: boolean }[];
  resetHref: string;
}) {
  return (
    <form method="get" className="flex flex-col gap-2 rounded-lg border bg-card p-3 md:flex-row md:flex-wrap md:items-center">
      <div className="relative min-w-0 flex-1 md:min-w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-9" aria-label="搜尋" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex">
        {selects.map((s) => (
          <Select key={s.name} name={s.name} defaultValue={s.value ?? ""} aria-label={s.label} className="md:w-36">
            <option value="">全部{s.label}</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
      </div>
      {toggles.map((t) => (
        <label key={t.name} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={t.name} value="1" defaultChecked={t.checked} className="size-4" />
          {t.label}
        </label>
      ))}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          搜尋
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={resetHref}>清除</Link>
        </Button>
      </div>
    </form>
  );
}

export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-xs text-muted-foreground">共 {total} 筆</p>;
  return (
    <nav aria-label="分頁" className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        共 {total} 筆・第 {page}/{pages} 頁
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild size="sm" variant="outline">
            <Link href={hrefFor(page - 1)}>上一頁</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled>
            上一頁
          </Button>
        )}
        {page < pages ? (
          <Button asChild size="sm" variant="outline">
            <Link href={hrefFor(page + 1)}>下一頁</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled>
            下一頁
          </Button>
        )}
      </div>
    </nav>
  );
}

export function queryString(base: Record<string, string | undefined | null>, patch: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
