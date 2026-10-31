import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, taipeiDate, taipeiDayRange } from "@/lib/format";
import { topThree, type TaskLike } from "@/lib/tasks";
import { roleAtLeast, type Workspace } from "@/lib/workspace";

/**
 * Dashboard 資料：全部來自資料庫查詢（受 RLS 約束），不使用任何示範數字。
 * 業務只看自己負責的；經理以上看整個工作空間。
 */
export interface DashboardTask extends TaskLike {
  kind: string;
  is_stale: boolean;
  is_overdue: boolean;
  carried_over_count: number;
  next_step: string | null;
}

export interface DashboardData {
  scope: "mine" | "team";
  top3: DashboardTask[];
  openTaskCount: number;
  staleTaskCount: number;
  overdueFollowUps: { id: string; display_name: string; grade: string | null; next_follow_up_at: string }[];
  overdueFollowUpCount: number;
  sellerReportsDue: { id: string; code: string; title: string; last_seller_report_at: string | null }[];
  sellerReportsDueCount: number;
  mandatesExpiring: { id: string; code: string; title: string; mandate_end_date: string }[];
  mandatesExpiringCount: number;
  candidateMatches: { id: string; score: number; property_title: string; requirement_title: string }[];
  candidateMatchCount: number;
  pipeline: { stage: string; count: number }[];
  todaySchedule: { id: string; title: string; kind: string; due_at: string }[];
  developerFollowUps: { id: string; display_name: string; company: string | null; next_follow_up_at: string }[];
  developerFollowUpCount: number;
  errors: string[];
}

const SELLER_REPORT_INTERVAL_DAYS = 7;
const MANDATE_WARNING_DAYS = 30;
const PIPELINE_STAGES = ["inquiry", "recommended", "scheduled", "viewing", "offer", "negotiating", "earnest", "signed", "handover"] as const;

