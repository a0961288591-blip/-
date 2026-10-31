import { describe, expect, it } from "vitest";
import { activitySchema, contactPiiSchema, propertySchema, requirementSchema, taskStatusSchema } from "@/lib/forms";
import { ilikeAny, pick, sanitizeSearch } from "@/lib/search";
import { maskEmail, maskPhone } from "@/lib/mask";

const AGENT = "11111111-1111-4111-8111-111111111111";

describe("房源表單：空白即待確認", () => {
  it("未填數值欄位為 null，不會變成 0；開價以萬輸入轉為元", () => {
    const r = propertySchema.parse({
      title: " 北屯建地 ",
      property_type: "building_land",
      status: "draft",
      owner_agent_id: AGENT,
      list_price: "3,680",
      land_area_ping: "",
      building_coverage_pct: "60",
      floor_area_ratio_pct: " ",
      mandate_type: "",
    });
    expect(r.title).toBe("北屯建地");
    expect(r.list_price).toBe(36_800_000);
    expect(r.land_area_ping).toBeNull();
    expect(r.floor_area_ratio_pct).toBeNull();
    expect(r.building_coverage_pct).toBe(60);
    expect(r.mandate_type).toBeNull();
    expect(r.zoning).toBeNull();
  });

  it("數值範圍與日期順序檢查", () => {
    const base = { title: "x", property_type: "office", status: "draft", owner_agent_id: AGENT };
    expect(propertySchema.safeParse({ ...base, building_coverage_pct: "120" }).success).toBe(false);
    expect(propertySchema.safeParse({ ...base, land_area_ping: "abc" }).success).toBe(false);
    expect(propertySchema.safeParse({ ...base, mandate_start_date: "2026-12-01", mandate_end_date: "2026-11-01" }).success).toBe(false);
  });
});

describe("客戶與需求表單", () => {
  it("電話與 Email 格式", () => {
    expect(contactPiiSchema.parse({ phone: "0912-345-678", email: "" })).toMatchObject({ phone: "0912-345-678", email: null });
    expect(contactPiiSchema.safeParse({ phone: "abc" }).success).toBe(false);
    expect(contactPiiSchema.safeParse({ email: "not-mail" }).success).toBe(false);
  });

  it("需求：清單欄位以逗號/頓號/換行分隔；排除條件保留；預算區間檢查", () => {
    const r = requirementSchema.parse({
      title: "自住透天",
      status: "active",
      property_types: ["townhouse"],
      districts: "北屯區、西屯區,南屯區",
      exclusions: "近高壓電塔\n路沖",
      budget_min: "2000",
      budget_max: "3000",
    });
    expect(r.districts).toEqual(["北屯區", "西屯區", "南屯區"]);
    expect(r.exclusions).toEqual(["近高壓電塔", "路沖"]);
    expect([r.budget_min, r.budget_max]).toEqual([20_000_000, 30_000_000]);
    expect(r.cities).toEqual([]);
    expect(requirementSchema.safeParse({ title: "x", status: "active", property_types: [], budget_min: "3000", budget_max: "2000" }).success).toBe(false);
  });

  it("聯繫紀錄：未完成的紀錄不能標記為已接通；建立追蹤待辦需填時間", () => {
    const c = "22222222-2222-4222-8222-222222222222";
    const r = activitySchema.parse({ contact_id: c, kind: "call", status: "no_answer", reached: "on", summary: "未接" });
    expect(r.reached).toBe(false);
    expect(activitySchema.parse({ contact_id: c, kind: "call", status: "completed", reached: "on", summary: "談妥" }).reached).toBe(true);
    expect(activitySchema.safeParse({ contact_id: c, kind: "call", status: "completed", summary: "x", create_task: "on" }).success).toBe(false);
  });

  it("任務標記卡關必須說明原因", () => {
    expect(taskStatusSchema.safeParse({ status: "blocked" }).success).toBe(false);
    expect(taskStatusSchema.safeParse({ status: "blocked", blocker: "等地主回覆" }).success).toBe(true);
  });
});

describe("搜尋字串清洗（防 PostgREST 篩選注入）", () => {
  it("移除特殊字元", () => {
    expect(sanitizeSearch("崇德路),id.eq.(x")).toBe("崇德路 id eq x");
    expect(ilikeAny(["title", "address"], "北屯*")).toBe("title.ilike.*北屯*,address.ilike.*北屯*");
    expect(ilikeAny(["title"], "  ")).toBeNull();
  });
  it("下拉篩選只接受白名單值", () => {
    expect(pick("active", ["active", "draft"] as const)).toBe("active");
    expect(pick("evil", ["active"] as const)).toBeNull();
  });
});

describe("個資遮罩", () => {
  it("電話與 Email", () => {
    expect(maskPhone("0912-345-678")).toBe("0912-***-678");
    expect(maskEmail("chen@example.test")).toBe("c***@example.test");
    expect(maskPhone(null)).toBe("");
  });
});
