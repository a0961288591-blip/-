/**
 * 台灣房仲常用格式：新台幣（萬）、坪、Asia/Taipei 日期。
 * 未知值一律回傳「待確認」，不補任何推測數字。
 */
export const UNKNOWN = "待確認";

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000; // 台灣無日光節約時間

/** 新台幣金額（元）→「3,680 萬」；未滿 1 萬顯示「元」 */
export function formatTwd(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return UNKNOWN;
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return UNKNOWN;
  if (Math.abs(n) >= 10_000) {
    const wan = n / 10_000;
    const text = Number.isInteger(wan)
      ? wan.toLocaleString("zh-TW")
      : wan.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
    return `${text} 萬`;
  }
  return `${n.toLocaleString("zh-TW")} 元`;
}

/** 坪數，最多 2 位小數 */
export function formatPing(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return UNKNOWN;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return UNKNOWN;
  return `${n.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 坪`;
}

/** 平方公尺 → 坪（1 坪 = 400/121 m²） */
export function sqmToPing(sqm: number): number {
  return Math.round(sqm * 0.3025 * 1000) / 1000;
}

/** 台北時區的日期字串 YYYY-MM-DD */
export function taipeiDate(at: Date = new Date()): string {
  return new Date(at.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/** 台北某日 00:00 與隔日 00:00 的 ISO 時間（供資料庫區間查詢） */
export function taipeiDayRange(date: string = taipeiDate()): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** 兩個 YYYY-MM-DD 間相差的日曆日數（b - a） */
export function calendarDaysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 顯示用：10/31（六） 14:30，Asia/Taipei */
export function formatDateTime(iso: string | null | undefined, withTime = true): string {
  if (!iso) return UNKNOWN;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(d);
}
