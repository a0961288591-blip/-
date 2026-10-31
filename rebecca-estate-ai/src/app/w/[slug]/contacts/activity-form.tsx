"use client";

import { ActionForm, CheckboxField, Field, SelectField, TextareaField } from "@/components/form-kit";
import { ACTIVITY_KIND, ACTIVITY_STATUS, optionsOf } from "@/lib/labels";
import type { FormState } from "@/lib/validation";

/**
 * 聯繫紀錄：手機帶看時能快速填寫。
 * 只有「已完成」且勾選「實際接通」才會推進客戶階段。
 */
export function ActivityForm({
  action,
  contactId,
  contacts,
  properties,
  nowLocal,
  submitLabel = "記錄",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  contactId?: string;
  contacts?: { id: string; display_name: string }[];
  properties: { id: string; label: string }[];
  nowLocal: string;
  submitLabel?: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess submitClassName="w-full md:w-auto" className="space-y-3">
      {contactId ? (
        <input type="hidden" name="contact_id" value={contactId} />
      ) : (
        <SelectField name="contact_id" label="客戶" required placeholder="請選擇客戶" options={(contacts ?? []).map((c) => ({ value: c.id, label: c.display_name }))} />
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SelectField name="kind" label="方式" options={optionsOf(ACTIVITY_KIND)} defaultValue="call" />
        <SelectField name="status" label="結果" options={optionsOf(ACTIVITY_STATUS)} defaultValue="completed" />
        <Field name="occurred_at" label="時間" type="datetime-local" defaultValue={nowLocal} className="col-span-2" />
      </div>
      <CheckboxField name="reached" label="實際接通／見到本人" hint="未接、留言、已讀不回都不算接通" />
      <TextareaField name="summary" label="摘要" required rows={3} placeholder="例：屋主同意 3,680 萬開價，週六可帶看" />
      <div className="grid gap-3 md:grid-cols-2">
        <Field name="next_step" label="下一步" placeholder="例：寄謄本、約帶看" />
        <Field name="next_follow_up_at" label="下次追蹤" type="datetime-local" />
        {properties.length > 0 && (
          <SelectField name="property_id" label="相關物件（選填）" placeholder="無" options={properties.map((p) => ({ value: p.id, label: p.label }))} />
        )}
      </div>
      <CheckboxField name="create_task" label="同時建立追蹤待辦（依下次追蹤時間）" />
    </ActionForm>
  );
}
