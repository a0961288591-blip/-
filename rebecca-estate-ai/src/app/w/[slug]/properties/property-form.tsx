"use client";

import { ActionForm, Field, FormSection, SelectField, TextareaField } from "@/components/form-kit";
import { MANDATE_TYPE, PROPERTY_STATUS, PROPERTY_TYPE, optionsOf } from "@/lib/labels";
import type { FormState } from "@/lib/validation";

export interface PropertyDefaults {
  code?: string | null;
  title?: string | null;
  property_type?: string | null;
  status?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  list_price?: number | null;
  land_area_ping?: number | null;
  building_area_ping?: number | null;
  layout?: string | null;
  zoning?: string | null;
  building_coverage_pct?: number | null;
  floor_area_ratio_pct?: number | null;
  road_width_m?: number | null;
  frontage_m?: number | null;
  depth_m?: number | null;
  height_limit_note?: string | null;
  special_restrictions?: string | null;
  mandate_type?: string | null;
  mandate_start_date?: string | null;
  mandate_end_date?: string | null;
  owner_agent_id?: string | null;
  public_description?: string | null;
  internal_notes?: string | null;
}

const wan = (v: number | null | undefined) => (v == null ? null : v / 10_000);

export function PropertyForm({
  action,
  defaults = {},
  members,
  canAssign,
  showFloorPrice,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: PropertyDefaults;
  members: { user_id: string; name: string }[];
  canAssign: boolean;
  showFloorPrice: boolean;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} submitClassName="w-full md:w-auto">
      <p className="text-sm text-muted-foreground">
        只填已確認的資料。<b className="text-warning">空白欄位會顯示為「待確認」</b>，系統不會自行補值，AI 文案也不會使用。
      </p>

      <FormSection title="基本資料">
        <Field name="title" label="案件名稱" required defaultValue={defaults.title} placeholder="例：北屯區美術館旁建地" />
        <Field name="code" label="案件編號" defaultValue={defaults.code} hint="留空自動產生" />
        <SelectField name="property_type" label="物件類型" required options={optionsOf(PROPERTY_TYPE)} defaultValue={defaults.property_type} placeholder="請選擇" />
        <SelectField name="status" label="案件狀態" options={optionsOf(PROPERTY_STATUS)} defaultValue={defaults.status ?? "draft"} />
        <Field name="city" label="縣市" defaultValue={defaults.city} placeholder="台中市" />
        <Field name="district" label="行政區" defaultValue={defaults.district} placeholder="北屯區" />
        <Field name="address" label="地址／位置" defaultValue={defaults.address} className="md:col-span-2" />
        {canAssign ? (
          <SelectField
            name="owner_agent_id"
            label="負責業務"
            options={members.map((m) => ({ value: m.user_id, label: m.name }))}
            defaultValue={defaults.owner_agent_id}
          />
        ) : (
          <input type="hidden" name="owner_agent_id" value={defaults.owner_agent_id ?? ""} />
        )}
      </FormSection>

      <FormSection title="價格與面積" description="金額以「萬」輸入，面積以「坪」輸入">
        <Field name="list_price" label="開價（萬）" inputMode="decimal" defaultValue={wan(defaults.list_price)} />
        {showFloorPrice && (
          <Field name="floor_price" label="內部底價（萬）" inputMode="decimal" hint="機敏資料：只有負責業務、共同開發與經理看得到" />
        )}
        <Field name="land_area_ping" label="地坪（坪）" inputMode="decimal" defaultValue={defaults.land_area_ping} />
        <Field name="building_area_ping" label="建坪（坪）" inputMode="decimal" defaultValue={defaults.building_area_ping} />
        <Field name="layout" label="格局" defaultValue={defaults.layout} placeholder="例：4 房 2 廳 3 衛" />
      </FormSection>

      <FormSection title="土地條件">
        <Field name="zoning" label="土地使用分區" defaultValue={defaults.zoning} placeholder="例：第二種住宅區" />
        <Field name="building_coverage_pct" label="建蔽率（%）" inputMode="decimal" defaultValue={defaults.building_coverage_pct} />
        <Field name="floor_area_ratio_pct" label="容積率（%）" inputMode="decimal" defaultValue={defaults.floor_area_ratio_pct} />
        <Field name="road_width_m" label="臨路寬（米）" inputMode="decimal" defaultValue={defaults.road_width_m} />
        <Field name="frontage_m" label="面寬（米）" inputMode="decimal" defaultValue={defaults.frontage_m} />
        <Field name="depth_m" label="深度（米）" inputMode="decimal" defaultValue={defaults.depth_m} />
        <Field name="height_limit_note" label="航空限高" defaultValue={defaults.height_limit_note} />
        <TextareaField name="special_restrictions" label="特殊限制" defaultValue={defaults.special_restrictions} className="md:col-span-2" />
      </FormSection>

      <FormSection title="委託">
        <SelectField name="mandate_type" label="委託類型" options={optionsOf(MANDATE_TYPE)} defaultValue={defaults.mandate_type} placeholder="待確認" />
        <div />
        <Field name="mandate_start_date" label="委託開始日" type="date" defaultValue={defaults.mandate_start_date} />
        <Field name="mandate_end_date" label="委託到期日" type="date" defaultValue={defaults.mandate_end_date} />
      </FormSection>

      <FormSection title="說明" description="公開說明可用於行銷；內部備註不會對外">
        <TextareaField name="public_description" label="對外公開說明" defaultValue={defaults.public_description} rows={4} className="md:col-span-2" />
        <TextareaField name="internal_notes" label="內部備註" defaultValue={defaults.internal_notes} rows={3} className="md:col-span-2" />
      </FormSection>
    </ActionForm>
  );
}
