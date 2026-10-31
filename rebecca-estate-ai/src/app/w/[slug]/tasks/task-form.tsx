"use client";

import { ActionForm, Field, SelectField, TextareaField } from "@/components/form-kit";
import { TASK_KIND, optionsOf } from "@/lib/labels";
import type { FormState } from "@/lib/validation";

export function TaskForm({
  action,
  members,
  me,
  canAssign,
  properties,
  contacts,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  members: { user_id: string; name: string }[];
  me: string;
  canAssign: boolean;
  properties: { id: string; label: string }[];
  contacts: { id: string; label: string }[];
}) {
  return (
    <ActionForm action={action} submitLabel="新增待辦" resetOnSuccess className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Field name="title" label="待辦內容" required className="md:col-span-2" placeholder="例：寄謄本給陳董" />
        <SelectField name="kind" label="類型" options={optionsOf(TASK_KIND)} defaultValue="todo" />
        <SelectField
          name="priority"
          label="優先"
          defaultValue="2"
          options={[
            { value: "1", label: "高" },
            { value: "2", label: "中" },
            { value: "3", label: "低" },
          ]}
        />
        <Field name="due_at" label="截止時間" type="datetime-local" />
        {canAssign ? (
          <SelectField name="assignee_id" label="指派給" options={members.map((m) => ({ value: m.user_id, label: m.name }))} defaultValue={me} />
        ) : (
          <input type="hidden" name="assignee_id" value={me} />
        )}
        <SelectField name="property_id" label="關聯物件" placeholder="無" options={properties.map((p) => ({ value: p.id, label: p.label }))} />
        <SelectField name="contact_id" label="關聯客戶" placeholder="無" options={contacts.map((c) => ({ value: c.id, label: c.label }))} />
        <Field name="next_step" label="下一步" className="md:col-span-2" />
        <TextareaField name="description" label="說明" rows={2} className="md:col-span-2" />
      </div>
    </ActionForm>
  );
}
