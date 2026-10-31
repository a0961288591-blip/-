import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, Lock, Pencil, Trash2 } from "lucide-react";
import { getWorkspace, roleAtLeast } from "@/lib/workspace";
import { listMembers, memberName } from "@/lib/members";
import { ASSIGNMENT_ROLE, FILE_KIND, FILE_SENSITIVITY, MANDATE_TYPE, PROPERTY_STATUS, PROPERTY_TYPE, VERIFIABLE_FIELDS, labelOf } from "@/lib/labels";
import { formatDateTime, formatPing, formatTwd, sqmToPing } from "@/lib/format";
import { DataRow, PageHeader, Section } from "@/components/page";
import { ActionButton } from "@/components/action-button";
import { Badge, VerificationBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addAssignmentAction,
  addParcelAction,
  deleteFileAction,
  deleteParcelAction,
  linkContactAction,
  removeAssignmentAction,
  saveFloorPriceAction,
  saveVerificationAction,
  toggleArchivePropertyAction,
  unlinkContactAction,
} from "../actions";
import { AssignmentForm, FloorPriceForm, LinkContactForm, ParcelForm, VerificationForm } from "./forms";
import { DownloadButton, FileUploader } from "./files";

export const metadata = { title: "物件" };

type Verification = { status: "verified" | "pending" | "expired" | "ai_concept"; source?: string | null; verified_at?: string | null; confidence?: string | null };

