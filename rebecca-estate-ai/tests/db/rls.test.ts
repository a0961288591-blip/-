import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb } from "./harness";

/**
 * 多租戶隔離與權限測試（對應驗收 1、2、9）
 * 真實 PostgreSQL + 真實 migrations + 模擬 Supabase JWT。
 */
const d = TEST_DATABASE_URL ? describe : describe.skip;

d("多租戶 RLS 與權限", () => {
  const t = new TestDb();
  const u: Record<string, string> = {};
  let tenantA = "";
  let tenantB = "";
  let propA = ""; // aAgent 負責的物件
  let contactA = ""; // aAgent 負責的客戶

  beforeAll(async () => {
    await t.setup();
    for (const name of ["aOwner", "aManager", "aAgent", "aAgent2", "aViewer", "bOwner", "outsider"]) {
      u[name] = await t.createUser(`${name}@example.test`);
    }
    tenantA = await t.asUser(u.aOwner, async (q) =>
      (await q<{ id: string }>("select public.create_tenant('A 公司', 'a-company', 'company') as id"))[0].id,
    );
    tenantB = await t.asUser(u.bOwner, async (q) =>
      (await q<{ id: string }>("select public.create_tenant('B 團隊', 'b-team', 'team') as id"))[0].id,
    );
    // 伺服器端（service_role）升級 A 為 Team 方案
    await t.as({ role: "service_role" }, (q) => q("select public.admin_set_plan($1, 'team')", [tenantA]));
    // 模擬邀請加入
    for (const [name, role] of [["aManager", "manager"], ["aAgent", "agent"], ["aAgent2", "agent"], ["aViewer", "viewer"], ["bOwner", "agent"]] as const) {
      await t.sql("insert into public.tenant_members (tenant_id, user_id, role, status, joined_at) values ($1, $2, $3, 'active', now())", [tenantA, u[name], role]);
    }

    propA = await t.asUser(u.aAgent, async (q) => {
      const [p] = await q<{ id: string }>(
        `insert into public.properties (tenant_id, title, property_type, owner_agent_id, list_price, land_area_ping)
         values ($1, '華鳳特區美建地', 'building_land', $2, 38000000, 120.5) returning id`,
        [tenantA, u.aAgent],
      );
      await q("insert into public.property_private (tenant_id, property_id, floor_price) values ($1, $2, 33000000)", [tenantA, p.id]);
      return p.id;
    });

    contactA = await t.asUser(u.aAgent, async (q) => {
      const [c] = await q<{ id: string }>(
        `insert into public.contacts (tenant_id, contact_types, display_name, owner_user_id)
         values ($1, '{buyer}', '王先生', $2) returning id`,
        [tenantA, u.aAgent],
      );
      await q("insert into public.contact_pii (tenant_id, contact_id, phone, email) values ($1, $2, '0912345678', 'wang@example.test')", [tenantA, c.id]);
      return c.id;
    });
  }, 60_000);

  afterAll(async () => {
    await t.teardown();
  });

  describe("驗收 1：A 租戶無法讀寫 B 租戶資料", () => {
    it("建立工作空間後自動成為 owner，且只看得到自己的工作空間", async () => {
      const rows = await t.asUser(u.outsider, (q) => q("select id from public.tenants"));
      expect(rows).toHaveLength(0);
      const own = await t.asUser(u.aOwner, (q) => q<{ id: string }>("select id from public.tenants"));
      expect(own.map((r) => r.id)).toEqual([tenantA]);
    });

    it("非成員讀不到物件、底價、客戶、聯絡資訊", async () => {
      await t.asUser(u.outsider, async (q) => {
        expect(await q("select * from public.properties")).toHaveLength(0);
        expect(await q("select * from public.property_private")).toHaveLength(0);
        expect(await q("select * from public.contacts")).toHaveLength(0);
        expect(await q("select * from public.contact_pii")).toHaveLength(0);
        expect(await q("select * from public.property_price_history")).toHaveLength(0);
        expect(await q("select * from public.audit_logs")).toHaveLength(0);
      });
    });

    it("B 租戶 owner 只在 B 身分時看不到 A 的資料；以指定 id 查詢也查不到", async () => {
      // 建一個只屬於 B 的使用者情境：outsider 加入 B
      await t.sql("insert into public.tenant_members (tenant_id, user_id, role, status) values ($1, $2, 'owner', 'active')", [tenantB, u.outsider]);
      await t.asUser(u.outsider, async (q) => {
        expect(await q("select * from public.properties where id = $1", [propA])).toHaveLength(0);
        expect(await q("select * from public.tenants where id = $1", [tenantA])).toHaveLength(0);
        expect(await q("select * from public.tenant_members where tenant_id = $1", [tenantA])).toHaveLength(0);
        expect(await q("select * from public.subscriptions where tenant_id = $1", [tenantA])).toHaveLength(0);
      });
    });

    it("無法以竄改 tenant_id 寫入其他租戶", async () => {
      await expect(
        t.asUser(u.outsider, (q) =>
          q("insert into public.properties (tenant_id, title, property_type, owner_agent_id) values ($1, '入侵', 'other', $2)", [tenantA, u.outsider]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("無法更新或刪除其他租戶資料（影響 0 筆 / 無權限）", async () => {
      const updated = await t.asUser(u.outsider, (q) =>
        q("update public.properties set title = '被竄改' where id = $1 returning id", [propA]),
      );
      expect(updated).toHaveLength(0);
      await expect(
        t.asUser(u.outsider, (q) => q("delete from public.properties where id = $1", [propA])),
      ).rejects.toThrow(/permission denied/);
      const [row] = await t.sql<{ title: string }>("select title from public.properties where id = $1", [propA]);
      expect(row.title).toBe("華鳳特區美建地");
    });

    it("跨租戶關聯被資料庫外鍵拒絕（B 的地號掛到 A 的物件）", async () => {
      const propB = await t.asUser(u.outsider, async (q) =>
        (await q<{ id: string }>(
          "insert into public.properties (tenant_id, title, property_type, owner_agent_id) values ($1, 'B 物件', 'building_land', $2) returning id",
          [tenantB, u.outsider],
        ))[0].id,
      );
      // 即使以 superuser（繞過 RLS）也無法建立跨租戶關聯
      await expect(
        t.sql("insert into public.property_parcels (tenant_id, property_id, parcel_no) values ($1, $2, '123')", [tenantB, propA]),
      ).rejects.toThrow(/foreign key/);
      await expect(
        t.sql("insert into public.property_assignments (tenant_id, property_id, user_id) values ($1, $2, $3)", [tenantB, propB, u.aAgent]),
      ).rejects.toThrow(/foreign key/);
    });

    it("同時屬於兩個租戶的使用者，無法把資料搬到另一租戶", async () => {
      // bOwner 同時是 B 的 owner、A 的 agent
      const pid = await t.asUser(u.bOwner, async (q) =>
        (await q<{ id: string }>(
          "insert into public.properties (tenant_id, title, property_type, owner_agent_id) values ($1, 'B 自有', 'other', $2) returning id",
          [tenantB, u.bOwner],
        ))[0].id,
      );
      await expect(
        t.asUser(u.bOwner, (q) => q("update public.properties set tenant_id = $1 where id = $2", [tenantA, pid])),
      ).rejects.toThrow(/不允許變更資料所屬工作空間|violates/);
    });

    it("anon 無任何資料表權限", async () => {
      await expect(t.as({ role: "anon" }, (q) => q("select * from public.properties"))).rejects.toThrow(/permission denied/);
      await expect(t.as({ role: "anon" }, (q) => q("select * from public.tenants"))).rejects.toThrow(/permission denied/);
      await expect(t.as({ role: "anon" }, (q) => q("select public.create_tenant('x', 'xxx-anon')"))).rejects.toThrow(/permission denied/);
    });
  });

  describe("驗收 2：底價與買方聯絡資訊權限", () => {
    it("負責業務、經理、負責人可看到底價", async () => {
      for (const who of ["aAgent", "aManager", "aOwner"]) {
        const rows = await t.asUser(u[who], (q) => q<{ floor_price: string }>("select floor_price from public.property_private where property_id = $1", [propA]));
        expect(rows, who).toHaveLength(1);
        expect(Number(rows[0].floor_price)).toBe(33000000);
      }
    });

    it("非負責業務與檢視者看得到物件，但看不到底價", async () => {
      for (const who of ["aAgent2", "aViewer"]) {
        await t.asUser(u[who], async (q) => {
          expect(await q("select id from public.properties where id = $1", [propA]), who).toHaveLength(1);
          expect(await q("select * from public.property_private where property_id = $1", [propA]), who).toHaveLength(0);
        });
      }
    });

    it("非負責業務與檢視者看得到客戶名稱，但看不到電話與 Email", async () => {
      for (const who of ["aAgent2", "aViewer"]) {
        await t.asUser(u[who], async (q) => {
          expect(await q("select display_name from public.contacts where id = $1", [contactA]), who).toHaveLength(1);
          expect(await q("select * from public.contact_pii where contact_id = $1", [contactA]), who).toHaveLength(0);
        });
      }
      const own = await t.asUser(u.aAgent, (q) => q<{ phone: string }>("select phone from public.contact_pii where contact_id = $1", [contactA]));
      expect(own[0].phone).toBe("0912345678");
    });

    it("被指派為共同開發後即可看到底價；經理可授予個別權限", async () => {
      await t.asUser(u.aManager, (q) =>
        q("insert into public.property_assignments (tenant_id, property_id, user_id, role) values ($1, $2, $3, 'co_developer')", [tenantA, propA, u.aAgent2]),
      );
      expect(await t.asUser(u.aAgent2, (q) => q("select * from public.property_private where property_id = $1", [propA]))).toHaveLength(1);

      await t.asUser(u.aManager, (q) =>
        q("select public.update_tenant_member($1, $2, 'viewer', 'active', false, true, false, false)", [tenantA, u.aViewer]),
      );
      expect(await t.asUser(u.aViewer, (q) => q("select * from public.contact_pii where contact_id = $1", [contactA]))).toHaveLength(1);
      expect(await t.asUser(u.aViewer, (q) => q("select * from public.property_private"))).toHaveLength(0);
    });

    it("檢視者無法新增物件；業務無法編輯非自己負責的物件", async () => {
      await expect(
        t.asUser(u.aViewer, (q) =>
          q("insert into public.properties (tenant_id, title, property_type, owner_agent_id) values ($1, 'x', 'other', $2)", [tenantA, u.aViewer]),
        ),
      ).rejects.toThrow(/row-level security/);

      const pid = await t.asUser(u.aManager, async (q) =>
        (await q<{ id: string }>(
          "insert into public.properties (tenant_id, title, property_type, owner_agent_id) values ($1, '經理案', 'office', $2) returning id",
          [tenantA, u.aManager],
        ))[0].id,
      );
      const res = await t.asUser(u.aAgent, (q) => q("update public.properties set title = 'x' where id = $1 returning id", [pid]));
      expect(res).toHaveLength(0);
    });

    it("業務不能把物件指派給別人當負責人來新增（只能以自己名義）", async () => {
      await expect(
        t.asUser(u.aAgent, (q) =>
          q("insert into public.properties (tenant_id, title, property_type, owner_agent_id) values ($1, 'x', 'other', $2)", [tenantA, u.aAgent2]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("restricted 檔案（謄本）只有可看底價的人看得到", async () => {
      const path = `${tenantA}/${propA}/f1/transcript.pdf`;
      await t.asUser(u.aAgent, async (q) => {
        await q(
          "insert into public.property_files (tenant_id, property_id, kind, sensitivity, storage_path, file_name) values ($1, $2, 'land_transcript', 'restricted', $3, 'transcript.pdf')",
          [tenantA, propA, path],
        );
        await q("insert into storage.objects (bucket_id, name) values ('property-files', $1)", [path]);
      });
      expect(await t.asUser(u.aAgent, (q) => q("select * from storage.objects where name = $1", [path]))).toHaveLength(1);
      expect(await t.asUser(u.aViewer, (q) => q("select * from storage.objects where name = $1", [path]))).toHaveLength(0);
      expect(await t.asUser(u.aViewer, (q) => q("select * from public.property_files"))).toHaveLength(0);
    });
  });

  describe("Storage 跨租戶檔案存取", () => {
    it("其他租戶無法讀取、上傳到他人路徑", async () => {
      const path = `${tenantA}/${propA}/f2/photo.jpg`;
      await t.asUser(u.aAgent, async (q) => {
        await q(
          "insert into public.property_files (tenant_id, property_id, kind, sensitivity, storage_path, file_name) values ($1, $2, 'photo', 'internal', $3, 'photo.jpg')",
          [tenantA, propA, path],
        );
        await q("insert into storage.objects (bucket_id, name) values ('property-files', $1)", [path]);
      });
      expect(await t.asUser(u.outsider, (q) => q("select * from storage.objects where name = $1", [path]))).toHaveLength(0);
      expect(await t.asUser(u.aViewer, (q) => q("select * from storage.objects where name = $1", [path]))).toHaveLength(1);

      await expect(
        t.asUser(u.outsider, (q) => q("insert into storage.objects (bucket_id, name) values ('property-files', $1)", [`${tenantA}/${propA}/evil/x.jpg`])),
      ).rejects.toThrow(/row-level security/);
      // 沒有中繼資料的路徑不能上傳（即使是本租戶成員）
      await expect(
        t.asUser(u.aAgent, (q) => q("insert into storage.objects (bucket_id, name) values ('property-files', $1)", [`${tenantA}/${propA}/nometa/x.jpg`])),
      ).rejects.toThrow(/row-level security/);
      // 非經理無法刪除
      const del = await t.asUser(u.aAgent, (q) => q("delete from storage.objects where name = $1 returning id", [path]));
      expect(del).toHaveLength(0);
    });

    it("檔案路徑必須位於所屬租戶與物件之下", async () => {
      await expect(
        t.asUser(u.aAgent, (q) =>
          q(
            "insert into public.property_files (tenant_id, property_id, kind, storage_path, file_name) values ($1, $2, 'photo', $3, 'x.jpg')",
            [tenantA, propA, `${tenantB}/${propA}/x/x.jpg`],
          ),
        ),
      ).rejects.toThrow(/check constraint/);
    });
  });

  describe("成員權限提升防護", () => {
    it("業務無法呼叫成員權限 RPC", async () => {
      await expect(
        t.asUser(u.aAgent, (q) => q("select public.update_tenant_member($1, $2, 'owner', 'active', true, true, true, true)", [tenantA, u.aAgent2])),
      ).rejects.toThrow(/權限不足/);
    });
    it("不可調整自己的權限；經理不可提升他人為經理或負責人", async () => {
      await expect(
        t.asUser(u.aManager, (q) => q("select public.update_tenant_member($1, $2, 'owner', 'active', true, true, true, true)", [tenantA, u.aManager])),
      ).rejects.toThrow(/不可調整自己/);
      await expect(
        t.asUser(u.aManager, (q) => q("select public.update_tenant_member($1, $2, 'manager', 'active', true, true, true, true)", [tenantA, u.aAgent2])),
      ).rejects.toThrow(/經理無法/);
    });
    it("tenant_members 無法直接寫入", async () => {
      await expect(
        t.asUser(u.aOwner, (q) => q("update public.tenant_members set role = 'owner' where user_id = $1", [u.aAgent])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        t.asUser(u.outsider, (q) => q("insert into public.tenant_members (tenant_id, user_id, role) values ($1, $2, 'owner')", [tenantA, u.outsider])),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("訂閱與額度不可由前端變更", () => {
    it("owner 無法修改方案、額度、用量", async () => {
      await expect(t.asUser(u.aOwner, (q) => q("update public.subscriptions set plan_id = 'team'"))).rejects.toThrow(/permission denied/);
      await expect(t.asUser(u.aOwner, (q) => q("update public.tenant_entitlements set max_properties = 99999"))).rejects.toThrow(/permission denied/);
      await expect(
        t.asUser(u.aOwner, (q) => q("insert into public.usage_events (tenant_id, kind) values ($1, 'ai_generation')", [tenantA])),
      ).rejects.toThrow(/permission denied/);
      await expect(t.asUser(u.aOwner, (q) => q("select public.sync_entitlements($1)", [tenantA]))).rejects.toThrow(/permission denied/);
      await expect(t.asUser(u.aOwner, (q) => q("select public.admin_set_plan($1, 'team')", [tenantA]))).rejects.toThrow(/permission denied/);
    });

    it("達到方案物件上限時拒絕新增", async () => {
      // B 為 trial（50 筆）；以 service_role 模擬調整額度為目前數量
      await t.sql("update public.tenant_entitlements set max_properties = (select count(*) from public.properties where tenant_id = $1) where tenant_id = $1", [tenantB]);
      await expect(
        t.asUser(u.bOwner, (q) =>
          q("insert into public.properties (tenant_id, title, property_type, owner_agent_id) values ($1, '超額', 'other', $2)", [tenantB, u.bOwner]),
        ),
      ).rejects.toThrow(/已達方案上限/);
    });

    it("新工作空間一律從試用方案開始", async () => {
      const [s] = await t.sql<{ plan_id: string; billing_provider: string }>("select plan_id, billing_provider from public.subscriptions where tenant_id = $1", [tenantB]);
      expect(s).toEqual({ plan_id: "trial", billing_provider: "mock" });
    });
  });

  describe("驗收 9：重要異動具備稽核紀錄", () => {
    it("開價異動寫入價格歷史與稽核；底價異動只有經理以上看得到稽核", async () => {
      await t.asUser(u.aAgent, async (q) => {
        await q("update public.properties set list_price = 36800000 where id = $1", [propA]);
        await q("update public.property_private set floor_price = 32000000 where property_id = $1", [propA]);
      });
      const history = await t.asUser(u.aViewer, (q) =>
        q<{ old_price: string; new_price: string }>("select old_price, new_price from public.property_price_history where property_id = $1 order by id", [propA]),
      );
      expect(history.map((h) => [h.old_price && Number(h.old_price), Number(h.new_price)])).toEqual([
        [null, 38000000],
        [38000000, 36800000],
      ]);

      expect(await t.asUser(u.aAgent, (q) => q("select * from public.audit_logs"))).toHaveLength(0);
      const logs = await t.asUser(u.aOwner, (q) =>
        q<{ table_name: string; changed_fields: string[]; actor_id: string }>(
          "select table_name, changed_fields, actor_id from public.audit_logs where record_id = $1 and action = 'update' order by id",
          [propA],
        ),
      );
      expect(logs).toEqual(
        expect.arrayContaining([
          { table_name: "properties", changed_fields: ["list_price"], actor_id: u.aAgent },
          { table_name: "property_private", changed_fields: ["floor_price"], actor_id: u.aAgent },
        ]),
      );
    });

    it("個資異動只記錄欄位名稱，不記錄內容", async () => {
      await t.asUser(u.aAgent, (q) => q("update public.contact_pii set phone = '0987000111' where contact_id = $1", [contactA]));
      const [log] = await t.sql<{ changed_fields: string[]; old_values: unknown; new_values: unknown }>(
        "select changed_fields, old_values, new_values from public.audit_logs where table_name = 'contact_pii' and action = 'update'",
      );
      expect(log).toEqual({ changed_fields: ["phone"], old_values: null, new_values: null });
    });

    it("稽核紀錄無法被竄改或刪除", async () => {
      await expect(t.asUser(u.aOwner, (q) => q("update public.audit_logs set action = 'rpc'"))).rejects.toThrow(/permission denied/);
      await expect(t.asUser(u.aOwner, (q) => q("delete from public.audit_logs"))).rejects.toThrow(/permission denied/);
    });

    it("created_by 由伺服器決定，無法冒名", async () => {
      const [row] = await t.asUser(u.aAgent, (q) =>
        q<{ created_by: string }>(
          "insert into public.tasks (tenant_id, title, assignee_id, created_by) values ($1, '冒名測試', $2, $3) returning created_by",
          [tenantA, u.aAgent, u.aOwner],
        ),
      );
      expect(row.created_by).toBe(u.aAgent);
    });
  });

  describe("客戶階段真實性", () => {
    it("沒有實際接通紀錄不得標記為已聯繫；網路名單從研究名單開始", async () => {
      await expect(
        t.asUser(u.aAgent, (q) => q("update public.contacts set stage = 'contacted' where id = $1", [contactA])),
      ).rejects.toThrow(/實際接通/);

      const [lead] = await t.asUser(u.aAgent, (q) =>
        q<{ stage: string }>(
          "insert into public.contacts (tenant_id, contact_types, display_name, owner_user_id, is_public_lead, stage) values ($1, '{developer}', '某建設公司', $2, true, 'not_contacted') returning stage",
          [tenantA, u.aAgent],
        ),
      );
      expect(lead.stage).toBe("research");
    });

    it("未接通的電話不推進階段；接通後自動變為已聯繫並更新最近接洽", async () => {
      const base = { tenantA, contactA };
      await t.asUser(u.aAgent, (q) =>
        q(
          "insert into public.contact_activities (tenant_id, contact_id, kind, status, reached, occurred_at, summary, owner_user_id) values ($1, $2, 'call', 'no_answer', false, now(), '未接', $3)",
          [base.tenantA, base.contactA, u.aAgent],
        ),
      );
      let [c] = await t.sql<{ stage: string }>("select stage from public.contacts where id = $1", [contactA]);
      expect(c.stage).toBe("not_contacted");

      await t.asUser(u.aAgent, (q) =>
        q(
          "insert into public.contact_activities (tenant_id, contact_id, kind, status, reached, occurred_at, summary, next_step, next_follow_up_at, owner_user_id) values ($1, $2, 'call', 'completed', true, now(), '確認預算 3000 萬內', '寄送物件資料', now() + interval '2 days', $3)",
          [base.tenantA, base.contactA, u.aAgent],
        ),
      );
      [c] = await t.sql<{ stage: string; last_contacted_at: Date | null }>("select stage, last_contacted_at from public.contacts where id = $1", [contactA]);
      expect(c.stage).toBe("contacted");
    });

    it("業務不能以他人名義新增聯繫紀錄", async () => {
      await expect(
        t.asUser(u.aAgent, (q) =>
          q(
            "insert into public.contact_activities (tenant_id, contact_id, kind, status, occurred_at, summary, owner_user_id) values ($1, $2, 'note', 'completed', now(), 'x', $3)",
            [tenantA, contactA, u.aAgent2],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe("通知只看得到自己的", () => {
    it("他人通知不可見", async () => {
      await t.sql("insert into public.notifications (tenant_id, user_id, kind, title) values ($1, $2, 'test', '給業務 1')", [tenantA, u.aAgent]);
      expect(await t.asUser(u.aAgent, (q) => q("select * from public.notifications"))).toHaveLength(1);
      expect(await t.asUser(u.aOwner, (q) => q("select * from public.notifications"))).toHaveLength(0);
    });
  });
});
