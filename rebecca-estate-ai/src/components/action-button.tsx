"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { FormState } from "@/lib/validation";

/** 單一動作按鈕（封存、刪除、標記已讀…）：可要求確認，顯示處理中與錯誤 */
export function ActionButton({
  action,
  confirm,
  children,
  ...props
}: Omit<ButtonProps, "onClick" | "action"> & { action: () => Promise<FormState | void>; confirm?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        disabled={pending || props.disabled}
        aria-busy={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const res = await action();
            if (res && res.error) setError(res.error);
          });
        }}
        {...props}
      >
        {pending && <Loader2 className="animate-spin" />}
        {children}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
