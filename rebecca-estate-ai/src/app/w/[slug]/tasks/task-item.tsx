"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Pause, Play, RotateCcw, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRIORITY_LABEL, STATUS_LABEL, type TaskStatus } from "@/lib/tasks";
import type { FormState } from "@/lib/validation";

export interface TaskView {
  id: string;
  title: string;
  kind_label: string;
  priority: number;
  status: TaskStatus;
  due_label: string | null;
  original_date: string;
  age_days: number;
  carried_over_count: number;
  is_stale: boolean;
  is_overdue: boolean;
  blocker: string | null;
  next_step: string | null;
  assignee: string | null;
  links: { href: string; label: string }[];
  can_edit: boolean;
}

function StatusButton({ value, children, variant = "outline" }: { value: TaskStatus; children: React.ReactNode; variant?: "outline" | "default" | "ghost" }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("status") === value;
  return (
    <Button type="submit" name="status" value={value} size="sm" variant={variant} disabled={pending}>
      {mine ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function TaskItem({ task, action }: { task: TaskView; action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [blocking, setBlocking] = useState(false);
  const open = task.status === "todo" || task.status === "in_progress" || task.status === "blocked";

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={open ? "font-medium" : "font-medium text-muted-foreground line-through"}>{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant={task.priority === 1 ? "danger" : "muted"}>優先 {PRIORITY_LABEL[task.priority]}</Badge>
            <Badge variant="muted">{task.kind_label}</Badge>
            <Badge variant={task.status === "blocked" ? "warning" : task.status === "done" ? "success" : "muted"}>{STATUS_LABEL[task.status]}</Badge>
            {task.is_overdue && <Badge variant="danger">已逾期</Badge>}
            {task.is_stale && <Badge variant="warning">超過 2 天未完成</Badge>}
            {task.carried_over_count > 0 && <Badge variant="gold">延續 {task.carried_over_count} 次</Badge>}
            {task.due_label && <span className="text-muted-foreground">截止 {task.due_label}</span>}
            <span className="text-muted-foreground">建立於 {task.original_date}</span>
            {task.assignee && <span className="text-muted-foreground">・{task.assignee}</span>}
          </div>
          {task.blocker && <p className="mt-1 text-sm text-warning">卡點：{task.blocker}</p>}
          {task.next_step && <p className="mt-1 text-sm text-muted-foreground">下一步：{task.next_step}</p>}
          {task.links.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-2 text-xs">
              {task.links.map((l) => (
                <Link key={l.href} href={l.href} className="text-primary underline underline-offset-2">
                  {l.label}
                </Link>
              ))}
            </p>
          )}
        </div>
      </div>

      {task.can_edit && (
        <form action={formAction} className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {open && task.status !== "in_progress" && (
              <StatusButton value="in_progress">
                <Play /> 開始
              </StatusButton>
            )}
            {open && (
              <StatusButton value="done" variant="default">
                <Check /> 完成
              </StatusButton>
            )}
            {open && task.status !== "blocked" && (
              <Button type="button" size="sm" variant="outline" onClick={() => setBlocking((b) => !b)} aria-expanded={blocking}>
                <Pause /> 卡關
              </Button>
            )}
            {open && (
              <StatusButton value="cancelled" variant="ghost">
                <X /> 取消
              </StatusButton>
            )}
            {!open && (
              <StatusButton value="todo" variant="ghost">
                <RotateCcw /> 重新開啟
              </StatusButton>
            )}
          </div>
          {blocking && (
            <div className="flex gap-2">
              <Input name="blocker" placeholder="卡在哪裡？例：等地主提供權狀" aria-label="卡關原因" />
              <StatusButton value="blocked">送出</StatusButton>
            </div>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.fieldErrors?.blocker?.[0] ?? state.error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
