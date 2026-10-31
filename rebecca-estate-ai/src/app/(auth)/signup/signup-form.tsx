"use client";

import { useActionState } from "react";
import { signupAction } from "../actions";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { FormState } from "@/lib/validation";

export function SignupForm() {
  const [state, action] = useActionState<FormState, FormData>(signupAction, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="displayName">姓名</Label>
        <Input id="displayName" name="displayName" defaultValue={state.values?.displayName} autoComplete="name" required aria-invalid={!!state.fieldErrors?.displayName} />
        <FieldError messages={state.fieldErrors?.displayName} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" defaultValue={state.values?.email} type="email" autoComplete="email" inputMode="email" required aria-invalid={!!state.fieldErrors?.email} />
        <FieldError messages={state.fieldErrors?.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密碼（至少 8 碼）</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={!!state.fieldErrors?.password} />
        <FieldError messages={state.fieldErrors?.password} />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="建立中…">
        建立帳號
      </SubmitButton>
    </form>
  );
}
