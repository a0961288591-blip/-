"use client";

import { ActionForm, Field, SelectField, TextareaField } from "@/components/form-kit";
import { VERIFIABLE_FIELDS, VERIFICATION, optionsOf } from "@/lib/labels";
import type { FormState } from "@/lib/validation";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function VerificationForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} submitLabel="更新查證" resetOnSuccess className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField name="field" label="欄位" options={optionsOf(VERIFIABLE_FIELDS)} />
        <SelectField name="status" label="狀態" options={optionsOf(VERIFICATION)} defaultValue="verified" />
        <SelectField
          name="confidence"
          label="可信度"
          placeholder="未評估"
          options={[
            { value: "high", label: "高（官方文件）" },
            { value: "medium", label: "中（屋主提供）" },
            { value: "low", label: "低（口頭／推估）" },
          ]}
        />
        <Field name="source" label="資料來源" placeholder="例：地籍謄本、都發局查詢" className="md:col-span-2" />
        <Field name="verified_at" label="查證日期" type="date" />
        <Field name="note" label="備註" className="md:col-span-3" />
      </div>
    </ActionForm>
  );
}

export function FloorPriceForm({ action, floorWan, commission }: { action: Action; floorWan: number | null; commission: string | null }) {
  return (
    <ActionForm action={action} submitLabel="更新底價" className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field name="floor_price" label="內部底價（萬）" inputMode="decimal" defaultValue={floorWan} />
        <TextareaField name="commission_terms" label="服務費／佣金條件" defaultValue={commission} rows={2} />
      </div>
    </ActionForm>
  );
}

export function ParcelForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} submitLabel="新增地號" resetOnSuccess className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field name="county" label="縣市" />
        <Field name="district" label="行政區" />
        <Field name="section" label="段" />
        <Field name="subsection" label="小段" />
        <Field name="parcel_no" label="地號" required placeholder="例：123-4" />
        <Field name="area_sqm" label="面積（㎡）" inputMode="decimal" />
        <Field name="share_numerator" label="持分分子" inputMode="numeric" />
        <Field name="share_denominator" label="持分分母" inputMode="numeric" />
        <Field name="zoning" label="分區" />
        <SelectField name="verification" label="查證" options={optionsOf(VERIFICATION)} defaultValue="pending" />
        <Field name="source" label="來源" />
        <Field name="verified_at" label="查證日期" type="date" />
      </div>
    </ActionForm>
  );
}

export function LinkContactForm({ action, contacts }: { action: Action; contacts: { id: string; display_name: string }[] }) {
  if (!contacts.length) return <p className="text-sm text-muted-foreground">尚無客戶資料，請先到「客戶」新增屋主。</p>;
  return (
    <ActionForm action={action} submitLabel="建立關聯" resetOnSuccess className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField name="contact_id" label="客戶" options={contacts.map((c) => ({ value: c.id, label: c.display_name }))} />
        <SelectField
          name="relation"
          label="關係"
          options={[
            { value: "owner", label: "屋主" },
            { value: "co_owner", label: "共有人" },
            { value: "representative", label: "代理人" },
            { value: "mandator", label: "委託人" },
          ]}
        />
      </div>
    </ActionForm>
  );
}

export function AssignmentForm({ action, members }: { action: Action; members: { user_id: string; name: string }[] }) {
  if (!members.length) return null;
  return (
    <ActionForm action={action} submitLabel="加入" resetOnSuccess className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField name="user_id" label="成員" options={members.map((m) => ({ value: m.user_id, label: m.name }))} />
        <SelectField
          name="role"
          label="角色"
          options={[
            { value: "co_developer", label: "共同開發（可編輯、可看底價）" },
            { value: "assistant", label: "助理（僅檢視）" },
          ]}
        />
        <Field name="share_pct" label="業績分配（%）" inputMode="decimal" />
      </div>
    </ActionForm>
  );
}
