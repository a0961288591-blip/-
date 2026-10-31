"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { quickAddTaskAction } from "./actions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { FormState } from "@/lib/validation";

const LINKS = [
  { label: "電話紀錄", path: "activities/new" },
  { label: "物件", path: "properties/new" },
  { label: "買方", path: "contacts/new?type=buyer" },
];

/** 尚未開放的快速新增項目：以停用狀態顯示並註明開放階段，不偽裝成可操作 */
const UPCOMING = [
  { label: "議價", phase: 5 },
  { label: "文案", phase: 4 },
];

export function QuickAdd({ slug, canWrite }: { slug: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(quickAddTaskAction.bind(null, slug), {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section aria-labelledby="quick-add-title" className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="quick-add-title" className="text-sm font-semibold">
          快速新增
        </h2>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen((v) => !v)} disabled={!canWrite} aria-expanded={open}>
          {open ? <X /> : <Plus />} 待辦
        </Button>
        {canWrite &&
          LINKS.map((l) => (
            <Button key={l.path} asChild size="sm" variant="outline">
              <Link href={`/w/${slug}/${l.path}`}>
                <Plus /> {l.label}
              </Link>
            </Button>
          ))}
        {UPCOMING.map((u) => (
          <Button key={u.label} size="sm" variant="outline" disabled title={`Phase ${u.phase} 開放`}>
            {u.label}
            <span className="text-[10px] text-muted-foreground">P{u.phase}</span>
          </Button>
        ))}
      </div>
      {!canWrite && <p className="mt-2 text-xs text-muted-foreground">檢視者權限無法新增資料。</p>}

      {open && canWrite && (
        <form ref={formRef} action={action} className="mt-4 grid gap-3 md:grid-cols-[1fr_120px_200px_auto] md:items-end" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="qa-title">待辦內容</Label>
            <Input id="qa-title" name="title" defaultValue={state.values?.title} placeholder="例：回電林董確認建地鑑界時間" required autoFocus aria-invalid={!!state.fieldErrors?.title} />
            <FieldError messages={state.fieldErrors?.title} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-priority">優先</Label>
            <Select id="qa-priority" name="priority" key={String(state.values?.priority ?? "")} defaultValue={String(state.values?.priority ?? "2")}>
              <option value="1">高</option>
              <option value="2">中</option>
              <option value="3">低</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-due">截止時間（選填）</Label>
            <Input id="qa-due" name="dueAt" defaultValue={state.values?.dueAt} type="datetime-local" aria-invalid={!!state.fieldErrors?.dueAt} />
            <FieldError messages={state.fieldErrors?.dueAt} />
          </div>
          <SubmitButton pendingText="新增中…">新增</SubmitButton>
          <div className="md:col-span-4">
            <FormMessage state={state} />
          </div>
        </form>
      )}
    </section>
  );
}
