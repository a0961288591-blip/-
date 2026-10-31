import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CalendarClock, Clock, FileClock, Handshake, Landmark, ListChecks, PhoneCall, Shuffle } from "lucide-react";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { DEAL_STAGE_LABEL, TASK_KIND_LABEL, loadDashboard } from "@/lib/dashboard";
import { formatDateTime, taipeiDate } from "@/lib/format";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickAdd } from "./quick-add";

export const metadata = { title: "首頁" };

function DashCard({
  title,
  icon: Icon,
  count,
  href,
  hint,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  href: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <Link href={href} className="group flex items-center gap-2 hover:text-primary">
          <Icon className="size-4 text-accent" />
          <CardTitle className="text-[15px]">{title}</CardTitle>
          <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
        {count !== undefined && (
          <span className={count > 0 ? "text-xl font-semibold text-primary" : "text-xl font-semibold text-muted-foreground"}>{count}</span>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {children}
        {hint && <p className="mt-3 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "numeric", hour12: false }).format(now)) % 24;
  if (hour < 11) return "早安";
  if (hour < 18) return "午安";
  return "晚安";
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-muted/60 px-3 py-3 text-sm text-muted-foreground">{children}</p>;
}

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const data = await loadDashboard(supabase, ws);
  const base = `/w/${slug}`;
  const today = taipeiDate();
  const scopeLabel = data.scope === "team" ? "整個工作空間" : "我負責的";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">{formatDateTime(`${today}T00:00:00+08:00`, false)}</p>
          <h1 className="text-2xl font-semibold text-primary">{greeting()}，{ws.displayName}</h1>
        </div>
        <Badge variant="muted">資料範圍：{scopeLabel}</Badge>
      </header>

      {data.errors.length > 0 && (
        <p role="alert" className="flex items-center gap-2 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4" /> 以下區塊讀取失敗，請重新整理：{data.errors.join("、")}
        </p>
      )}

      <QuickAdd slug={slug} canWrite={roleAtLeast(ws.member.role, "agent")} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* 今日 TOP 3 */}
        <DashCard
          title="今日優先 TOP 3"
          icon={ListChecks}
          count={data.openTaskCount}
          href={`${base}/tasks`}
          hint={data.staleTaskCount > 0 ? `有 ${data.staleTaskCount} 項超過兩個日曆日未完成` : undefined}
        >
          {data.top3.length === 0 ? (
            <Empty>今天沒有待辦。用上方「快速新增」建立第一項。</Empty>
          ) : (
            <ol className="space-y-2">
              {data.top3.map((t, i) => (
                <li key={t.id} className="flex gap-3 rounded-md border px-3 py-2">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`${base}/tasks`} className="block truncate text-sm font-medium hover:underline">
                      {t.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant={t.priority === 1 ? "danger" : "muted"}>優先 {PRIORITY_LABEL[t.priority]}</Badge>
                      <Badge variant="muted">{STATUS_LABEL[t.status]}</Badge>
                      {t.is_overdue && <Badge variant="danger">已逾期</Badge>}
                      {t.is_stale && <Badge variant="warning">久未完成</Badge>}
                      {t.carried_over_count > 0 && <Badge variant="gold">延續 {t.carried_over_count} 次</Badge>}
                      {t.due_at && <span className="text-xs text-muted-foreground">截止 {formatDateTime(t.due_at)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </DashCard>

        {/* 今日行程 */}
        <DashCard title="今日行程" icon={CalendarClock} count={data.todaySchedule.length} href={`${base}/tasks`}>
          {data.todaySchedule.length === 0 ? (
            <Empty>今天沒有排定帶看、面談或電話行程。</Empty>
          ) : (
            <ul className="divide-y">
              {data.todaySchedule.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-12 shrink-0 font-medium text-primary">
                    {new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s.due_at))}
                  </span>
                  <Badge variant="gold">{TASK_KIND_LABEL[s.kind] ?? s.kind}</Badge>
                  <span className="truncate">{s.title}</span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 客戶逾期追蹤 */}
        <DashCard title="客戶逾期追蹤" icon={PhoneCall} count={data.overdueFollowUpCount} href={`${base}/contacts`}>
          {data.overdueFollowUps.length === 0 ? (
            <Empty>沒有超過「下次追蹤時間」的客戶。</Empty>
          ) : (
            <ul className="divide-y">
              {data.overdueFollowUps.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`${base}/contacts/${c.id}`} className="flex items-center gap-2 truncate hover:underline">
                    {c.grade && <Badge variant={c.grade === "S" ? "gold" : "muted"}>{c.grade}</Badge>}
                    {c.display_name}
                  </Link>
                  <span className="shrink-0 text-xs text-destructive">應追蹤 {formatDateTime(c.next_follow_up_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 屋主待回報 */}
        <DashCard title="屋主待回報" icon={FileClock} count={data.sellerReportsDueCount} href={`${base}/properties`} hint="委託中且超過 7 天未回報屋主的物件">
          {data.sellerReportsDue.length === 0 ? (
            <Empty>所有委託物件都已在 7 天內回報屋主。</Empty>
          ) : (
            <ul className="divide-y">
              {data.sellerReportsDue.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`${base}/properties/${p.id}`} className="truncate hover:underline">
                    <span className="mr-2 text-xs text-muted-foreground">{p.code}</span>
                    {p.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {p.last_seller_report_at ? `上次 ${formatDateTime(p.last_seller_report_at, false)}` : "尚未回報"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 委託即將到期 */}
        <DashCard title="委託即將到期" icon={Clock} count={data.mandatesExpiringCount} href={`${base}/properties`} hint="30 天內到期">
          {data.mandatesExpiring.length === 0 ? (
            <Empty>30 天內沒有到期的委託。</Empty>
          ) : (
            <ul className="divide-y">
              {data.mandatesExpiring.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`${base}/properties/${p.id}`} className="truncate hover:underline">
                    <span className="mr-2 text-xs text-muted-foreground">{p.code}</span>
                    {p.title}
                  </Link>
                  <Badge variant="warning">{p.mandate_end_date} 到期</Badge>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 候選配案 */}
        <DashCard title="候選配案" icon={Shuffle} count={data.candidateMatchCount} href={`${base}/matches`} hint="分數為需求匹配度，不代表成交機率">
          {data.candidateMatches.length === 0 ? (
            <Empty>目前沒有待確認的配對（配對引擎於 Phase 3 開放）。</Empty>
          ) : (
            <ul className="divide-y">
              {data.candidateMatches.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {m.property_title} <span className="text-muted-foreground">↔ {m.requirement_title}</span>
                  </span>
                  <Badge variant="default">{m.score} 分</Badge>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 成交管線 */}
        <DashCard title="成交管線" icon={Handshake} count={data.pipeline.reduce((s, p) => s + p.count, 0)} href={`${base}/deals`} hint="進行中案件數（不含已成交與失敗結案）">
          <ul className="grid grid-cols-3 gap-2 text-center">
            {data.pipeline.map((p) => (
              <li key={p.stage} className="rounded-md bg-muted/60 px-1 py-2">
                <div className={p.count ? "text-lg font-semibold text-primary" : "text-lg font-semibold text-muted-foreground"}>{p.count}</div>
                <div className="text-[11px] text-muted-foreground">{DEAL_STAGE_LABEL[p.stage]}</div>
              </li>
            ))}
          </ul>
        </DashCard>

        {/* 建商開發提醒 */}
        <DashCard title="建商開發提醒" icon={Landmark} count={data.developerFollowUpCount} href={`${base}/developers`}>
          {data.developerFollowUps.length === 0 ? (
            <Empty>今天沒有需要跟進的建商。</Empty>
          ) : (
            <ul className="divide-y">
              {data.developerFollowUps.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`${base}/contacts/${c.id}`} className="truncate hover:underline">
                    {c.company ?? c.display_name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(c.next_follow_up_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>
      </div>
    </div>
  );
}