export async function loadDashboard(supabase: SupabaseClient, ws: Workspace, now = new Date()): Promise<DashboardData> {
  const tenantId = ws.tenant.id;
  const team = roleAtLeast(ws.member.role, "manager");
  const me = ws.userId;
  const today = taipeiDate(now);
  const { start: todayStart, end: todayEnd } = taipeiDayRange(today);
  const nowIso = now.toISOString();
  const errors: string[] = [];

  const mine = <T extends { eq: (col: string, v: string) => T }>(q: T, col: string) => (team ? q : q.eq(col, me));

  const [tasksRes, followRes, sellerRes, mandateRes, matchRes, dealsRes, scheduleRes, devRes] = await Promise.all([
    // 今日待辦（排序在 TS 以 sortForToday 計算，與單元測試同一份邏輯）
    supabase
      .from("v_tasks")
      .select("id, title, kind, priority, status, original_date, scheduled_date, due_at, is_stale, is_overdue, carried_over_count, next_step", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("assignee_id", me)
      .in("status", ["todo", "in_progress", "blocked"])
      .lte("scheduled_date", today)
      .limit(100),
    mine(
      supabase
        .from("contacts")
        .select("id, display_name, grade, next_follow_up_at", { count: "exact" })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .is("archived_at", null)
        .lt("next_follow_up_at", nowIso)
        .order("next_follow_up_at", { ascending: true })
        .limit(5),
      "owner_user_id",
    ),
    mine(
      supabase
        .from("properties")
        .select("id, code, title, last_seller_report_at", { count: "exact" })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .is("archived_at", null)
        .in("status", ["active", "negotiating"])
        .in("mandate_type", ["exclusive", "general", "co_brokerage"])
        .or(`last_seller_report_at.is.null,last_seller_report_at.lt.${new Date(now.getTime() - SELLER_REPORT_INTERVAL_DAYS * 86_400_000).toISOString()}`)
        .order("last_seller_report_at", { ascending: true, nullsFirst: true })
        .limit(5),
      "owner_agent_id",
    ),
    mine(
      supabase
        .from("properties")
        .select("id, code, title, mandate_end_date", { count: "exact" })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .is("archived_at", null)
        .in("status", ["draft", "active", "negotiating"])
        .gte("mandate_end_date", today)
        .lte("mandate_end_date", addDays(today, MANDATE_WARNING_DAYS))
        .order("mandate_end_date", { ascending: true })
        .limit(5),
      "owner_agent_id",
    ),
    supabase
      .from("matches")
      .select("id, score, property_id, requirement_id", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "candidate")
      .eq("excluded", false)
      .order("score", { ascending: false })
      .limit(5),
    mine(
      supabase.from("deals").select("stage").eq("tenant_id", tenantId).is("deleted_at", null).in("stage", [...PIPELINE_STAGES]).limit(2000),
      "owner_user_id",
    ),
    supabase
      .from("v_tasks")
      .select("id, title, kind, due_at")
      .eq("tenant_id", tenantId)
      .eq("assignee_id", me)
      .in("kind", ["showing", "meeting", "call", "developer_outreach"])
      .in("status", ["todo", "in_progress", "blocked"])
      .gte("due_at", todayStart)
      .lt("due_at", todayEnd)
      .order("due_at", { ascending: true })
      .limit(10),
    mine(
      supabase
        .from("contacts")
        .select("id, display_name, company, next_follow_up_at", { count: "exact" })
        .eq("tenant_id", tenantId)
        .contains("contact_types", ["developer"])
        .is("deleted_at", null)
        .is("archived_at", null)
        .eq("do_not_contact", false)
        .lt("next_follow_up_at", todayEnd)
        .order("next_follow_up_at", { ascending: true })
        .limit(5),
      "owner_user_id",
    ),
  ]);

  for (const [label, res] of [
    ["待辦", tasksRes],
    ["客戶追蹤", followRes],
    ["屋主回報", sellerRes],
    ["委託到期", mandateRes],
    ["候選配案", matchRes],
    ["成交管線", dealsRes],
    ["今日行程", scheduleRes],
    ["建商開發", devRes],
  ] as const) {
    if (res.error) errors.push(label);
  }

  const openTasks = (tasksRes.data ?? []) as DashboardTask[];

  // 配案需顯示物件與需求名稱
  const matchRows = (matchRes.data ?? []) as { id: string; score: number; property_id: string; requirement_id: string }[];
  let candidateMatches: DashboardData["candidateMatches"] = [];
  if (matchRows.length) {
    const [props, reqs] = await Promise.all([
      supabase.from("properties").select("id, title").in("id", matchRows.map((m) => m.property_id)),
      supabase.from("buyer_requirements").select("id, title").in("id", matchRows.map((m) => m.requirement_id)),
    ]);
    const pt = new Map((props.data ?? []).map((p: { id: string; title: string }) => [p.id, p.title]));
    const rt = new Map((reqs.data ?? []).map((r: { id: string; title: string }) => [r.id, r.title]));
    candidateMatches = matchRows.map((m) => ({
      id: m.id,
      score: m.score,
      property_title: pt.get(m.property_id) ?? "（無權限或已刪除）",
      requirement_title: rt.get(m.requirement_id) ?? "（無權限或已刪除）",
    }));
  }

  const stageCounts = new Map<string, number>();
  for (const d of (dealsRes.data ?? []) as { stage: string }[]) stageCounts.set(d.stage, (stageCounts.get(d.stage) ?? 0) + 1);

  return {
    scope: team ? "team" : "mine",
    top3: topThree(openTasks, today, now),
    openTaskCount: tasksRes.count ?? openTasks.length,
    staleTaskCount: openTasks.filter((t) => t.is_stale).length,
    overdueFollowUps: (followRes.data ?? []) as DashboardData["overdueFollowUps"],
    overdueFollowUpCount: followRes.count ?? 0,
    sellerReportsDue: (sellerRes.data ?? []) as DashboardData["sellerReportsDue"],
    sellerReportsDueCount: sellerRes.count ?? 0,
    mandatesExpiring: (mandateRes.data ?? []) as DashboardData["mandatesExpiring"],
    mandatesExpiringCount: mandateRes.count ?? 0,
    candidateMatches,
    candidateMatchCount: matchRes.count ?? 0,
    pipeline: PIPELINE_STAGES.map((stage) => ({ stage, count: stageCounts.get(stage) ?? 0 })),
    todaySchedule: (scheduleRes.data ?? []) as DashboardData["todaySchedule"],
    developerFollowUps: (devRes.data ?? []) as DashboardData["developerFollowUps"],
    developerFollowUpCount: devRes.count ?? 0,
    errors,
  };
}

export const DEAL_STAGE_LABEL: Record<string, string> = {
  inquiry: "詢問",
  recommended: "推薦",
  scheduled: "預約",
  viewing: "帶看",
  offer: "出價",
  negotiating: "議價",
  earnest: "斡旋/要約",
  signed: "簽約",
  handover: "交屋",
  closed_won: "成交",
  closed_lost: "失敗結案",
};

export const TASK_KIND_LABEL: Record<string, string> = {
  todo: "待辦",
  call: "電話",
  showing: "帶看",
  meeting: "面談",
  follow_up: "追蹤",
  document: "文件",
  developer_outreach: "建商開發",
  other: "其他",
};
