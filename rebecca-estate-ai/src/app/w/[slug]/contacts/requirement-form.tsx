"use client";

import { ActionForm, CheckboxField, CheckboxGroup, Field, FormSection, SelectField, TextareaField } from "@/components/form-kit";
import { PROPERTY_TYPE, REQUIREMENT_STATUS, optionsOf } from "@/lib/labels";
import type { FormState } from "@/lib/validation";

export interface RequirementDefaults {
  title?: string;
  status?: string;
  property_types?: string[];
  cities?: string[];
  districts?: string[];
  budget_min?: number | null;
  budget_max?: number | null;
  land_area_min_ping?: number | null;
  land_area_max_ping?: number | null;
  building_area_min_ping?: number | null;
  building_area_max_ping?: number | null;
  zoning_preferences?: string[];
  far_min_pct?: number | null;
  road_width_min_m?: number | null;
  purpose?: string | null;
  must_haves?: string | null;
  exclusions?: string[];
  notes?: string | null;
  confirmed_at?: string | null;
}

const wan = (v: number | null | undefined) => (v == null ? null : v / 10_000);

export function RequirementForm({
  action,
  defaults = {},
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: RequirementDefaults;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} submitClassName="w-full md:w-auto">
      <p className="text-sm text-muted-foreground">只填客戶明確表達的條件；未提到的請留空，配對時會列為「未知條件」而不是自行假設。</p>
      <FormSection title="需求">
        <Field name="title" label="需求名稱" required defaultValue={defaults.title} placeholder="例：北屯自住透天、七期投資建地" />
        <SelectField name="status" label="狀態" options={optionsOf(REQUIREMENT_STATUS)} defaultValue={defaults.status ?? "active"} />
        <div className="md:col-span-2">
          <CheckboxGroup name="property_types" label="物件類型（可複選，留空代表不限）" options={optionsOf(PROPERTY_TYPE)} defaultValues={defaults.property_types ?? []} />
        </div>
        <Field name="cities" label="縣市（逗號分隔）" defaultValue={defaults.cities?.join("、")} placeholder="台中市" />
        <Field name="districts" label="行政區（逗號分隔）" defaultValue={defaults.districts?.join("、")} placeholder="北屯區、西屯區" />
        <Field name="purpose" label="用途" defaultValue={defaults.purpose} placeholder="自住、投資、自建、蓋廠…" className="md:col-span-2" />
      </FormSection>

      <FormSection title="預算與面積" description="金額以「萬」、面積以「坪」輸入">
        <Field name="budget_min" label="預算下限（萬）" inputMode="decimal" defaultValue={wan(defaults.budget_min)} />
        <Field name="budget_max" label="預算上限（萬）" inputMode="decimal" defaultValue={wan(defaults.budget_max)} />
        <Field name="land_area_min_ping" label="地坪下限" inputMode="decimal" defaultValue={defaults.land_area_min_ping} />
        <Field name="land_area_max_ping" label="地坪上限" inputMode="decimal" defaultValue={defaults.land_area_max_ping} />
        <Field name="building_area_min_ping" label="建坪下限" inputMode="decimal" defaultValue={defaults.building_area_min_ping} />
        <Field name="building_area_max_ping" label="建坪上限" inputMode="decimal" defaultValue={defaults.building_area_max_ping} />
      </FormSection>

      <FormSection title="土地條件">
        <Field name="zoning_preferences" label="偏好分區（逗號分隔）" defaultValue={defaults.zoning_preferences?.join("、")} placeholder="第二種住宅區、商業區" className="md:col-span-2" />
        <Field name="far_min_pct" label="容積率至少（%）" inputMode="decimal" defaultValue={defaults.far_min_pct} />
        <Field name="road_width_min_m" label="臨路至少（米）" inputMode="decimal" defaultValue={defaults.road_width_min_m} />
      </FormSection>

      <FormSection title="必要與排除條件">
        <TextareaField name="must_haves" label="必要條件" defaultValue={defaults.must_haves} rows={2} className="md:col-span-2" />
        <TextareaField name="exclusions" label="明確排除（一行一項）" defaultValue={defaults.exclusions?.join("\n")} rows={3} placeholder={"近高壓電塔\n路沖"} className="md:col-span-2" />
        <TextareaField name="notes" label="備註" defaultValue={defaults.notes} rows={2} className="md:col-span-2" />
        <CheckboxField name="confirmed" label="此需求已經客戶確認" defaultChecked={!!defaults.confirmed_at} />
      </FormSection>
    </ActionForm>
  );
}