export default async function PropertyPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { supabase, ws } = await getWorkspace(slug);
  const tid = ws.tenant.id;

  const { data: p } = await supabase.from("properties").select("*").eq("id", id).eq("tenant_id", tid).is("deleted_at", null).maybeSingle();
  if (!p) notFound();

  const [canEditRes, canPrivRes, privateRes, parcelsRes, filesRes, historyRes, linksRes, assignRes, members, contactsRes] = await Promise.all([
    supabase.rpc("can_edit_property", { p_tenant: tid, p_property: id }),
    supabase.rpc("can_view_property_private", { p_tenant: tid, p_property: id }),
    supabase.from("property_private").select("floor_price, commission_terms").eq("property_id", id).maybeSingle(),
    supabase.from("property_parcels").select("*").eq("property_id", id).eq("tenant_id", tid).order("created_at"),
    supabase.from("property_files").select("id, kind, sensitivity, file_name, size_bytes, verification, created_at").eq("property_id", id).eq("tenant_id", tid).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("property_price_history").select("id, old_price, new_price, changed_by, changed_at").eq("property_id", id).eq("tenant_id", tid).order("changed_at", { ascending: false }).limit(20),
    supabase.from("property_contacts").select("id, relation, contact_id, contacts(display_name)").eq("property_id", id).eq("tenant_id", tid),
    supabase.from("property_assignments").select("id, user_id, role, share_pct").eq("property_id", id).eq("tenant_id", tid),
    listMembers(supabase, tid),
    supabase.from("contacts").select("id, display_name").eq("tenant_id", tid).is("deleted_at", null).contains("contact_types", ["seller"]).order("display_name").limit(300),
  ]);

  const canEdit = !!canEditRes.data;
  const canPrivate = !!canPrivRes.data;
  const isManager = roleAtLeast(ws.member.role, "manager");
  const canManageAssign = isManager || p.owner_agent_id === ws.userId;
  const verifications = (p.field_verifications ?? {}) as Record<string, Verification>;
  const base = `/w/${slug}/properties/${id}`;

  const fieldValue: Record<string, React.ReactNode> = {
    list_price: p.list_price == null ? null : formatTwd(p.list_price),
    land_area_ping: p.land_area_ping == null ? null : formatPing(p.land_area_ping),
    building_area_ping: p.building_area_ping == null ? null : formatPing(p.building_area_ping),
    zoning: p.zoning,
    building_coverage_pct: p.building_coverage_pct == null ? null : `${p.building_coverage_pct}%`,
    floor_area_ratio_pct: p.floor_area_ratio_pct == null ? null : `${p.floor_area_ratio_pct}%`,
    road_width_m: p.road_width_m == null ? null : `${p.road_width_m} 米`,
    frontage_m: p.frontage_m == null ? null : `${p.frontage_m} 米`,
    depth_m: p.depth_m == null ? null : `${p.depth_m} 米`,
    height_limit_note: p.height_limit_note,
    special_restrictions: p.special_restrictions,
  };

  type Link_ = { id: string; relation: string; contact_id: string; contacts: { display_name: string } | { display_name: string }[] | null };
  const links = (linksRes.data ?? []) as Link_[];
  const assignments = (assignRes.data ?? []) as { id: string; user_id: string; role: string; share_pct: number | null }[];
  const assignable = members.filter((m) => m.status === "active" && m.role !== "viewer" && m.user_id !== p.owner_agent_id && !assignments.some((a) => a.user_id === m.user_id));

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: `/w/${slug}/properties`, label: "房源" }}
        title={p.title}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{p.code}</span>
            <Badge variant="muted">{labelOf(PROPERTY_TYPE, p.property_type)}</Badge>
            <Badge variant={p.status === "active" ? "success" : "gold"}>{labelOf(PROPERTY_STATUS, p.status)}</Badge>
            {p.archived_at && <Badge variant="warning">已封存</Badge>}
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
              {p.archived_at ? (
                <ActionButton variant="outline" action={toggleArchivePropertyAction.bind(null, slug, id, false)}>
                  <ArchiveRestore /> 解除封存
                </ActionButton>
              ) : (
                <ActionButton variant="outline" confirm="確定封存此物件？封存後不會出現在列表與 Dashboard。" action={toggleArchivePropertyAction.bind(null, slug, id, true)}>
                  <Archive /> 封存
                </ActionButton>
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Section title="位置與委託">
            <dl>
              <DataRow label="縣市／行政區" value={[p.city, p.district].filter(Boolean).join(" ")} />
              <DataRow label="地址／位置" value={p.address} />
              <DataRow label="格局" value={p.layout} />
              <DataRow label="委託類型" value={p.mandate_type ? labelOf(MANDATE_TYPE, p.mandate_type) : null} />
              <DataRow label="委託期間" value={p.mandate_start_date || p.mandate_end_date ? `${p.mandate_start_date ?? "?"} ～ ${p.mandate_end_date ?? "?"}` : null} />
              <DataRow label="負責業務" value={memberName(members, p.owner_agent_id)} />
            </dl>
          </Section>

          <Section title="重要資料與查證狀態">
            <p className="mb-2 text-xs text-muted-foreground">只有標示「已核實」的欄位會被 AI 行銷使用。</p>
            <dl>
              {Object.entries(VERIFIABLE_FIELDS).map(([key, label]) => {
                const v = verifications[key];
                const value = fieldValue[key];
                return (
                  <div key={key} className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0">
                    <dt className="shrink-0 text-muted-foreground">{label}</dt>
                    <dd className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-right">
                      {value == null || value === "" ? <span className="text-warning">待確認</span> : <span>{value}</span>}
                      {value != null && value !== "" && <VerificationBadge status={v?.status ?? "pending"} />}
                      {v?.source && <span className="text-xs text-muted-foreground">{v.source}{v.verified_at ? `・${v.verified_at}` : ""}</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {canEdit && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">標註資料來源與查證</summary>
                <div className="mt-3">
                  <VerificationForm action={saveVerificationAction.bind(null, slug, id)} />
                </div>
              </details>
            )}
          </Section>

          <Section title={`地段地號（${parcelsRes.data?.length ?? 0}）`}>
            {parcelsRes.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2">段／小段</th>
                      <th>地號</th>
                      <th>面積</th>
                      <th>持分</th>
                      <th>查證</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(parcelsRes.data as { id: string; county: string | null; district: string | null; section: string | null; subsection: string | null; parcel_no: string; area_sqm: number | null; share_numerator: number | null; share_denominator: number | null; verification: Verification["status"]; source: string | null }[]).map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2">{[r.county, r.district, r.section, r.subsection].filter(Boolean).join(" ") || <span className="text-warning">待確認</span>}</td>
                        <td>{r.parcel_no}</td>
                        <td>{r.area_sqm == null ? <span className="text-warning">待確認</span> : `${r.area_sqm} ㎡（${sqmToPing(Number(r.area_sqm))} 坪）`}</td>
                        <td>{r.share_numerator && r.share_denominator ? `${r.share_numerator}/${r.share_denominator}` : "—"}</td>
                        <td>
                          <VerificationBadge status={r.verification} />
                        </td>
                        <td className="text-right">
                          {canEdit && (
                            <ActionButton size="sm" variant="ghost" aria-label="刪除地號" confirm={`刪除地號 ${r.parcel_no}？`} action={deleteParcelAction.bind(null, slug, id, r.id)}>
                              <Trash2 />
                            </ActionButton>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚未登錄地號。</p>
            )}
            {canEdit && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">新增地號</summary>
                <div className="mt-3">
                  <ParcelForm action={addParcelAction.bind(null, slug, id)} />
                </div>
              </details>
            )}
          </Section>

          <Section title={`附件（${filesRes.data?.length ?? 0}）`}>
            {filesRes.data?.length ? (
              <ul className="divide-y">
                {(filesRes.data as { id: string; kind: string; sensitivity: string; file_name: string; size_bytes: number | null; verification: Verification["status"]; created_at: string }[]).map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{f.file_name}</p>
                      <p className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="muted">{labelOf(FILE_KIND, f.kind)}</Badge>
                        <Badge variant={f.sensitivity === "restricted" ? "danger" : "muted"}>{labelOf(FILE_SENSITIVITY, f.sensitivity)}</Badge>
                        <VerificationBadge status={f.verification} />
                        {f.size_bytes ? `${(f.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <DownloadButton slug={slug} fileId={f.id} />
                      {canEdit && (
                        <ActionButton size="sm" variant="ghost" aria-label="刪除檔案" confirm={`刪除 ${f.file_name}？`} action={deleteFileAction.bind(null, slug, id, f.id)}>
                          <Trash2 />
                        </ActionButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">尚無附件。</p>
            )}
            {canEdit && (
              <div className="mt-3">
                <FileUploader slug={slug} propertyId={id} canRestricted={canPrivate} />
              </div>
            )}
          </Section>

          {(p.public_description || p.internal_notes) && (
            <Section title="說明">
              {p.public_description && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground">對外公開</p>
                  <p className="whitespace-pre-wrap text-sm">{p.public_description}</p>
                </div>
              )}
              {p.internal_notes && (
                <div>
                  <p className="text-xs text-muted-foreground">內部備註</p>
                  <p className="whitespace-pre-wrap text-sm">{p.internal_notes}</p>
                </div>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <Section title="內部底價" actions={<Lock className="size-4 text-accent" />}>
            {canPrivate ? (
              <div className="space-y-3">
                <p className="text-2xl font-semibold text-primary">{formatTwd(privateRes.data?.floor_price ?? null)}</p>
                {privateRes.data?.commission_terms && <p className="text-sm">{privateRes.data.commission_terms}</p>}
                {canEdit && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-primary">修改底價</summary>
                    <div className="mt-3">
                      <FloorPriceForm
                        action={saveFloorPriceAction.bind(null, slug, id)}
                        floorWan={privateRes.data?.floor_price == null ? null : privateRes.data.floor_price / 10_000}
                        commission={privateRes.data?.commission_terms ?? null}
                      />
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">你沒有檢視底價的權限。</p>
            )}
          </Section>

          <Section title="屋主／關係人">
            {links.length ? (
              <ul className="divide-y">
                {links.map((l) => {
                  const c = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <Link href={`/w/${slug}/contacts/${l.contact_id}`} className="text-primary underline-offset-2 hover:underline">
                        {c?.display_name ?? "（客戶）"}
                      </Link>
                      <span className="flex items-center gap-1">
                        <Badge variant="muted">{{ owner: "屋主", co_owner: "共有人", representative: "代理人", mandator: "委託人" }[l.relation] ?? l.relation}</Badge>
                        {canEdit && (
                          <ActionButton size="sm" variant="ghost" aria-label="移除關聯" action={unlinkContactAction.bind(null, slug, id, l.id)}>
                            <Trash2 />
                          </ActionButton>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">尚未連結屋主。</p>
            )}
            {canEdit && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">連結屋主</summary>
                <div className="mt-3">
                  <LinkContactForm action={linkContactAction.bind(null, slug, id)} contacts={(contactsRes.data ?? []) as { id: string; display_name: string }[]} />
                </div>
              </details>
            )}
          </Section>

          <Section title="負責與共同開發">
            <ul className="divide-y text-sm">
              <li className="flex justify-between py-2">
                <span>{memberName(members, p.owner_agent_id)}</span>
                <Badge>主負責</Badge>
              </li>
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {memberName(members, a.user_id)}
                    {a.share_pct != null && <span className="ml-1 text-xs text-muted-foreground">{a.share_pct}%</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    <Badge variant="muted">{labelOf(ASSIGNMENT_ROLE, a.role)}</Badge>
                    {canManageAssign && (
                      <ActionButton size="sm" variant="ghost" aria-label="移除" action={removeAssignmentAction.bind(null, slug, id, a.id)}>
                        <Trash2 />
                      </ActionButton>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {canManageAssign && assignable.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">加入共同開發</summary>
                <div className="mt-3">
                  <AssignmentForm action={addAssignmentAction.bind(null, slug, id)} members={assignable} />
                </div>
              </details>
            )}
          </Section>

          <Section title="開價異動">
            {historyRes.data?.length ? (
              <ul className="space-y-1.5 text-sm">
                {(historyRes.data as { id: number; old_price: number | null; new_price: number | null; changed_by: string | null; changed_at: string }[]).map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span>
                      {h.old_price == null ? "首次開價" : formatTwd(h.old_price)} → <b>{formatTwd(h.new_price)}</b>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(h.changed_at, false)}・{memberName(members, h.changed_by)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">尚無開價紀錄。</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
