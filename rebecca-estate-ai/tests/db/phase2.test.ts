import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb } from "./harness";

/** Phase 2：物件 CRUD、聯絡人、重複偵測、成員邀請、提醒產生 */
const d = TEST_DATABASE_URL ? describe : describe.skip;

d("Phase 2 資料庫功能", () => {
  const t = new TestDb();
  const u: Record<string, string> = {};
  let tenantA = "";
  let tenantB = "";

  beforeAll(async () => {
    await t.setup();
    for (const name of ["owner", "manager", "agent", "viewer", "invitee", "stranger", "bOwner"]) {
      u[name] = await t.createUser(`${name}@example.test`);
    }
    tenantA = await t.asUser(u.owner, async (q) => (await q<{ id: string }>("select public.create_tenant('A 工作室', 'a-studio') as id"))[0].id);
    tenantB = await t.asUser(u.bOwner, async (q) => (await q<{ id: string }>("select public.create_tenant('B 公司', 'b-co') as id"))[0].id);
    await t.as({ role: "service_role" }, (q) => q("select public.admin_set_plan($1, 'team')", [tenantA]));
    for (const [name, role] of [["manager", "manager"], ["agent", "agent"], ["viewer", "viewer"]] as const) {
      await t.sql("insert into public.tenant_members (tenant_id, user_id, role, status, joined_at) values ($1, $2, $3, 'active', now())", [tenantA, u[name], role]);
    }
  }, 60_000);

  afterAll(() => t.teardown());

  describe("驗收 3：物件可保存、搜尋、修改、封存", () => {
    let pid = "";

    it("保存：未填欄位維持空值（待確認），不會變成 0", async () => {
      const [row] = await t.asUser(u.agent, (q) =>
        q<{ id: string; code: string; list_price: string | null; land_area_ping: string | null; zoning: string | null }>(
          `insert into public.properties (tenant_id, title, property_type, owner_agent_id, address, list_price)
           values ($1, '北屯區美術館建地', 'building_land', $2, '台中市北屯區崇德路三段 100 號', null)
           returning id, code, list_price, land_area_ping, zoning`,
          [tenantA, u.agent],
        ),
      );
      pid = row.id;
      expect(row.code).toMatch(/^P\d{6}-[0-9A-F]{4}$/);
      expect(row).toMatchObject({ list_price: null, land_area_ping: null, zoning: null });
    });

    it("搜尋：依名稱、地址關鍵字與類型找到", async () => {
      const rows = await t.asUser(u.viewer, (q) =>
        q<{ id: string }>(
          `select id from public.properties
           where tenant_id = $1 and deleted_at is null and archived_at is null
             and (title ilike $2 or address ilike $2 or code ilike $2) and property_type = 'building_land'`,
          [tenantA, "%崇德路%"],
        ),
      );
      expect(rows.map((r) => r.id)).toEqual([pid]);
    });

    it("修改：負責業務可更新並留下價格歷史", async () => {
      await t.asUser(u.agent, (q) => q("update public.properties set list_price = 52000000, zoning = '第二種住宅區' where id = $1", [pid]));
      const [h] = await t.sql<{ n: string }>("select count(*) as n from public.property_price_history where property_id = $1", [pid]);
      expect(Number(h.n)).toBe(1);
    });

    it("封存：封存後不出現在預設列表，可解除封存", async () => {
      await t.asUser(u.agent, (q) => q("update public.properties set archived_at = now() where id = $1", [pid]));
      const active = await t.asUser(u.agent, (q) => q("select id from public.properties where tenant_id = $1 and archived_at is null", [tenantA]));
      expect(active).toHaveLength(0);
      await t.asUser(u.agent, (q) => q("update public.properties set archived_at = null where id = $1", [pid]));
      const back = await t.asUser(u.agent, (q) => q("select id from public.properties where tenant_id = $1 and archived_at is null", [tenantA]));
      expect(back).toHaveLength(1);
    });

    it("重複案件提醒：地址正規化後相同、地號相同都會被找到；其他租戶找不到", async () => {
      await t.asUser(u.agent, (q) => q("insert into public.property_parcels (tenant_id, property_id, section, parcel_no) values ($1, $2, '崇德段', '123-4')", [tenantA, pid]));
      const dup = await t.asUser(u.manager, (q) =>
        q<{ id: string; reason: string }>("select * from public.find_duplicate_properties($1, '另一個名稱', '臺中市北屯區 崇德路三段100號', '{123-4}')", [tenantA]),
      );
      expect(dup).toHaveLength(1);
      expect(dup[0].reason).toContain("地址相同");
      expect(dup[0].reason).toContain("地號相同");

      const none = await t.asUser(u.bOwner, (q) => q("select * from public.find_duplicate_properties($1, '北屯區美術館建地', '台中市北屯區崇德路三段100號', '{123-4}')", [tenantA]));
      expect(none).toHaveLength(0);
    });
  });

  describe("驗收 4：買方多筆需求與真實聯絡紀錄", () => {
    let cid = "";

    it("create_contact 一次建立客戶與聯絡資訊；檢視者不能建立", async () => {
      cid = await t.asUser(u.agent, async (q) =>
        (await q<{ id: string }>("select public.create_contact($1::jsonb, $2::jsonb) as id", [
          JSON.stringify({ tenant_id: tenantA, contact_types: ["buyer"], display_name: "陳董", owner_user_id: u.agent, grade: "S" }),
          JSON.stringify({ phone: "0912-345-678", email: "Chen@Example.test" }),
        ]))[0].id,
      );
      const [pii] = await t.sql<{ phone_normalized: string; email_normalized: string }>("select phone_normalized, email_normalized from public.contact_pii where contact_id = $1", [cid]);
      expect(pii).toEqual({ phone_normalized: "0912345678", email_normalized: "chen@example.test" });

      await expect(
        t.asUser(u.viewer, (q) =>
          q("select public.create_contact($1::jsonb, null)", [JSON.stringify({ tenant_id: tenantA, contact_types: ["buyer"], display_name: "x", owner_user_id: u.viewer })]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("聯絡資訊寫入失敗時，客戶本身也不會被建立（同一交易）", async () => {
      await expect(
        t.asUser(u.agent, (q) =>
          q("select public.create_contact($1::jsonb, $2::jsonb)", [
            JSON.stringify({ tenant_id: tenantA, contact_types: ["buyer"], display_name: "半套客戶", owner_user_id: u.agent }),
            JSON.stringify({ phone: "0".repeat(40) }),
          ]),
        ),
      ).rejects.toThrow(/check constraint/);
      const rows = await t.sql("select id from public.contacts where display_name = '半套客戶'");
      expect(rows).toHaveLength(0);
    });

    it("重複客戶：+886 電話與大小寫 Email 都能比對，且不回傳任何個資", async () => {
      const dup = await t.asUser(u.viewer, (q) => q("select * from public.find_duplicate_contacts($1, 'x', '+886 912 345 678', null)", [tenantA]));
      expect(dup).toHaveLength(0); // 檢視者無法使用

      const rows = await t.asUser(u.manager, (q) =>
        q<Record<string, unknown>>("select * from public.find_duplicate_contacts($1, '別人', '+886 912 345 678', 'chen@example.TEST')", [tenantA]),
      );
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(["display_name", "id", "reason"]);
      expect(rows[0].reason).toBe("Email 相同、電話相同");

      expect(await t.asUser(u.bOwner, (q) => q("select * from public.find_duplicate_contacts($1, '陳董', '0912345678', null)", [tenantA]))).toHaveLength(0);
    });

    it("一位買方可有多組需求；排除條件與預算區間檢查", async () => {
      await t.asUser(u.agent, async (q) => {
        await q(
          "insert into public.buyer_requirements (tenant_id, contact_id, title, property_types, districts, budget_min, budget_max, exclusions) values ($1, $2, '自住透天', '{townhouse}', '{北屯區}', 20000000, 30000000, '{近高壓電塔}')",
          [tenantA, cid],
        );
        await q("insert into public.buyer_requirements (tenant_id, contact_id, title, property_types, budget_max) values ($1, $2, '投資建地', '{building_land}', 80000000)", [tenantA, cid]);
      });
      const rows = await t.asUser(u.viewer, (q) => q("select id from public.buyer_requirements where contact_id = $1", [cid]));
      expect(rows).toHaveLength(2);
      await expect(
        t.asUser(u.agent, (q) => q("insert into public.buyer_requirements (tenant_id, contact_id, title, budget_min, budget_max) values ($1, $2, 'x', 5, 1)", [tenantA, cid])),
      ).rejects.toThrow(/check constraint/);
    });

    it("其他業務不能為不是自己負責的客戶新增需求", async () => {
      const other = await t.createUser("agent2@example.test");
      await t.sql("insert into public.tenant_members (tenant_id, user_id, role, status) values ($1, $2, 'agent', 'active')", [tenantA, other]);
      await expect(
        t.asUser(other, (q) => q("insert into public.buyer_requirements (tenant_id, contact_id, title) values ($1, $2, 'x')", [tenantA, cid])),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe("upsert 寫入路徑（伺服器動作使用 on conflict）", () => {
    it("負責業務可 upsert 底價與聯絡資訊；非負責業務不行", async () => {
      const [p] = await t.asUser(u.agent, (q) =>
        q<{ id: string }>("insert into public.properties (tenant_id, title, property_type, owner_agent_id) values ($1, 'upsert 測試', 'office', $2) returning id", [tenantA, u.agent]),
      );
      const upsertFloor = (price: number) =>
        "insert into public.property_private (tenant_id, property_id, floor_price) values ($1, $2, " + price + ") on conflict (property_id) do update set floor_price = excluded.floor_price";
      await t.asUser(u.agent, (q) => q(upsertFloor(1000), [tenantA, p.id]));
      await t.asUser(u.agent, (q) => q(upsertFloor(2000), [tenantA, p.id]));
      const [row] = await t.sql<{ floor_price: string }>("select floor_price from public.property_private where property_id = $1", [p.id]);
      expect(Number(row.floor_price)).toBe(2000);

      const other = await t.createUser("agent3@example.test");
      await t.sql("insert into public.tenant_members (tenant_id, user_id, role, status) values ($1, $2, 'agent', 'active')", [tenantA, other]);
      await expect(t.asUser(other, (q) => q(upsertFloor(1), [tenantA, p.id]))).rejects.toThrow(/row-level security/);
    });

    it("提醒設定 upsert 只能寫自己的", async () => {
      const sql = "insert into public.member_preferences (tenant_id, user_id, morning_time) values ($1, $2, $3) on conflict (tenant_id, user_id) do update set morning_time = excluded.morning_time";
      await t.asUser(u.agent, (q) => q(sql, [tenantA, u.agent, "09:00"]));
      await t.asUser(u.agent, (q) => q(sql, [tenantA, u.agent, "09:30"]));
      const [r] = await t.sql<{ morning_time: string }>("select morning_time::text from public.member_preferences where user_id = $1", [u.agent]);
      expect(r.morning_time).toBe("09:30:00");
    });
  });

  describe("成員邀請", () => {
    let token = "";

    it("經理不能邀請經理；負責人可以；token 只存雜湊", async () => {
      await expect(
        t.asUser(u.manager, (q) => q("select public.invite_member($1, 'x@example.test', 'manager')", [tenantA])),
      ).rejects.toThrow(/經理只能邀請/);
      await expect(t.asUser(u.agent, (q) => q("select public.invite_member($1, 'x@example.test', 'agent')", [tenantA]))).rejects.toThrow(/權限不足/);

      token = await t.asUser(u.manager, async (q) =>
        (await q<{ token: string }>("select public.invite_member($1, ' Invitee@Example.test ', 'agent', false, true) as token", [tenantA]))[0].token,
      );
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      const stored = await t.sql<{ token_hash: string; email: string }>("select token_hash, email from public.tenant_invitations");
      expect(stored[0].email).toBe("invitee@example.test");
      expect(stored[0].token_hash).not.toBe(token);
    });

    it("其他 Email 的帳號拿到連結也無法加入", async () => {
      await expect(
        t.asUser(u.stranger, (q) => q("select public.accept_invitation($1)", [token]), "stranger@example.test"),
      ).rejects.toThrow(/其他 Email/);
    });

    it("受邀者接受後成為成員並帶入個別權限；連結只能用一次", async () => {
      const [{ slug }] = await t.asUser(u.invitee, (q) => q<{ slug: string }>("select public.accept_invitation($1) as slug", [token]), "invitee@example.test");
      expect(slug).toBe("a-studio");
      const [m] = await t.sql<{ role: string; can_view_contact_pii: boolean }>("select role, can_view_contact_pii from public.tenant_members where user_id = $1", [u.invitee]);
      expect(m).toEqual({ role: "agent", can_view_contact_pii: true });
      await expect(
        t.asUser(u.invitee, (q) => q("select public.accept_invitation($1)", [token]), "invitee@example.test"),
      ).rejects.toThrow(/無效或已過期/);
    });

    it("席次已滿時無法接受邀請", async () => {
      const tok = await t.asUser(u.owner, async (q) => (await q<{ t: string }>("select public.invite_member($1, 'full@example.test', 'viewer') as t", [tenantA]))[0].t);
      await t.sql("update public.tenant_entitlements set max_seats = (select count(*) from public.tenant_members where tenant_id = $1) where tenant_id = $1", [tenantA]);
      const full = await t.createUser("full@example.test");
      await expect(t.asUser(full, (q) => q("select public.accept_invitation($1)", [tok]), "full@example.test")).rejects.toThrow(/已達方案上限（席次/);
      await t.as({ role: "service_role" }, (q) => q("select public.sync_entitlements($1)", [tenantA]));
    });

    it("過期或撤銷的邀請無效；業務看不到邀請清單", async () => {
      const tok = await t.asUser(u.owner, async (q) => (await q<{ t: string }>("select public.invite_member($1, 'late@example.test', 'viewer') as t", [tenantA]))[0].t);
      await t.sql("update public.tenant_invitations set expires_at = now() - interval '1 minute' where email = 'late@example.test'");
      const late = await t.createUser("late@example.test");
      await expect(t.asUser(late, (q) => q("select public.accept_invitation($1)", [tok]), "late@example.test")).rejects.toThrow(/無效或已過期/);
      expect(await t.asUser(u.agent, (q) => q("select * from public.tenant_invitations"))).toHaveLength(0);
      expect((await t.asUser(u.manager, (q) => q("select * from public.tenant_invitations"))).length).toBeGreaterThan(0);
    });
  });

  describe("驗收 5 延伸：站內提醒排程", () => {
    // 2026-11-02 是週一；2026-11-06 是週五
    const MON_1005 = "2026-11-02T02:05:00Z"; // 台北 10:05
    const MON_1910 = "2026-11-02T11:10:00Z"; // 台北 19:10
    const FRI_1910 = "2026-11-06T11:10:00Z";
    const SAT_1005 = "2026-11-07T02:05:00Z";

    beforeAll(async () => {
      await t.sql(
        `insert into public.tasks (tenant_id, title, priority, assignee_id, original_date, scheduled_date) values
          ($1, '低優先', 3, $2, '2026-11-02', '2026-11-02'),
          ($1, '高優先：回電地主', 1, $2, '2026-11-02', '2026-11-02'),
          ($1, '中優先', 2, $2, '2026-10-30', '2026-11-02')`,
        [tenantB, u.bOwner],
      );
      await t.sql(
        "insert into public.properties (tenant_id, title, property_type, owner_agent_id, mandate_type, mandate_end_date, status) values ($1, '七期店面', 'storefront', $2, 'exclusive', '2026-11-09', 'active')",
        [tenantB, u.bOwner],
      );
    });

    const run = (at: string) => t.as({ role: "service_role" }, async (q) => (await q<{ n: number }>("select public.generate_reminders($1) as n", [at]))[0].n);
    const mine = () => t.asUser(u.bOwner, (q) => q<{ kind: string; title: string; body: string; link: string }>("select kind, title, body, link from public.notifications where tenant_id = $1 order by created_at, kind", [tenantB]));

    it("使用者無法自行觸發提醒產生", async () => {
      await expect(t.asUser(u.bOwner, (q) => q("select public.generate_reminders()"))).rejects.toThrow(/permission denied/);
    });

    it("上午 10:00 時段產生 TOP 3（依優先排序）與 7 天後委託到期提醒；重複執行不重複產生", async () => {
      await run(MON_1005);
      await run(MON_1005);
      const rows = await mine();
      const top = rows.find((r) => r.kind === "morning_top3")!;
      expect(top.body.split("\n").slice(0, 3)).toEqual(["1. 高優先：回電地主", "2. 中優先", "3. 低優先"]);
      expect(top.link).toBe("/w/b-co/tasks");
      expect(rows.filter((r) => r.kind === "morning_top3")).toHaveLength(1);
      const mandate = rows.find((r) => r.kind === "mandate_expiring")!;
      expect(mandate.title).toBe("委託 7 天後到期：七期店面");
    });

    it("晚上 19:00 產生今日回顧；週五 19:00 另產生週結算", async () => {
      await run(MON_1910);
      expect((await mine()).filter((r) => r.kind === "evening_review")).toHaveLength(1);
      await run(FRI_1910);
      const rows = await mine();
      expect(rows.filter((r) => r.kind === "evening_review")).toHaveLength(2);
      expect(rows.find((r) => r.kind === "weekly_summary")?.body).toMatch(/本週完成 0 項・尚未完成 3 項/);
    });

    it("週末預設不提醒；個人可改提醒時段", async () => {
      const before = (await mine()).length;
      await run(SAT_1005);
      expect((await mine()).length).toBe(before);

      await t.asUser(u.bOwner, (q) =>
        q("insert into public.member_preferences (tenant_id, user_id, include_weekends, morning_time) values ($1, $2, true, '08:00')", [tenantB, u.bOwner]),
      );
      await run("2026-11-07T00:10:00Z"); // 週六 08:10
      expect((await mine()).filter((r) => r.kind === "morning_top3")).toHaveLength(2);
    });

    it("不能修改別人的提醒設定", async () => {
      await expect(
        t.asUser(u.owner, (q) => q("insert into public.member_preferences (tenant_id, user_id) values ($1, $2)", [tenantB, u.bOwner])),
      ).rejects.toThrow(/row-level security/);
    });
  });
});
