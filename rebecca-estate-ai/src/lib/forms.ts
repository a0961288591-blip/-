import { z } from "zod";
import {
  ACTIVITY_KIND,
  ACTIVITY_STATUS,
  CONSENT,
  CONTACT_GRADE,
  CONTACT_STAGE,
  CONTACT_TYPE,
  FILE_KIND,
  FILE_SENSITIVITY,
  MANDATE_TYPE,
  PROPERTY_STATUS,
  PROPERTY_TYPE,
  REQUIREMENT_STATUS,
  TASK_KIND,
  VERIFIABLE_FIELDS,
  VERIFICATION,
} from "@/lib/labels";

/**
 * 表單解析原則：空白 = 未知 = null（畫面顯示「待確認」）。絕不把空白轉成 0。
 */
type Keys<T> = [keyof T & string, ...(keyof T & string)[]];
const keysOf = <T extends Record<string, string>>(m: T) => Object.keys(m) as Keys<T>;

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const optText = (max = 2000) =>
  z.preprocess(blankToNull, z.string().trim().max(max, { error: `最多 ${max} 字` }).nullable().optional()).transform((v) => v ?? null);

export const optNumber = (opts: { min?: number; max?: number; label?: string } = {}) =>
  z
    .preprocess((v) => {
      const b = blankToNull(v);
      if (typeof b === "string") return Number(b.replace(/,/g, ""));
      return b;
    }, z.number({ error: `${opts.label ?? "此欄"}需為數字` }).finite().nullable().optional())
    .refine((v) => v == null || opts.min === undefined || v >= opts.min, { error: `不可小於 ${opts.min}` })
    .refine((v) => v == null || opts.max === undefined || v <= opts.max, { error: `不可大於 ${opts.max}` })
    .transform((v) => v ?? null);

/** 以「萬」輸入的金額 → 新台幣元（整數）；空白 → null */
export const optWan = (label = "金額") =>
  optNumber({ min: 0, max: 99_999_999, label }).transform((v) => (v == null ? null : Math.round(v * 10_000)));

export const optDate = () =>
  z
    .preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "日期格式不正確" }).nullable().optional())
    .transform((v) => v ?? null);

/** datetime-local（台北時間）→ ISO；空白 → null */
export const optDateTime = () =>
  z
    .preprocess(blankToNull, z.string().nullable().optional())
    .refine((v) => v == null || !Number.isNaN(Date.parse(`${v}:00+08:00`)), { error: "時間格式不正確" })
    .transform((v) => (v ? new Date(`${v}:00+08:00`).toISOString() : null));

