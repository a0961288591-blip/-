import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 備援排程端點（Supabase pg_cron 已自動排程時不需要）。
 * 需帶 Authorization: Bearer <CRON_SECRET>。
 *   ?job=carry_over（預設）：未完成任務延續到下一工作日
 *   ?job=reminders：產生站內提醒（需每小時呼叫）
 * 兩個函式都可重複執行，不會重複延續或重複通知。
 */
export const dynamic = "force-dynamic";

const JOBS = { carry_over: "carry_over_tasks", reminders: "generate_reminders" } as const;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const job = (request.nextUrl.searchParams.get("job") ?? "carry_over") as keyof typeof JOBS;
  const fn = JOBS[job];
  if (!fn) return NextResponse.json({ error: "unknown job" }, { status: 400 });
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc(fn);
    if (error) throw error;
    return NextResponse.json({ ok: true, job, result: data });
  } catch (err) {
    console.error(`[cron/${job}] failed`, err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
