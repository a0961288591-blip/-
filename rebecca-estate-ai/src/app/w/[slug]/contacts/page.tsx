import Link from "next/link";
import { Plus } from "lucide-react";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { listMembers, memberName } from "@/lib/members";
import { ilikeAny, pick } from "@/lib/search";
import { CONTACT_GRADE, CONTACT_STAGE, CONTACT_TYPE, labelOf, optionsOf } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/page";
import { FilterBar, Pagination, queryString } from "@/components/list-tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "客戶" };
const PAGE_SIZE = 40;

type SP = { q?: string; type?: string; grade?: string; stage?: string; mine?: string; overdue?: string; archived?: string; page?: string };

export default async function ContactsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, ws } = await getWorkspace(slug);
  const page = Math.max(1, Number(sp.page) || 1);
  const type = pick(sp.type, Object.keys(CONTACT_TYPE));
  const grade = pick(sp.grade, Object.keys(CONTACT_GRADE));
  const stage = pick(sp.stage, Object.keys(CONTACT_STAGE));
  const mine = sp.mine === "1";
  const overdue = sp.overdue === "1";
  const archived = sp.archived === "1";

  let query = supabase
    .from("contacts")
    .select("id, display_name, company, contact_types, grade, stage, owner_user_id, last_contacted_at, next_follow_up_at, do_not_contact, is_public_lead", { count: "exact" })
    .eq("tenant_id", ws.tenant.id)
    .is("deleted_at", null);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const or = ilikeAny(["display_name", "company", "source"], sp.q ?? "");
  if (or) query = query.or(or);
  if (type) query = query.contains("contact_types", [type]);
  if (grade) query = query.eq("grade", grade);
  if (stage) query = query.eq("stage", stage);
  if (mine) query = query.eq("owner_user_id", ws.userId);
  if (overdue) query = query.lt("next_follow_up_at", new Date().toISOString());

  const [{ data, count, error }, members] = await Promise.all([
    (overdue ? query.order("next_follow_up_at", { ascending: true }) : query.order("updated_at", { ascending: false })).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    listMembers(supabase, ws.tenant.id),
  ]);
  const rows = (data ?? []) as {
    id: string;
    display_name: string;
    company: string | null;
    contact_types: string[];
    grade: string | null;
    stage: string;
    owner_user_id: string | null;
    last_contacted_at: string | null;
    next_follow_up_at: string | null;
    do_not_contact: boolean;
    is_public_lead: boolean;
  }[];
  const now = Date.now();
  const base = { q: sp.q, type: type ?? undefined, grade: grade ?? undefined, stage: stage ?? undefined, mine: mine ? "1" : undefined, overdue: overdue ? "1" : undefined, archived: archived ? "1" : undefined };

  return (
    <div className="space-y-4">
      <PageHeader
        title="客戶"
        description="屋主、買方、建商、法人、投資人與合作夥伴"
        actions={
          roleAtLeast(ws.member.role, "agent") && (
            <>
              <Button asChild variant="outline">
                <Link href={`/w/${slug}/activities/new`}>記錄聯繫</Link>
              </Button>
              <Button asChild>
                <Link href={`/w/${slug}/contacts/new`}>
                  <Plus /> 新增客戶
                </Link>
              </Button>
            </>
          )
        }
      />
      <FilterBar
        q={sp.q}
        placeholder="搜尋姓名、公司、來源"
        resetHref={`/w/${slug}/contacts`}
        selects={[
          { name: "type", label: "類型", value: type, options: optionsOf(CONTACT_TYPE) },
          { name: "grade", label: "分級", value: grade, options: optionsOf(CONTACT_GRADE) },
          { name: "stage", label: "階段", value: stage, options: optionsOf(CONTACT_STAGE) },
        ]}
        toggles={[
          { name: "mine", label: "只看我負責", checked: mine },
          { name: "overdue", label: "追蹤逾期", checked: overdue },
          { name: "archived", label: "已封存", checked: archived },
        ]}
      />
      {error && <ErrorNotice>讀取客戶失敗，請重新整理。</ErrorNotice>}

      {rows.length === 0 ? (
        <EmptyState title={sp.q || type || grade || stage || overdue ? "找不到符合條件的客戶" : "還沒有客戶"} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((c) => {
            const late = c.next_follow_up_at && Date.parse(c.next_follow_up_at) < now;
            return (
              <li key={c.id}>
                <Link href={`/w/${slug}/contacts/${c.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/40 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {c.grade && <Badge variant={c.grade === "S" ? "gold" : "muted"}>{c.grade}</Badge>}
                      <span className="truncate">{c.display_name}</span>
                      {c.company && <span className="truncate text-sm text-muted-foreground">{c.company}</span>}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {c.contact_types.map((t) => (
                        <Badge key={t} variant="muted">
                          {labelOf(CONTACT_TYPE, t)}
                        </Badge>
                      ))}
                      <Badge variant={c.stage === "research" || c.stage === "not_contacted" ? "warning" : "default"}>{labelOf(CONTACT_STAGE, c.stage)}</Badge>
                      {c.do_not_contact && <Badge variant="danger">勿擾</Badge>}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground md:text-right">
                    <p>負責：{memberName(members, c.owner_user_id)}</p>
                    <p>最近接洽：{c.last_contacted_at ? formatDateTime(c.last_contacted_at, false) : "尚無"}</p>
                    {c.next_follow_up_at && <p className={late ? "font-medium text-destructive" : ""}>下次追蹤：{formatDateTime(c.next_follow_up_at)}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} hrefFor={(n) => `/w/${slug}/contacts${queryString(base, { page: n })}`} />
    </div>
  );
}
