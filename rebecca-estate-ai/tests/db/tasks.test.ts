import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb } from "./harness";

/** 驗收 5：待辦排序、延續、逾期標記（資料庫端） */
const d = TEST_DATABASE_URL ? describe : describe.skip;

d("任務延續與逾期", () => {
  const t = new TestDb();
  let owner = "";
  let tenant = "";

  beforeAll(async () => {
    await t.setup();
    owner = await t.createUser("owner@example.test");
    tenant = await t.asUser(owner, async (q) => (await q<{ id: string }>("select public.create_tenant('庭妍工作室', 'rebecca-studio') as id"))[0].id);
  }, 60_000);

  afterAll(() => t.teardown());

  it("未完成任務延續到下一工作日，保留原建立日期並累計延續次數；已完成不動", async () => {
    await t.sql(
      `insert into public.tasks (tenant_id, title, assignee_id, original_date, scheduled_date, status, completed_at) values
        ($1, '三天前的待辦', $2, public.taipei_today() - 3, public.taipei_today() - 3, 'todo', null),
        ($1, '昨天卡住', $2, public.taipei_today() - 1, public.taipei_today() - 1, 'blocked', null),
        ($1, '已完成', $2, public.taipei_today() - 3, public.taipei_today() - 3, 'done', now()),
        ($1, '今天的', $2, public.taipei_today(), public.taipei_today(), 'todo', null)`,
      [tenant, owner],
    );

    await expect(t.asUser(owner, (q) => q("select public.carry_over_tasks()"))).rejects.toThrow(/permission denied/);
    const [{ carry_over_tasks: moved }] = await t.as({ role: "service_role" }, (q) => q<{ carry_over_tasks: number }>("select public.carry_over_tasks()"));
    expect(moved).toBe(2);

    const rows = await t.asUser(owner, (q) =>
      q<{ title: string; moved_ok: boolean; age_days: number; is_stale: boolean; carried_over_count: number }>(
        `select title, scheduled_date = public.next_workday(public.taipei_today()) as moved_ok, age_days, is_stale, carried_over_count
           from public.v_tasks order by title`,
      ),
    );
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
    expect(byTitle["三天前的待辦"]).toMatchObject({ moved_ok: true, age_days: 3, is_stale: true, carried_over_count: 1 });
    expect(byTitle["昨天卡住"]).toMatchObject({ moved_ok: true, age_days: 1, is_stale: false, carried_over_count: 1 });
    expect(byTitle["已完成"]).toMatchObject({ is_stale: false, carried_over_count: 0 });
    expect(byTitle["今天的"]).toMatchObject({ carried_over_count: 0, is_stale: false });
  });

  it("使用者無法竄改原建立日期", async () => {
    const [row] = await t.asUser(owner, (q) =>
      q<{ same: boolean }>(
        "update public.tasks set original_date = public.taipei_today() where title = '三天前的待辦' returning original_date = public.taipei_today() - 3 as same",
      ),
    );
    expect(row.same).toBe(true);
  });

  it("完成時自動寫入完成時間", async () => {
    const [row] = await t.asUser(owner, (q) =>
      q<{ completed_at: Date | null }>("update public.tasks set status = 'done' where title = '今天的' returning completed_at"),
    );
    expect(row.completed_at).not.toBeNull();
  });

  it("next_workday 週末順延到週一", async () => {
    const [r] = await t.sql<{ sat: string; sun: string; wed: string }>(
      "select public.next_workday('2026-10-31')::text as sat, public.next_workday('2026-11-01')::text as sun, public.next_workday('2026-11-04')::text as wed",
    );
    expect(r).toEqual({ sat: "2026-11-02", sun: "2026-11-02", wed: "2026-11-04" });
  });
});
