import { calendarDaysBetween } from "@/lib/format";

/**
 * 待辦排序與狀態判斷（與資料庫 v_tasks 規則一致）
 * - 超過兩個日曆日未完成 → 標記「久未完成」（以原建立日期計算）
 * - 截止時間已過 → 「逾期」
 */
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";

export interface TaskLike {
  id: string;
  title: string;
  priority: number; // 1 高 / 2 中 / 3 低
  status: TaskStatus;
  original_date: string; // YYYY-MM-DD
  scheduled_date: string;
  due_at: string | null;
}

export const OPEN_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];

export function isOpen(task: Pick<TaskLike, "status">) {
  return OPEN_STATUSES.includes(task.status);
}

export function isStale(task: Pick<TaskLike, "status" | "original_date">, today: string) {
  return isOpen(task) && calendarDaysBetween(task.original_date, today) > 2;
}

export function isOverdue(task: Pick<TaskLike, "status" | "due_at">, now: Date) {
  return isOpen(task) && task.due_at !== null && new Date(task.due_at).getTime() < now.getTime();
}

/**
 * 今日優先順序：
 * 1. 逾期者優先
 * 2. 優先級（高→低）
 * 3. 截止時間（早→晚，無截止時間排後）
 * 4. 原建立日期（舊→新：延續越久越前面）
 */
export function sortForToday<T extends TaskLike>(tasks: T[], now: Date): T[] {
  return [...tasks].sort((a, b) => {
    const ao = isOverdue(a, now) ? 0 : 1;
    const bo = isOverdue(b, now) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ad = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
    const bd = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    if (a.original_date !== b.original_date) return a.original_date < b.original_date ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

export function topThree<T extends TaskLike>(tasks: T[], today: string, now: Date): T[] {
  return sortForToday(
    tasks.filter((t) => isOpen(t) && t.scheduled_date <= today),
    now,
  ).slice(0, 3);
}

export const PRIORITY_LABEL: Record<number, string> = { 1: "高", 2: "中", 3: "低" };
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "待處理",
  in_progress: "進行中",
  blocked: "卡關",
  done: "已完成",
  cancelled: "已取消",
};
