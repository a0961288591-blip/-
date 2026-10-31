import { describe, expect, it } from "vitest";
import { isOverdue, isStale, sortForToday, topThree, type TaskLike } from "@/lib/tasks";

const now = new Date("2026-11-02T02:00:00Z"); // 台北 11/2 10:00
const today = "2026-11-02";

function task(p: Partial<TaskLike> & { id: string }): TaskLike {
  return { title: p.id, priority: 2, status: "todo", original_date: today, scheduled_date: today, due_at: null, ...p };
}

describe("驗收 5：待辦排序、延續、逾期", () => {
  it("超過兩個日曆日未完成才標記久未完成", () => {
    expect(isStale(task({ id: "a", original_date: "2026-10-31" }), today)).toBe(false); // 2 天
    expect(isStale(task({ id: "b", original_date: "2026-10-30" }), today)).toBe(true); // 3 天
    expect(isStale(task({ id: "c", original_date: "2026-10-01", status: "done" }), today)).toBe(false);
  });

  it("截止時間已過且未完成才算逾期", () => {
    expect(isOverdue(task({ id: "a", due_at: "2026-11-02T01:00:00Z" }), now)).toBe(true);
    expect(isOverdue(task({ id: "b", due_at: "2026-11-02T03:00:00Z" }), now)).toBe(false);
    expect(isOverdue(task({ id: "c", due_at: "2026-11-01T00:00:00Z", status: "done" }), now)).toBe(false);
    expect(isOverdue(task({ id: "d" }), now)).toBe(false);
  });

  it("排序：逾期 → 優先級 → 截止時間 → 原建立日期", () => {
    const sorted = sortForToday(
      [
        task({ id: "low", priority: 3 }),
        task({ id: "high-late", priority: 1, due_at: "2026-11-02T09:00:00Z" }),
        task({ id: "high-early", priority: 1, due_at: "2026-11-02T05:00:00Z" }),
        task({ id: "mid-overdue", priority: 2, due_at: "2026-11-01T09:00:00Z" }),
        task({ id: "mid-old", priority: 2, original_date: "2026-10-28" }),
        task({ id: "mid-new", priority: 2 }),
      ],
      now,
    );
    expect(sorted.map((t) => t.id)).toEqual(["mid-overdue", "high-early", "high-late", "mid-old", "mid-new", "low"]);
  });

  it("TOP 3 只取今天以前排定且未完成的", () => {
    const top = topThree(
      [
        task({ id: "future", priority: 1, scheduled_date: "2026-11-03" }),
        task({ id: "done", priority: 1, status: "done" }),
        task({ id: "carried", priority: 2, scheduled_date: "2026-10-30", original_date: "2026-10-28" }),
        task({ id: "blocked", priority: 1, status: "blocked" }),
        task({ id: "a", priority: 3 }),
        task({ id: "b", priority: 3 }),
      ],
      today,
      now,
    );
    expect(top.map((t) => t.id)).toEqual(["blocked", "carried", "a"]);
  });
});
