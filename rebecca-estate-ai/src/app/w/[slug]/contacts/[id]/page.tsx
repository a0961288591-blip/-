import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, Lock, Pencil, Plus } from "lucide-react";
import { getWorkspace } from "@/lib/workspace";
import { listMembers, memberName } from "@/lib/members";
import { ACTIVITY_KIND, ACTIVITY_STATUS, CONSENT, CONTACT_STAGE, CONTACT_TYPE, PROPERTY_TYPE, REQUIREMENT_STATUS, labelOf } from "@/lib/labels";
import { formatDateTime, formatPing, formatTwd, toTaipeiLocalInput } from "@/lib/format";
import { DataRow, PageHeader, Section } from "@/components/page";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logActivityAction, toggleArchiveContactAction } from "../actions";
import { ActivityForm } from "../activity-form";
import { PiiPanel } from "./pii";

export const metadata = { title: "客戶" };

function range(min: number | null, max: number | null, fmt: (v: number) => string) {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${fmt(min)} ～ ${fmt(max)}`;
  return min != null ? `${fmt(min)} 以上` : `${fmt(max!)} 以內`;
}

export default async function ContactPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const tid = ws.tenant.id;

  const { data: c } = await supabase.from("contacts").select("*").eq("id", id).eq("tenant_id", tid).is("deleted_at", null).maybeSingle();
  if (!c) notFound();

  const [canEditRes, canPiiRes, piiRes, actsRes, reqsRes, linksRes, tasksRes, propsRes, members] = await Promise.all([
    supabase.rpc("can_edit_contact", { p_tenant: tid, p_contact: id }),
    supabase.rpc("can_view_contact_pii", { p_tenant: tid, p_contact: id }),
    supabase.from("contact_pii").select("phone, phone_alt, email, line_id, address").eq("contact_id", id).maybeSingle(),
    supabase.from("contact_activities").select("id, kind, status, reached, occurred_at, summary, next_step, next_follow_up_at, owner_user_id, property_id").eq("contact_id", id).eq("tenant_id", tid).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(50),
    supabase.from("buyer_requirements").select("*").eq("contact_id", id).eq("tenant_id", tid).is("deleted_at", null).order("created_at"),
    supabase.from("property_contacts").select("id, relation, property_id, properties(code, title)").eq("contact_id", id).eq("tenant_id", tid),
    supabase.from("v_tasks").select("id, title, status, due_at, is_overdue").eq("contact_id", id).eq("tenant_id", tid).in("status", ["todo", "in_progress", "blocked"]).limit(10),
    supabase.from("properties").select("id, code, title").eq("tenant_id", tid).is("deleted_at", null).is("archived_at", null).order("updated_at", { ascending: false }).limit(100),
    listMembers(supabase, tid),
  ]);
  const canEdit = !!canEditRes.data;
  const canPii = !!canPiiRes.data;
  const base = `/w/${slug}/contacts/${id}`;
  const propTitle = new Map(((propsRes.data ?? []) as { id: string; code: string; title: string }[]).map((p) => [p.id, `${p.code} ${p.title}`]));

  type Req = {
    id: string;
    title: string;
    status: string;
    property_types: string[];
    cities: string[];
    districts: string[];
    budget_min: number | null;
    budget_max: number | null;
    land_area_min_ping: number | null;
    land_area_max_ping: number | null;
    zoning_preferences: string[];
    exclusions: string[];
    purpose: string | null;
    confirmed_at: string | null;
  };
  type Act = { id: string; kind: string; status: string; reached: boolean; occurred_at: string; summary: string; next_step: string | null; next_follow_up_at: string | null; owner_user_id: string; property_id: string | null };
  type PL = { id: string; relation: string; property_id: string; properties: { code: string; title: string } | { code: string; title: string }[] | null };

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: `/w/${slug}/contacts`, label: "客戶" }}
        title={
          <span className="flex items-center gap-2">
            {c.grade && <Badge variant={c.grade === "S" ? "gold" : "muted"}>{c.grade}</Badge>}
            {c.display_name}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            {c.company && <span>{c.company}{c.job_title ? `・${c.job_title}` : ""}</span>}
            {(c.contact_types as string[]).map((t) => (
              <Badge key={t} variant="muted">
                {labelOf(CONTACT_TYPE, t)}
              </Badge>
            ))}
            <Badge>{labelOf(CONTACT_STAGE, c.stage)}</Badge>
            {c.is_public_lead && <Badge variant="warning">公開線索</Badge>}
            {c.do_not_contact && <Badge variant="danger">勿擾</Badge>}
            {c.archived_at && <Badge variant="warning">已封存</Badge>}
          </span>
        }
        actions={
          canEdit && (
            <>
              <Button asChild variant="outline">
                <Link href={`${base}/edit`}>
                  <Pencil /> 編輯
                </Link>
              </Button>
              {c.archived_at ? (
                <ActionButton variant="outline" action={toggleArchiveContactAction.bind(null, slug, id, false)}>
                  <ArchiveRestore /> 解除封存
                </ActionButton>
              ) : (
                <ActionButton variant="outline" confirm="確定封存此客戶？" action={toggleArchiveContactAction.bind(null, slug, id, true)}>
                  <Archive /> 封存
                </ActionButton>
              )}
            </>
          )
        }
      />

      {c.do_not_contact && (
        <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          此客戶已表示拒絕再聯繫，請勿主動聯繫或發送行銷訊息。
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Section title="記錄聯繫">
            <ActivityForm
              action={logActivityAction.bind(null, slug, null)}
              contactId={id}
              properties={((propsRes.data ?? []) as { id: string; code: string; title: string }[]).map((p) => ({ id: p.id, label: `${p.code} ${p.title}` }))}
              nowLocal={toTaipeiLocalInput(new Date().toISOString())!}
            />
          </Section>

          <Section title={`聯繫紀錄（${actsRes.data?.length ?? 0}）`}>
            {actsRes.data?.length ? (
              <ol className="space-y-3">
                {(actsRes.data as Act[]).map((a) => (
                  <li key={a.id} className="border-l-2 border-accent/60 pl-3">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{formatDateTime(a.occurred_at)}</span>
                      <Badge variant="muted">{labelOf(ACTIVITY_KIND, a.kind)}</Badge>
                      <Badge variant={a.status === "completed" ? (a.reached ? "success" : "muted") : "warning"}>
                        {labelOf(ACTIVITY_STATUS, a.status)}
                        {a.status === "completed" && (a.reached ? "・已接通" : "・未接通")}
                      </Badge>
                      <span>{memberName(members, a.owner_user_id)}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{a.summary}</p>
                    {(a.next_step || a.next_follow_up_at || a.property_id) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.next_step && `下一步：${a.next_step}`}
                        {a.next_follow_up_at && `・追蹤 ${formatDateTime(a.next_follow_up_at)}`}
                        {a.property_id && (
                          <>
                            ・
                            <Link className="underline" href={`/w/${slug}/properties/${a.property_id}`}>
                              {propTitle.get(a.property_id) ?? "相關物件"}
                            </Link>
                          </>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">尚無聯繫紀錄。</p>
            )}
          </Section>

          <Section
            title={`買方需求（${reqsRes.data?.length ?? 0}）`}
            actions={
              canEdit && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`${base}/requirements/new`}>
                    <Plus /> 新增需求
                  </Link>
                </Button>
              )
            }
          >
            {reqsRes.data?.length ? (
              <ul className="space-y-3">
                {(reqsRes.data as Req[]).map((r) => (
                  <li key={r.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{r.title}</p>
                      <span className="flex shrink-0 gap-1">
                        <Badge variant={r.status === "active" ? "success" : "muted"}>{labelOf(REQUIREMENT_STATUS, r.status)}</Badge>
                        {r.confirmed_at ? <Badge>客戶已確認</Badge> : <Badge variant="warning">待客戶確認</Badge>}
                      </span>
                    </div>
                    <dl className="mt-2 grid gap-x-4 text-sm md:grid-cols-2">
                      <DataRow label="類型" value={r.property_types.length ? r.property_types.map((t) => labelOf(PROPERTY_TYPE, t)).join("、") : "不限"} />
                      <DataRow label="區域" value={[...r.cities, ...r.districts].join("、") || null} />
                      <DataRow label="預算" value={range(r.budget_min, r.budget_max, formatTwd)} />
                      <DataRow label="地坪" value={range(r.land_area_min_ping, r.land_area_max_ping, formatPing)} />
                      <DataRow label="分區" value={r.zoning_preferences.join("、") || null} />
                      <DataRow label="用途" value={r.purpose} />
                    </dl>
                    {r.exclusions.length > 0 && <p className="mt-2 text-sm text-destructive">排除：{r.exclusions.join("、")}</p>}
                    {canEdit && (
                      <Link href={`/w/${slug}/requirements/${r.id}/edit`} className="mt-2 inline-block text-sm text-primary underline underline-offset-2">
                        編輯需求
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">尚未建立需求。</p>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="聯絡資訊" actions={<Lock className="size-4 text-accent" />}>
            {canPii ? <PiiPanel pii={piiRes.data ?? { phone: null, phone_alt: null, email: null, line_id: null, address: null }} /> : <p className="text-sm text-muted-foreground">你沒有檢視此客戶聯絡資訊的權限。</p>}
          </Section>

          <Section title="經營狀態">
            <dl>
              <DataRow label="負責業務" value={memberName(members, c.owner_user_id)} />
              <DataRow label="來源" value={c.source} />
              <DataRow label="最近接洽" value={c.last_contacted_at ? formatDateTime(c.last_contacted_at) : "尚無實際接洽"} />
              <DataRow label="下次追蹤" value={c.next_follow_up_at ? formatDateTime(c.next_follow_up_at) : "未設定"} />
              <DataRow label="行銷授權" value={labelOf(CONSENT, c.marketing_consent)} />
              {c.public_source_url && (
                <DataRow
                  label="公開資料"
                  value={
                    <a href={c.public_source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">
                      來源連結
                    </a>
                  }
                />
              )}
            </dl>
            {c.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{c.notes}</p>}
          </Section>

          <Section title="相關物件">
            {linksRes.data?.length ? (
              <ul className="space-y-1.5 text-sm">
                {(linksRes.data as PL[]).map((l) => {
                  const p = Array.isArray(l.properties) ? l.properties[0] : l.properties;
                  return (
                    <li key={l.id} className="flex justify-between gap-2">
                      <Link href={`/w/${slug}/properties/${l.property_id}`} className="truncate text-primary underline-offset-2 hover:underline">
                        {p ? `${p.code} ${p.title}` : "物件"}
                      </Link>
                      <Badge variant="muted">{{ owner: "屋主", co_owner: "共有人", representative: "代理人", mandator: "委託人" }[l.relation] ?? l.relation}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">尚未連結物件（可在物件頁連結屋主）。</p>
            )}
          </Section>

          <Section title="待辦">
            {tasksRes.data?.length ? (
              <ul className="space-y-1.5 text-sm">
                {(tasksRes.data as { id: string; title: string; due_at: string | null; is_overdue: boolean }[]).map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    {t.due_at && <span className={t.is_overdue ? "shrink-0 text-xs text-destructive" : "shrink-0 text-xs text-muted-foreground"}>{formatDateTime(t.due_at)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">沒有未完成的待辦。</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
