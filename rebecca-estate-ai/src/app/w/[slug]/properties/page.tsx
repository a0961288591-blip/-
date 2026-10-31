import Link from "next/link";
import { Plus } from "lucide-react";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { listMembers, memberName } from "@/lib/members";
import { ilikeAny, pick } from "@/lib/search";
import { PROPERTY_STATUS, PROPERTY_TYPE, labelOf, optionsOf } from "@/lib/labels";
import { formatPing, formatTwd } from "@/lib/format";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/page";
import { FilterBar, Pagination, queryString } from "@/components/list-tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "房源" };
const PAGE_SIZE = 30;

type SP = { q?: string; type?: string; status?: string; archived?: string; mine?: string; page?: string };

export default async function PropertiesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, ws } = await getWorkspace(slug);
  const page = Math.max(1, Number(sp.page) || 1);
  const type = pick(sp.type, Object.keys(PROPERTY_TYPE));
  const status = pick(sp.status, Object.keys(PROPERTY_STATUS));
  const archived = sp.archived === "1";
  const mine = sp.mine === "1";

  let query = supabase
    .from("properties")
    .select("id, code, title, property_type, status, district, city, list_price, land_area_ping, building_area_ping, zoning, owner_agent_id, mandate_end_date, archived_at", { count: "exact" })
    .eq("tenant_id", ws.tenant.id)
    .is("deleted_at", null);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const or = ilikeAny(["title", "code", "address", "district", "zoning"], sp.q ?? "");
  if (or) query = query.or(or);
  if (type) query = query.eq("property_type", type);
  if (status) query = query.eq("status", status);
  if (mine) query = query.eq("owner_agent_id", ws.userId);

  const [{ data, count, error }, members] = await Promise.all([
    query.order("updated_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    listMembers(supabase, ws.tenant.id),
  ]);
  const rows = (data ?? []) as {
    id: string;
    code: string;
    title: string;
    property_type: string;
    status: string;
    district: string | null;
    city: string | null;
    list_price: number | null;
    land_area_ping: number | null;
    building_area_ping: number | null;
    zoning: string | null;
    owner_agent_id: string | null;
    mandate_end_date: string | null;
  }[];
  const base = { q: sp.q, type: type ?? undefined, status: status ?? undefined, archived: archived ? "1" : undefined, mine: mine ? "1" : undefined };

  return (
    <div className="space-y-4">
      <PageHeader
        title="房源"
        description="住宅、店面、建地、農地、工業地…所有案件"
        actions={
          roleAtLeast(ws.member.role, "agent") && (
            <Button asChild>
              <Link href={`/w/${slug}/properties/new`}>
                <Plus /> 新增物件
              </Link>
            </Button>
          )
        }
      />
      <FilterBar
        q={sp.q}
        placeholder="搜尋名稱、編號、地址、行政區、分區"
        resetHref={`/w/${slug}/properties`}
        selects={[
          { name: "type", label: "類型", value: type, options: optionsOf(PROPERTY_TYPE) },
          { name: "status", label: "狀態", value: status, options: optionsOf(PROPERTY_STATUS) },
        ]}
        toggles={[
          { name: "mine", label: "只看我負責", checked: mine },
          { name: "archived", label: "已封存", checked: archived },
        ]}
      />
      {error && <ErrorNotice>讀取房源失敗，請重新整理。</ErrorNotice>}

      {rows.length === 0 ? (
        <EmptyState title={sp.q || type || status ? "找不到符合條件的物件" : archived ? "沒有封存的物件" : "還沒有物件"}>
          {!sp.q && !archived && roleAtLeast(ws.member.role, "agent") && <Link href={`/w/${slug}/properties/new`} className="text-primary underline">新增第一筆物件</Link>}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/w/${slug}/properties/${p.id}`} className="block h-full rounded-lg border bg-card p-4 transition-colors hover:border-primary/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{p.code}</p>
                    <p className="truncate font-medium">{p.title}</p>
                  </div>
                  <Badge variant={p.status === "active" ? "success" : p.status === "draft" ? "muted" : "gold"}>{labelOf(PROPERTY_STATUS, p.status)}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="muted">{labelOf(PROPERTY_TYPE, p.property_type)}</Badge>
                  <Badge variant="muted">{[p.city, p.district].filter(Boolean).join(" ") || "區域待確認"}</Badge>
                  {p.zoning && <Badge variant="muted">{p.zoning}</Badge>}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">開價</dt>
                    <dd className={p.list_price == null ? "text-warning" : "font-semibold text-primary"}>{formatTwd(p.list_price)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">地坪</dt>
                    <dd className={p.land_area_ping == null ? "text-warning" : ""}>{formatPing(p.land_area_ping)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">建坪</dt>
                    <dd className={p.building_area_ping == null ? "text-warning" : ""}>{formatPing(p.building_area_ping)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  負責：{memberName(members, p.owner_agent_id)}
                  {p.mandate_end_date && `・委託至 ${p.mandate_end_date}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} hrefFor={(n) => `/w/${slug}/properties${queryString(base, { page: n })}`} />
    </div>
  );
}
