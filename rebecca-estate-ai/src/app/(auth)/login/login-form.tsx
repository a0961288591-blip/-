"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { FormState } from "@/lib/validation";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/"} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" defaultValue={state.values?.email} type="email" autoComplete="email" inputMode="email" required aria-invalid={!!state.fieldErrors?.email} />
        <FieldError messages={state.fieldErrors?.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密碼</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!state.fieldErrors?.password} />
        <FieldError messages={state.fieldErrors?.password} />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="登入中…">
        登入
      </SubmitButton>
    </form>
  );
}
