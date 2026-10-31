import { Check, Minus } from "lucide-react";
import { getWorkspace, ROLE_LABEL, type MemberRole } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatTwd } from "@/lib/format";

export const metadata = { title: "設定" };

const SUB_STATUS: Record<string, string> = { trialing: "試用中", active: "使用中", past_due: "待付款", canceled: "已取消" };

function Flag({ on }: { on: boolean }) {
  return on ? <Check className="mx-auto size-4 text-success" aria-label="有" /> : <Minus className="mx-auto size-4 text-muted-foreground" aria-label="無" />;
}

function Usage({ label, used, limit }: { label: string; used: number | null; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round(((used ?? 0) / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used ?? "—"} / {limit ?? "不限"}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className={pct >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const tid = ws.tenant.id;

  const [membersRes, subRes, entRes, propCount, contactCount] = await Promise.all([
    supabase
      .from("tenant_members")
      .select("user_id, role, status, can_view_floor_price, can_view_contact_pii, can_export, can_manage_files, joined_at")
      .eq("tenant_id", tid)
      .order("created_at"),
    supabase.from("subscriptions").select("plan_id, status, billing_provider, current_period_end, plans(name, price_monthly_twd)").eq("tenant_id", tid).maybeSingle(),
    supabase.from("tenant_entitlements").select("max_seats, max_properties, max_contacts, ai_credits_monthly, storage_mb").eq("tenant_id", tid).maybeSingle(),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("tenant_id", tid).is("deleted_at", null),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tid).is("deleted_at", null),
  ]);

  type MemberRow = {
    user_id: string;
    role: MemberRole;
    status: string;
    can_view_floor_price: boolean;
    can_view_contact_pii: boolean;
    can_export: boolean;
    can_manage_files: boolean;
    joined_at: string | null;
  };
  const members = (membersRes.data ?? []) as MemberRow[];
  const { data: profiles } = members.length
    ? await supabase.from("profiles").select("id, display_name").in("id", members.map((m) => m.user_id))
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name]));

  const sub = subRes.data as
    | { plan_id: string; status: string; billing_provider: string; current_period_end: string; plans: { name: string; price_monthly_twd: number } | { name: string; price_monthly_twd: number }[] | null }
    | null;
  const plan = sub ? (Array.isArray(sub.plans) ? sub.plans[0] : sub.plans) : null;
  const ent = entRes.data as { max_seats: number | null; max_properties: number | null; max_contacts: number | null; ai_credits_monthly: number | null; storage_mb: number | null } | null;
  const activeSeats = members.filter((m) => m.status !== "suspended").length;
  const loadFailed = [membersRes, subRes, entRes, propCount, contactCount].some((r) => r.error);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-primary">設定</h1>
      {loadFailed && (
        <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          部分資料讀取失敗，請重新整理。
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>成員與權限</CardTitle>
            <CardDescription>底價、客戶聯絡資訊、匯出、檔案管理為獨立權限；負責人與經理預設全部擁有。成員邀請與權限調整介面於 Phase 2 開放。</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">成員</th>
                  <th className="py-2 font-medium">角色</th>
                  <th className="py-2 text-center font-medium">底價</th>
                  <th className="py-2 text-center font-medium">聯絡資訊</th>
                  <th className="py-2 text-center font-medium">匯出</th>
                  <th className="py-2 text-center font-medium">檔案</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const elevated = m.role === "owner" || m.role === "manager";
                  return (
                    <tr key={m.user_id} className="border-b last:border-0">
                      <td className="py-2.5">
                        {nameOf.get(m.user_id) ?? "（未設定名稱）"}
                        {m.user_id === ws.userId && <span className="ml-1 text-xs text-muted-foreground">（你）</span>}
                        {m.status !== "active" && <Badge variant="warning" className="ml-2">{m.status === "invited" ? "邀請中" : "停用"}</Badge>}
                      </td>
                      <td className="py-2.5">{ROLE_LABEL[m.role]}</td>
                      <td className="py-2.5"><Flag on={elevated || m.can_view_floor_price} /></td>
                      <td className="py-2.5"><Flag on={elevated || m.can_view_contact_pii} /></td>
                      <td className="py-2.5"><Flag on={elevated || m.can_export} /></td>
                      <td className="py-2.5"><Flag on={elevated || m.can_manage_files} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              方案與額度 <Badge variant="gold">模擬計費</Badge>
            </CardTitle>
            <CardDescription>V1 不執行真實扣款。方案只能由伺服器端金流流程變更。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sub ? (
              <div className="rounded-md bg-muted/60 p-3 text-sm">
                <div className="font-medium">{plan?.name ?? sub.plan_id}</div>
                <div className="text-muted-foreground">
                  {SUB_STATUS[sub.status] ?? sub.status} · {plan ? `${formatTwd(plan.price_monthly_twd)}／月` : ""} · 至 {formatDateTime(sub.current_period_end, false)}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">查無訂閱資料。</p>
            )}
            <Usage label="席次" used={activeSeats} limit={ent?.max_seats ?? null} />
            <Usage label="物件數" used={propCount.count ?? null} limit={ent?.max_properties ?? null} />
            <Usage label="聯絡人數" used={contactCount.count ?? null} limit={ent?.max_contacts ?? null} />
            <p className="text-xs text-muted-foreground">
              AI 額度每月 {ent?.ai_credits_monthly ?? "不限"} 次（Phase 4 開始計量）· 儲存空間 {ent?.storage_mb ?? "不限"} MB
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