/** 逗號、頓號或換行分隔的清單 */
export const textList = () =>
  z
    .preprocess((v) => (typeof v === "string" ? v : ""), z.string())
    .transform((v) =>
      v
        .split(/[,，、\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    );

export const checkbox = () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const uuid = () => z.uuid({ error: "資料不正確" });
export const optUuid = () => z.preprocess(blankToNull, z.uuid().nullable().optional()).transform((v) => v ?? null);

// ---------------------------------------------------------------- 房源
export const propertySchema = z
  .object({
    code: optText(40),
    title: z.string().trim().min(1, { error: "請輸入案件名稱" }).max(120),
    property_type: z.enum(keysOf(PROPERTY_TYPE), { error: "請選擇物件類型" }),
    status: z.enum(keysOf(PROPERTY_STATUS)),
    city: optText(20),
    district: optText(20),
    address: optText(200),
    list_price: optWan("開價"),
    land_area_ping: optNumber({ min: 0, max: 10_000_000, label: "地坪" }),
    building_area_ping: optNumber({ min: 0, max: 10_000_000, label: "建坪" }),
    layout: optText(60),
    zoning: optText(60),
    building_coverage_pct: optNumber({ min: 0, max: 100, label: "建蔽率" }),
    floor_area_ratio_pct: optNumber({ min: 0, max: 2000, label: "容積率" }),
    road_width_m: optNumber({ min: 0, max: 200, label: "臨路寬" }),
    frontage_m: optNumber({ min: 0, max: 10_000, label: "面寬" }),
    depth_m: optNumber({ min: 0, max: 10_000, label: "深度" }),
    height_limit_note: optText(200),
    special_restrictions: optText(1000),
    mandate_type: z.preprocess(blankToNull, z.enum(keysOf(MANDATE_TYPE)).nullable()),
    mandate_start_date: optDate(),
    mandate_end_date: optDate(),
    owner_agent_id: uuid(),
    public_description: optText(3000),
    internal_notes: optText(3000),
  })
  .refine((v) => !v.mandate_start_date || !v.mandate_end_date || v.mandate_end_date >= v.mandate_start_date, {
    path: ["mandate_end_date"],
    error: "委託到期日不可早於開始日",
  });

export const floorPriceSchema = z.object({ floor_price: optWan("底價"), commission_terms: optText(1000) });

export const parcelSchema = z.object({
  county: optText(20),
  district: optText(20),
  section: optText(40),
  subsection: optText(40),
  parcel_no: z.string().trim().min(1, { error: "請輸入地號" }).max(30),
  area_sqm: optNumber({ min: 0, label: "面積" }),
  share_numerator: optNumber({ min: 1, label: "持分分子" }),
  share_denominator: optNumber({ min: 1, label: "持分分母" }),
  zoning: optText(60),
  verification: z.enum(keysOf(VERIFICATION)),
  source: optText(200),
  verified_at: optDate(),
});

export const verificationSchema = z.object({
  field: z.enum(keysOf(VERIFIABLE_FIELDS)),
  status: z.enum(keysOf(VERIFICATION)),
  source: optText(200),
  verified_at: optDate(),
  confidence: z.preprocess(blankToNull, z.enum(["high", "medium", "low"]).nullable()),
  note: optText(300),
});

export const fileMetaSchema = z.object({
  kind: z.enum(keysOf(FILE_KIND)),
  sensitivity: z.enum(keysOf(FILE_SENSITIVITY)),
  file_name: z.string().trim().min(1).max(200),
  mime_type: z.string().max(120).nullable(),
  size_bytes: z.number().int().min(1).max(50 * 1024 * 1024, { error: "單檔上限 50MB" }),
});

// ---------------------------------------------------------------- 客戶
export const contactSchema = z.object({
  contact_types: z.array(z.enum(keysOf(CONTACT_TYPE))).min(1, { error: "至少選一種客戶類型" }),
  display_name: z.string().trim().min(1, { error: "請輸入姓名或稱呼" }).max(80),
  company: optText(120),
  job_title: optText(60),
  source: optText(120),
  is_public_lead: checkbox(),
  public_source_url: optText(500).refine((v) => v == null || /^https?:\/\//.test(v), { error: "網址需以 http(s):// 開頭" }),
  owner_user_id: uuid(),
  grade: z.preprocess(blankToNull, z.enum(keysOf(CONTACT_GRADE)).nullable()),
  stage: z.enum(keysOf(CONTACT_STAGE)),
  marketing_consent: z.enum(keysOf(CONSENT)),
  do_not_contact: checkbox(),
  next_follow_up_at: optDateTime(),
  notes: optText(3000),
});

export const contactPiiSchema = z.object({
  phone: optText(30).refine((v) => v == null || /^[\d+\-()\s#]{6,30}$/.test(v), { error: "電話格式不正確" }),
  phone_alt: optText(30).refine((v) => v == null || /^[\d+\-()\s#]{6,30}$/.test(v), { error: "電話格式不正確" }),
  email: optText(254).refine((v) => v == null || z.email().safeParse(v).success, { error: "Email 格式不正確" }),
  line_id: optText(60),
  address: optText(200),
});

export const requirementSchema = z
  .object({
    title: z.string().trim().min(1, { error: "請輸入需求名稱" }).max(120),
    status: z.enum(keysOf(REQUIREMENT_STATUS)),
    property_types: z.array(z.enum(keysOf(PROPERTY_TYPE))),
    cities: textList(),
    districts: textList(),
    budget_min: optWan("預算下限"),
    budget_max: optWan("預算上限"),
    land_area_min_ping: optNumber({ min: 0, label: "地坪下限" }),
    land_area_max_ping: optNumber({ min: 0, label: "地坪上限" }),
    building_area_min_ping: optNumber({ min: 0, label: "建坪下限" }),
    building_area_max_ping: optNumber({ min: 0, label: "建坪上限" }),
    zoning_preferences: textList(),
    far_min_pct: optNumber({ min: 0, max: 2000, label: "容積率下限" }),
    road_width_min_m: optNumber({ min: 0, max: 200, label: "臨路寬下限" }),
    purpose: optText(200),
    must_haves: optText(1000),
    exclusions: textList(),
    notes: optText(2000),
    confirmed: checkbox(),
  })
  .refine((v) => v.budget_min == null || v.budget_max == null || v.budget_min <= v.budget_max, { path: ["budget_max"], error: "預算上限不可低於下限" })
  .refine((v) => v.land_area_min_ping == null || v.land_area_max_ping == null || v.land_area_min_ping <= v.land_area_max_ping, {
    path: ["land_area_max_ping"],
    error: "地坪上限不可低於下限",
  });

export const activitySchema = z
  .object({
    contact_id: uuid(),
    property_id: optUuid(),
    kind: z.enum(keysOf(ACTIVITY_KIND)),
    status: z.enum(keysOf(ACTIVITY_STATUS)),
    reached: checkbox(),
    occurred_at: optDateTime(),
    summary: z.string().trim().min(1, { error: "請填寫摘要" }).max(2000),
    next_step: optText(500),
    next_follow_up_at: optDateTime(),
    create_task: checkbox(),
  })
  .transform((v) => ({ ...v, reached: v.status === "completed" ? v.reached : false, occurred_at: v.occurred_at ?? new Date().toISOString() }))
  .refine((v) => !v.create_task || v.next_follow_up_at, { path: ["next_follow_up_at"], error: "建立追蹤待辦需填下次追蹤時間" });

// ---------------------------------------------------------------- 任務
export const taskSchema = z.object({
  title: z.string().trim().min(1, { error: "請輸入待辦內容" }).max(200),
  description: optText(2000),
  kind: z.enum(keysOf(TASK_KIND)),
  priority: z.coerce.number().int().min(1).max(3),
  due_at: optDateTime(),
  assignee_id: uuid(),
  property_id: optUuid(),
  contact_id: optUuid(),
  next_step: optText(500),
});

export const taskStatusSchema = z
  .object({
    status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]),
    blocker: optText(500),
    next_step: optText(500),
  })
  .refine((v) => v.status !== "blocked" || v.blocker, { path: ["blocker"], error: "請說明卡關原因" });

// ---------------------------------------------------------------- 設定
export const inviteSchema = z.object({
  email: z.email({ error: "請輸入有效的 Email" }),
  role: z.enum(["manager", "agent", "viewer"]),
  can_view_floor_price: checkbox(),
  can_view_contact_pii: checkbox(),
  can_export: checkbox(),
  can_manage_files: checkbox(),
});

export const memberUpdateSchema = z.object({
  user_id: uuid(),
  role: z.enum(["owner", "manager", "agent", "viewer"]),
  status: z.enum(["active", "suspended"]),
  can_view_floor_price: checkbox(),
  can_view_contact_pii: checkbox(),
  can_export: checkbox(),
  can_manage_files: checkbox(),
});

const time = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "時間格式為 HH:MM" });
export const prefsSchema = z.object({
  reminders_enabled: checkbox(),
  include_weekends: checkbox(),
  morning_time: time(),
  evening_time: time(),
  weekly_dow: z.coerce.number().int().min(1).max(7),
  weekly_time: time(),
});

/** 從 FormData 取出物件（多選欄位用 getAll） */
export function formObject(fd: FormData, multi: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = multi.includes(key) ? fd.getAll(key).map(String) : fd.get(key);
  }
  for (const key of multi) if (!(key in out)) out[key] = [];
  return out;
}
