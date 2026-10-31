"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ActionForm, CheckboxField, Field, SelectField } from "@/components/form-kit";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { FormState } from "@/lib/validation";
import type { InviteState } from "./actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const ROLE_OPTIONS = [
  { value: "owner", label: "負責人" },
  { value: "manager", label: "經理" },
  { value: "agent", label: "業務" },
  { value: "viewer", label: "檢視者" },
];

export function InviteForm({ action, canInviteManager }: { action: (prev: InviteState, fd: FormData) => Promise<InviteState>; canInviteManager: boolean }) {
  const [state, formAction] = useActionState<InviteState, FormData>(action, {});
  const [copied, setCopied] = useState(false);
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <div className="grid gap-3 md:grid-cols-[1fr_160px]">
        <div className="space-y-1.5">
          <Label htmlFor="inv-email">Email</Label>
          <Input id="inv-email" name="email" type="email" inputMode="email" required aria-invalid={!!state.fieldErrors?.email} />
          <FieldError messages={state.fieldErrors?.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-role">角色</Label>
          <Select id="inv-role" name="role" defaultValue="agent">
            {ROLE_OPTIONS.filter((r) => r.value !== "owner" && (canInviteManager || r.value !== "manager")).map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <legend className="mb-1 text-xs text-muted-foreground">額外權限（業務、檢視者預設皆無）</legend>
        {[
          ["can_view_floor_price", "看所有底價"],
          ["can_view_contact_pii", "看所有客戶聯絡資訊"],
          ["can_export", "匯出"],
          ["can_manage_files", "管理檔案"],
        ].map(([name, label]) => (
          <label key={name} className="flex min-h-9 items-center gap-2">
            <input type="checkbox" name={name} className="size-4" /> {label}
          </label>
        ))}
      </fieldset>
      <FormMessage state={state} />
      {state.link && (
        <div className="space-y-2 rounded-md border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">系統尚未串接寄信服務，請複製連結以 LINE 或 Email 傳給對方。對方需用同一個 Email 註冊/登入才能加入。</p>
          <div className="flex gap-2">
            <Input readOnly value={state.link} aria-label="邀請連結" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "已複製" : "複製"}
            </Button>
          </div>
        </div>
      )}
      <SubmitButton pendingText="建立中…">建立邀請連結</SubmitButton>
    </form>
  );
}

export function MemberRowForm({
  action,
  member,
  actorRole,
}: {
  action: Action;
  member: { user_id: string; role: string; status: string; can_view_floor_price: boolean; can_view_contact_pii: boolean; can_export: boolean; can_manage_files: boolean };
  actorRole: string;
}) {
  const roles = ROLE_OPTIONS.filter((r) => actorRole === "owner" || r.value === "agent" || r.value === "viewer");
  return (
    <ActionForm action={action} submitLabel="儲存" pendingLabel="儲存中…" className="space-y-2">
      <input type="hidden" name="user_id" value={member.user_id} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField name="role" label="角色" options={roles} defaultValue={member.role} />
        <SelectField
          name="status"
          label="狀態"
          options={[
            { value: "active", label: "啟用" },
            { value: "suspended", label: "停用" },
          ]}
          defaultValue={member.status === "suspended" ? "suspended" : "active"}
        />
      </div>
      <div className="grid grid-cols-2">
        <CheckboxField name="can_view_floor_price" label="底價" defaultChecked={member.can_view_floor_price} />
        <CheckboxField name="can_view_contact_pii" label="聯絡資訊" defaultChecked={member.can_view_contact_pii} />
        <CheckboxField name="can_export" label="匯出" defaultChecked={member.can_export} />
        <CheckboxField name="can_manage_files" label="檔案" defaultChecked={member.can_manage_files} />
      </div>
    </ActionForm>
  );
}

export function PreferencesForm({
  action,
  prefs,
}: {
  action: Action;
  prefs: { reminders_enabled: boolean; include_weekends: boolean; morning_time: string; evening_time: string; weekly_dow: number; weekly_time: string };
}) {
  return (
    <ActionForm action={action} submitLabel="儲存提醒設定" className="space-y-3">
      <CheckboxField name="reminders_enabled" label="啟用站內提醒" defaultChecked={prefs.reminders_enabled} />
      <CheckboxField name="include_weekends" label="週末也提醒" defaultChecked={prefs.include_weekends} />
      <div className="grid grid-cols-2 gap-3">
        <Field name="morning_time" label="今日 TOP 3" type="time" defaultValue={prefs.morning_time.slice(0, 5)} />
        <Field name="evening_time" label="今日回顧" type="time" defaultValue={prefs.evening_time.slice(0, 5)} />
        <SelectField
          name="weekly_dow"
          label="週結算日"
          defaultValue={String(prefs.weekly_dow)}
          options={["週一", "週二", "週三", "週四", "週五", "週六", "週日"].map((l, i) => ({ value: String(i + 1), label: l }))}
        />
        <Field name="weekly_time" label="週結算時間" type="time" defaultValue={prefs.weekly_time.slice(0, 5)} />
      </div>
      <p className="text-xs text-muted-foreground">提醒由伺服器排程每小時產生，不需開著網頁。LINE／Email 推播尚未串接。</p>
    </ActionForm>
  );
}

