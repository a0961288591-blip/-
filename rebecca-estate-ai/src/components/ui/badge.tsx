import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-primary/10 text-primary",
      gold: "bg-accent-soft text-[#7a5f33]",
      muted: "bg-muted text-muted-foreground",
      warning: "bg-warning-soft text-warning",
      danger: "bg-destructive-soft text-destructive",
      success: "bg-success-soft text-success",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** 資料可信度狀態：已核實 / 待確認 / 已過期 / AI 概念示意 */
export const VERIFICATION_BADGE = {
  verified: { label: "已核實", variant: "success" },
  pending: { label: "待確認", variant: "warning" },
  expired: { label: "已過期", variant: "danger" },
  ai_concept: { label: "AI 概念示意", variant: "gold" },
} as const;

export function VerificationBadge({ status }: { status: keyof typeof VERIFICATION_BADGE }) {
  const v = VERIFICATION_BADGE[status];
  return <Badge variant={v.variant}>{v.label}</Badge>;
}
