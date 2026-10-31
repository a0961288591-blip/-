import Link from "next/link";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { listMembers, memberName } from "@/lib/members";
import { TASK_KIND, labelOf } from "@/lib/labels";
import { addDays, formatDateTime, taipeiDate, taipeiDayRange } from "@/lib/format";
import { sortForToday, type TaskStatus } from "@/lib/tasks";
import { EmptyState, ErrorNotice, PageHeader, Section } from "@/components/page";
import { cn } from "@/lib/utils";
import { createTaskAction, setTaskStatusAction } from "./actions";
import { TaskForm } from "./task-form";
import { TaskItem, type TaskView } from "./task-item";

export const metadata = { title: "任務" };

const VIEWS = [
  { key: "today", label: "今日" },
  { key: "review", label: "今日回顧" },
  { key: "week", label: "本週結算" },
  { key: "open", label: "全部未完成" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

type Row = {
  id: string;
  title: string;
  kind: string;
  priority: number;
  status: TaskStatus;
  original_date: string;
  scheduled_date: string;
  due_at: string | null;
  completed_at: string | null;
  carried_over_count: number;
  age_days: number;
  is_stale: boolean;
  is_overdue: boolean;
  blocker: string | null;
  next_step: string | null;
  assignee_id: string;
  created_by: string | null;
  property_id: string | null;
  contact_id: string | null;
};

export default async function TasksPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string; scope?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, ws } = await getWorkspace(slug);
  const view: ViewKey = (VIEWS.find((v) => v.key === sp.view)?.key ?? "today") as ViewKey;
  const isManager = roleAtLeast(ws.member.role, "manager");
  const team = isManager && sp.scope === "team";
  const now = new Date();
  const today = taipeiDate(now);
  const weekStart = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const tid = ws.tenant.id;

  let q = supabase
    .from("v_tasks")
    .select("id, title, kind, priority, status, original_date, scheduled_date, due_at, completed_at, carried_over_count, age_days, is_stale, is_overdue, blocker, next_step, assignee_id, created_by, property_id, contact_id")
    .eq("tenant_id", tid);
  if (!team) q = q.eq("assignee_id", ws.userId);
  if (view === "review") q = q.or(`status.in.(todo,in_progress,blocked),completed_at.gte."${taipeiDayRange(today).start}"`);
  else if (view === "week") q = q.or(`status.in.(todo,in_progress,blocked),completed_at.gte."${taipeiDayRange(weekStart).start}"`);
  else q = q.in("status", ["todo", "in_progress", "blocked"]);

  const [{ data, error }, members, propsRes, contactsRes] = await Promise.all([
    q.order("scheduled_date").limit(500),
    listMembers(supabase, tid),
    supabase.from("properties").select("id, code, title").eq("tenant_id", tid).is("deleted_at", null).is("archived_at", null).order("updated_at", { ascending: false }).limit(100),
    supabase.from("contacts").select("id, display_name").eq("tenant_id", tid).is("deleted_at", null).is("archived_at", null).order("updated_at", { ascending: false }).limit(200),
  ]);
  const rows = (data ?? []) as Row[];
  const propLabel = new Map(((propsRes.data ?? []) as { id: string; code: string; title: string }[]).map((p) => [p.id, `${p.code} ${p.title}`]));
  const contactLabel = new Map(((contactsRes.data ?? []) as { id: string; display_name: string }[]).map((c) => [c.id, c.display_name]));

  const toView = (t: Row): TaskView => ({
    id: t.id,
    title: t.title,
    kind_label: labelOf(TASK_KIND, t.kind),
    priority: t.priority,
    status: t.status,
    due_label: t.due_at ? formatDateTime(t.due_at) : null,
    original_date: t.original_date,
    age_days: t.age_days,
    carried_over_count: t.carried_over_count,
    is_stale: t.is_stale,
    is_overdue: t.is_overdue,
    blocker: t.blocker,
    next_step: t.next_step,
    assignee: team ? memberName(members, t.assignee_id) : null,
    links: [
      ...(t.property_id ? [{ href: `/w/${slug}/properties/${t.property_id}`, label: propLabel.get(t.property_id) ?? "相關物件" }] : []),
      ...(t.contact_id ? [{ href: `/w/${slug}/contacts/${t.contact_id}`, label: contactLabel.get(t.contact_id) ?? "相關客戶" }] : []),
    ],
    can_edit: isManager || (roleAtLeast(ws.member.role, "agent") && (t.assignee_id === ws.userId || t.created_by === ws.userId)),
  });

  const open = rows.filter((t) => t.status === "todo" || t.status === "in_progress" || t.status === "blocked");
  const doneToday = rows.filter((t) => t.status === "done" && t.completed_at && taipeiDate(new Date(t.completed_at)) === today);
  const doneWeek = rows.filter((t) => t.status === "done" && t.completed_at && taipeiDate(new Date(t.completed_at)) >= weekStart);

  const list = (items: Row[], empty: string) =>
    items.length ? (
      <ul className="space-y-2">
        {items.map((t) => (
          <TaskItem key={t.id} task={toView(t)} action={setTaskStatusAction.bind(null, slug, t.id)} />
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground">{empty}</p>
    );

  const tabHref = (v: ViewKey) => `/w/${slug}/tasks?view=${v}${team ? "&scope=team" : ""}`;

  return (
    <div className="space-y-4">
      <PageHeader title="任務" description="未完成的待辦每天自動延續到下一個工作日，保留原建立日期；超過兩個日曆日會標記。" />

      <nav aria-label="檢視" className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <Link key={v.key} href={tabHref(v.key)} aria-current={view === v.key ? "page" : undefined} className={cn("rounded-full border px-3 py-1.5 text-sm", view === v.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            {v.label}
          </Link>
        ))}
        {isManager && (
          <Link href={`/w/${slug}/tasks?view=${view}${team ? "" : "&scope=team"}`} className="ml-auto text-sm text-primary underline underline-offset-2">
            {team ? "只看我的" : "看整個團隊"}
          </Link>
        )}
      </nav>
      {error && <ErrorNotice>讀取待辦失敗，請重新整理。</ErrorNotice>}

      {roleAtLeast(ws.member.role, "agent") && (
        <details className="rounded-lg border bg-card p-4" open={rows.length === 0 && view === "today"}>
          <summary className="cursor-pointer text-sm font-semibold text-primary">新增待辦</summary>
          <div className="mt-3">
            <TaskForm
              action={createTaskAction.bind(null, slug)}
              members={members.filter((m) => m.status === "active" && m.role !== "viewer")}
              me={ws.userId}
              canAssign={isManager}
              properties={[...propLabel].map(([id, label]) => ({ id, label }))}
              contacts={[...contactLabel].map(([id, label]) => ({ id, label }))}
            />
          </div>
        </details>
      )}

      {view === "today" && (
        <>
          <Section title={`今日待辦（${open.filter((t) => t.scheduled_date <= today).length}）`}>
            {list(sortForToday(open.filter((t) => t.scheduled_date <= today), now), "今天沒有待辦 🎉")}
          </Section>
          <Section title="之後排定">{list(open.filter((t) => t.scheduled_date > today).slice(0, 30), "沒有之後的待辦。")}</Section>
        </>
      )}

      {view === "review" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["今日完成", doneToday.length, "text-success"],
              ["進行中", open.filter((t) => t.status === "in_progress").length, "text-primary"],
              ["未完成", open.filter((t) => t.scheduled_date <= today && t.status !== "in_progress").length, "text-warning"],
              ["卡關", open.filter((t) => t.status === "blocked").length, "text-destructive"],
            ].map(([label, n, color]) => (
              <div key={label as string} className="rounded-lg border bg-card p-3 text-center">
                <div className={cn("text-2xl font-semibold", color as string)}>{n as number}</div>
                <div className="text-xs text-muted-foreground">{label as string}</div>
              </div>
            ))}
          </div>
          <Section title="卡點">{list(open.filter((t) => t.status === "blocked"), "沒有卡關的待辦。")}</Section>
          <Section title="進行中">{list(open.filter((t) => t.status === "in_progress"), "沒有進行中的待辦。")}</Section>
          <Section title="未完成（明天自動延續）">{list(open.filter((t) => t.scheduled_date <= today && t.status === "todo"), "今天排定的都處理了。")}</Section>
          <Section title="今日完成">{list(doneToday, "今天還沒有完成的待辦。")}</Section>
        </>
      )}

      {view === "week" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [`本週完成（${weekStart} 起）`, doneWeek.length],
              ["尚未完成", open.length],
              ["超過 2 天未完成", open.filter((t) => t.is_stale).length],
              ["曾延續的待辦", open.filter((t) => t.carried_over_count > 0).length],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-lg border bg-card p-3 text-center">
                <div className="text-2xl font-semibold text-primary">{n as number}</div>
                <div className="text-xs text-muted-foreground">{label as string}</div>
              </div>
            ))}
          </div>
          <Section title="久未完成，下週優先處理">{list(sortForToday(open.filter((t) => t.is_stale), now), "沒有久未完成的待辦。")}</Section>
          <Section title="本週完成">{list(doneWeek, "本週還沒有完成的待辦。")}</Section>
        </>
      )}

      {view === "open" && <Section title={`全部未完成（${open.length}）`}>{list(sortForToday(open, now), "沒有未完成的待辦。")}</Section>}

      {rows.length === 0 && view !== "today" && <EmptyState title="沒有資料" />}
    </div>
  );
}
