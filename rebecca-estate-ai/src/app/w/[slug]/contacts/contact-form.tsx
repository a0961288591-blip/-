"use client";

import { ActionForm, CheckboxField, CheckboxGroup, Field, FormSection, SelectField, TextareaField } from "@/components/form-kit";
import { CONSENT, CONTACT_GRADE, CONTACT_STAGE, CONTACT_TYPE, optionsOf } from "@/lib/labels";
import type { FormState } from "@/lib/validation";

export interface ContactDefaults {
  contact_types?: string[];
  display_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  source?: string | null;
  is_public_lead?: boolean;
  public_source_url?: string | null;
  owner_user_id?: string | null;
  grade?: string | null;
  stage?: string | null;
  marketing_consent?: string | null;
  do_not_contact?: boolean;
  next_follow_up_local?: string | null;
  notes?: string | null;
  phone?: string | null;
  phone_alt?: string | null;
  email?: string | null;
  line_id?: string | null;
  address?: string | null;
}

export function ContactForm({
  action,
  defaults = {},
  members,
  canAssign,
  showPii,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: ContactDefaults;
  members: { user_id: string; name: string }[];
  canAssign: boolean;
  showPii: boolean;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} submitClassName="w-full md:w-auto">
      <FormSection title="基本資料">
        <div className="md:col-span-2">
          <CheckboxGroup name="contact_types" label="客戶類型（可複選）" required options={optionsOf(CONTACT_TYPE)} defaultValues={defaults.contact_types ?? []} />
        </div>
        <Field name="display_name" label="姓名／稱呼" required defaultValue={defaults.display_name} placeholder="例：林董、王小姐" />
        <Field name="company" label="公司" defaultValue={defaults.company} />
        <Field name="job_title" label="職稱" defaultValue={defaults.job_title} />
        <Field name="source" label="來源" defaultValue={defaults.source} placeholder="轉介、網路、陌開、公開資料…" />
        {canAssign ? (
          <SelectField name="owner_user_id" label="負責業務" options={members.map((m) => ({ value: m.user_id, label: m.name }))} defaultValue={defaults.owner_user_id} />
        ) : (
          <input type="hidden" name="owner_user_id" value={defaults.owner_user_id ?? ""} />
        )}
        <SelectField name="grade" label="客戶分級" placeholder="未分級" options={optionsOf(CONTACT_GRADE)} defaultValue={defaults.grade} />
      </FormSection>

      {showPii && (
        <FormSection title="聯絡資訊" description="機敏資料：只有負責業務、經理與獲授權成員看得到">
          <Field name="phone" label="電話" type="tel" inputMode="tel" autoComplete="off" defaultValue={defaults.phone} />
          <Field name="phone_alt" label="其他電話" type="tel" inputMode="tel" autoComplete="off" defaultValue={defaults.phone_alt} />
          <Field name="email" label="Email" type="email" inputMode="email" autoComplete="off" defaultValue={defaults.email} />
          <Field name="line_id" label="LINE ID" autoComplete="off" defaultValue={defaults.line_id} />
          <Field name="address" label="地址" autoComplete="off" defaultValue={defaults.address} className="md:col-span-2" />
        </FormSection>
      )}

      <FormSection title="經營狀態" description="「已聯繫」以上的階段，必須先有一筆實際接通的聯繫紀錄">
        <SelectField name="stage" label="階段" options={optionsOf(CONTACT_STAGE)} defaultValue={defaults.stage ?? "not_contacted"} />
        <Field name="next_follow_up_at" label="下次追蹤" type="datetime-local" defaultValue={defaults.next_follow_up_local} />
        <SelectField name="marketing_consent" label="行銷授權" options={optionsOf(CONSENT)} defaultValue={defaults.marketing_consent ?? "unknown"} />
        <div className="flex flex-col justify-end">
          <CheckboxField name="do_not_contact" label="勿擾（拒絕再聯繫）" defaultChecked={defaults.do_not_contact} />
        </div>
        <div className="md:col-span-2 space-y-2 rounded-md bg-muted/50 p-3">
          <CheckboxField name="is_public_lead" label="這是網路／公開資料查到的名單（尚未實際接觸）" defaultChecked={defaults.is_public_lead} hint="勾選後會從「研究名單」開始，不會被視為已聯繫" />
          <Field name="public_source_url" label="公開資料來源網址" defaultValue={defaults.public_source_url} placeholder="https://" />
        </div>
        <TextareaField name="notes" label="備註" defaultValue={defaults.notes} className="md:col-span-2" rows={3} />
      </FormSection>
    </ActionForm>
  );
}
