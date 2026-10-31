import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email({ error: "請輸入有效的 Email" }),
  password: z.string().min(8, { error: "密碼至少 8 個字元" }).max(72, { error: "密碼最多 72 個字元" }),
});

export const signupSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, { error: "請輸入姓名" }).max(60, { error: "姓名最多 60 字" }),
});

export const tenantSchema = z.object({
  name: z.string().trim().min(1, { error: "請輸入工作空間名稱" }).max(100, { error: "名稱最多 100 字" }),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{2,39}$/, { error: "網址代號需 3–40 個英數字或連字號，且以英數字開頭" }),
  kind: z.enum(["solo", "team", "company"], { error: "請選擇類型" }),
});

export const quickTaskSchema = z.object({
  title: z.string().trim().min(1, { error: "請輸入待辦內容" }).max(200, { error: "最多 200 字" }),
  priority: z.coerce.number().int().min(1).max(3),
  dueAt: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(`${v}:00+08:00`)), { error: "截止時間格式不正確" })
    .transform((v) => (v ? new Date(`${v}:00+08:00`).toISOString() : null)),
});

/** 只允許站內相對路徑，防止 open redirect */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  ok?: boolean;
  message?: string;
  /** 送出失敗時回填的欄位（React 19 會在 action 後重設表單）；密碼類欄位不回填 */
  values?: Record<string, string | string[]>;
  /** 可能重複的資料，需使用者確認後才建立 */
  duplicates?: { href: string; label: string; reason: string }[];
};

export function keepValues(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

const NEVER_ECHO = /password|token/i;

/** 回填全部文字欄位（多選欄位保留為陣列） */
export function echoValues(formData: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION") || NEVER_ECHO.test(key)) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}

export function fieldErrorsOf(error: z.ZodError): Record<string, string[] | undefined> {
  return z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
}
