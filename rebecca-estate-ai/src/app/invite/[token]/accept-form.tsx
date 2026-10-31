"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { FormState } from "@/lib/validation";
import { acceptInviteAction } from "./actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInviteAction.bind(null, token), {});
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted-foreground">加入後，你在該工作空間的權限由負責人或經理設定。各工作空間的資料彼此獨立。</p>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="加入中…">
        加入工作空間
      </SubmitButton>
    </form>
  );
}
