import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 每日排程（Vercel Cron 或任何外部排程器呼叫）：未完成任務延續到下一工作日。
 * 需帶 Authorization: Bearer <CRON_SECRET>。
 * 正式環境建議改用 Supabase pg_cron（見 docs/SETUP.md），兩者擇一即可，函式本身可重複執行。
 */
export const dynamic = "force-dynamic";

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
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("carry_over_tasks");
    if (error) throw error;
    return NextResponse.json({ ok: true, carried_over: data });
  } catch (err) {
    console.error("[cron/daily] failed", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
