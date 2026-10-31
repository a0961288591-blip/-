/**
 * PostgREST `or=(...)` 篩選字串中，逗號、括號、星號、反斜線、引號都有特殊意義。
 * 使用者輸入一律先清洗，避免篩選語法被注入（例如加入額外條件）。
 */
export function sanitizeSearch(input: unknown, maxLength = 60): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[,()*\\"'%:.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** 建立 ilike OR 條件；空字串回傳 null */
export function ilikeAny(columns: string[], term: string): string | null {
  const q = sanitizeSearch(term);
  if (!q) return null;
  return columns.map((c) => `${c}.ilike.*${q}*`).join(",");
}

/** 只接受白名單內的值（篩選下拉選單） */
export function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}
