"use client";

import { createContext, useActionState, useContext, useEffect, useRef } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { FormState } from "@/lib/validation";
import { cn } from "@/lib/utils";

const FormCtx = createContext<FormState>({});

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/**
 * 通用表單：處理送出中、錯誤訊息、欄位錯誤、失敗回填、可能重複資料確認。
 * 子元件 <Field> 會自動讀取錯誤與回填值。
 */
export function ActionForm({
  action,
  children,
  submitLabel = "儲存",
  pendingLabel = "儲存中…",
  className,
  resetOnSuccess = false,
  submitClassName,
  footer,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  submitClassName?: string;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormCtx.Provider value={state}>
      <form ref={ref} action={formAction} className={cn("space-y-4", className)} noValidate>
        {children}
        {state.duplicates && state.duplicates.length > 0 && (
          <div role="alert" className="space-y-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-warning">
              <AlertTriangle className="size-4" /> 可能是重複資料，請先確認：
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {state.duplicates.map((d) => (
                <li key={d.href}>
                  <Link href={d.href} target="_blank" className="text-primary underline underline-offset-2">
                    {d.label}
                  </Link>
                  <span className="ml-2 text-muted-foreground">（{d.reason}）</span>
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="confirm_duplicate" className="size-4" /> 我已確認不是同一筆，仍要建立
            </label>
          </div>
        )}
        <FormMessage state={state} />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingText={pendingLabel} className={submitClassName}>
            {submitLabel}
          </SubmitButton>
          {footer}
        </div>
      </form>
    </FormCtx.Provider>
  );
}

export function useFormState() {
  return useContext(FormCtx);
}

function valueOf(state: FormState, name: string, fallback?: string | number | null): string | undefined {
  const v = state.values?.[name];
  if (v !== undefined) return Array.isArray(v) ? v[0] : v;
  return fallback === null || fallback === undefined ? undefined : String(fallback);
}

interface FieldProps {
  name: string;
  label: string;
  hint?: string;
  className?: string;
  required?: boolean;
}

export function Field({
  name,
  label,
  hint,
  className,
  required,
  defaultValue,
  ...input
}: FieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue"> & { defaultValue?: string | number | null }) {
  const state = useFormState();
  const errors = state.fieldErrors?.[name];
  const id = `f-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input id={id} name={name} key={valueOf(state, name, defaultValue)} defaultValue={valueOf(state, name, defaultValue)} aria-invalid={!!errors} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError messages={errors} />
    </div>
  );
}

export function TextareaField({
  name,
  label,
  hint,
  className,
  required,
  defaultValue,
  ...rest
}: FieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "defaultValue"> & { defaultValue?: string | null }) {
  const state = useFormState();
  const errors = state.fieldErrors?.[name];
  const id = `f-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Textarea id={id} name={name} key={valueOf(state, name, defaultValue)} defaultValue={valueOf(state, name, defaultValue)} aria-invalid={!!errors} {...rest} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError messages={errors} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  placeholder,
  hint,
  className,
  required,
  disabled,
}: FieldProps & {
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  placeholder?: string;
  disabled?: boolean;
}) {
  const state = useFormState();
  const errors = state.fieldErrors?.[name];
  const id = `f-${name}`;
  const value = valueOf(state, name, defaultValue) ?? "";
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Select id={id} name={name} key={value} defaultValue={value} aria-invalid={!!errors} disabled={disabled}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError messages={errors} />
    </div>
  );
}

export function CheckboxField({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  const state = useFormState();
  const checked = state.values ? state.values[name] === "on" : !!defaultChecked;
  return (
    <div>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" name={name} key={String(checked)} defaultChecked={checked} className="size-4 accent-[var(--primary)]" />
        {label}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CheckboxGroup({
  name,
  label,
  options,
  defaultValues = [],
  required,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValues?: string[];
  required?: boolean;
}) {
  const state = useFormState();
  const errors = state.fieldErrors?.[name];
  const raw = state.values?.[name];
  const selected = state.values ? (Array.isArray(raw) ? raw : raw ? [raw] : []) : defaultValues;
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="checkbox" name={name} value={o.value} key={`${o.value}-${selected.includes(o.value)}`} defaultChecked={selected.includes(o.value)} className="size-4 accent-[var(--primary)]" />
            {o.label}
          </label>
        ))}
      </div>
      <FieldError messages={errors} />
    </fieldset>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 md:p-5">
      <div>
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
