"use client";

import { useActionState } from "react";
import { createTenantAction } from "./actions";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { FormState } from "@/lib/validation";

export function OnboardingForm() {
  const [state, action] = useActionState<FormState, FormData>(createTenantAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">工作空間名稱</Label>
        <Input id="name" name="name" defaultValue={state.values?.name} placeholder="例如：庭妍土地開發工作室" required aria-invalid={!!state.fieldErrors?.name} />
        <FieldError messages={state.fieldErrors?.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">網址代號（英文小寫、數字、連字號）</Label>
        <Input id="slug" name="slug" defaultValue={state.values?.slug} placeholder="rebecca-land" autoCapitalize="none" autoCorrect="off" required aria-invalid={!!state.fieldErrors?.slug} />
        <FieldError messages={state.fieldErrors?.slug} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="kind">類型</Label>
        <Select id="kind" name="kind" key={state.values?.kind} defaultValue={state.values?.kind ?? "solo"}>
          <option value="solo">個人工作室</option>
          <option value="team">團隊</option>
          <option value="company">房仲公司</option>
        </Select>
        <FieldError messages={state.fieldErrors?.kind} />
      </div>
      <p className="text-xs text-muted-foreground">建立後自動開始 14 天試用（模擬計費，不會扣款）。</p>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="建立中…">
        建立工作空間
      </SubmitButton>
    </form>
  );
}
