import Link from "next/link";
import { getWorkspace } from "@/lib/workspace";
import { ilikeAny, pick } from "@/lib/search";
import { PROPERTY_TYPE, REQUIREMENT_STATUS, labelOf, optionsOf } from "@/lib/labels";
import { formatTwd } from "@/lib/format";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/page";
import { FilterBar, Pagination, queryString } from "@/components/list-tools";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "買方需求" };
const PAGE_SIZE = 40;

type SP = { q?: string; status?: string; type?: string; page?: string };

export default async function RequirementsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, ws } = await getWorkspace(slug);
  const page = Math.max(1, Number(sp.page) || 1);
  const status = pick(sp.status, Object.keys(REQUIREMENT_STATUS)) ?? (sp.status === undefined ? "active" : null);
  const type = pick(sp.type, Object.keys(PROPERTY_TYPE));

  let query = supabase
    .from("buyer_requirements")
    .select("id, title, status, contact_id, property_types, cities, districts, budget_min, budget_max, exclusions, confirmed_at, contacts(display_name, grade)", { count: "exact" })
    .eq("tenant_id", ws.tenant.id)
    .is("deleted_at", null);
  const or = ilikeAny(["title", "purpose", "notes"], sp.q ?? "");
  if (or) query = query.or(or);
  if (status) query = query.eq("status", status);
  if (type) query = query.contains("property_types", [type]);
  const { data, count, error } = await query.order("updated_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  type Row = {
    id: string;
    title: string;
    status: string;
    contact_id: string;
    property_types: string[];
    cities: string[];
    districts: string[];
    budget_min: number | null;
    budget_max: number | null;
    exclusions: string[];
    confirmed_at: string | null;
    contacts: { display_name: string; grade: string | null } | { display_name: string; grade: string | null }[] | null;
  };
  const rows = (data ?? []) as Row[];
  const base = { q: sp.q, status: status ?? "all", type: type ?? undefined };

  return (
    <div className="space-y-4">
      <PageHeader title="買方需求" description="需求從客戶頁建立；一位買方可有多組需求" />
      <FilterBar
        q={sp.q}
        placeholder="搜尋需求名稱、用途、備註"
        resetHref={`/w/${slug}/requirements`}
        selects={[
          { name: "status", label: "狀態", value: status, options: optionsOf(REQUIREMENT_STATUS) },
          { name: "type", label: "類型", value: type, options: optionsOf(PROPERTY_TYPE) },
        ]}
      />
      {error && <ErrorNotice>讀取需求失敗，請重新整理。</ErrorNotice>}
      {rows.length === 0 ? (
        <EmptyState title="沒有符合條件的需求">
          到「
          <Link href={`/w/${slug}/contacts?type=buyer`} className="text-primary underline">
            客戶
          </Link>
          」打開買方，即可新增需求。
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
            const budget =
              r.budget_min == null && r.budget_max == null ? "預算待確認" : `${r.budget_min == null ? "" : formatTwd(r.budget_min)} ～ ${r.budget_max == null ? "" : formatTwd(r.budget_max)}`;
            return (
              <li key={r.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/w/${slug}/contacts/${r.contact_id}`} className="text-sm text-muted-foreground hover:underline">
                      {c?.grade && `${c.grade}・`}
                      {c?.display_name ?? "客戶"}
                    </Link>
                    <p className="truncate font-medium">{r.title}</p>
                  </div>
                  <span className="flex shrink-0 gap-1">
                    <Badge variant={r.status === "active" ? "success" : "muted"}>{labelOf(REQUIREMENT_STATUS, r.status)}</Badge>
                    {!r.confirmed_at && <Badge variant="warning">待確認</Badge>}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  <span className={r.budget_min == null && r.budget_max == null ? "text-warning" : "font-medium text-primary"}>{budget}</span>
                  <span className="text-muted-foreground">・{[...r.cities, ...r.districts].join("、") || "區域不限／待確認"}</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {(r.property_types.length ? r.property_types : ["__any"]).map((t) => (
                    <Badge key={t} variant="muted">
                      {t === "__any" ? "類型不限" : labelOf(PROPERTY_TYPE, t)}
                    </Badge>
                  ))}
                </p>
                {r.exclusions.length > 0 && <p className="mt-1 text-xs text-destructive">排除：{r.exclusions.join("、")}</p>}
                <Link href={`/w/${slug}/requirements/${r.id}/edit`} className="mt-2 inline-block text-xs text-primary underline underline-offset-2">
                  編輯
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} hrefFor={(n) => `/w/${slug}/requirements${queryString(base, { page: n })}`} />
    </div>
  );
}
