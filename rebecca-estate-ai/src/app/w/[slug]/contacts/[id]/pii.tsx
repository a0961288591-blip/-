"use client";

import { useState } from "react";
import { Eye, EyeOff, Phone } from "lucide-react";
import { maskEmail, maskPhone, maskText } from "@/lib/mask";
import { Button } from "@/components/ui/button";

/** 預設遮罩；按「顯示」才露出完整聯絡資訊，降低旁人窺看風險 */
export function PiiPanel({ pii }: { pii: { phone: string | null; phone_alt: string | null; email: string | null; line_id: string | null; address: string | null } }) {
  const [shown, setShown] = useState(false);
  const rows: [string, string | null, (v: string) => string][] = [
    ["電話", pii.phone, maskPhone],
    ["其他電話", pii.phone_alt, maskPhone],
    ["Email", pii.email, maskEmail],
    ["LINE", pii.line_id, (v) => maskText(v, 2)],
    ["地址", pii.address, (v) => maskText(v, 6)],
  ];
  const any = rows.some(([, v]) => v);
  if (!any) return <p className="text-sm text-warning">尚未登錄聯絡資訊。</p>;
  return (
    <div className="space-y-2">
      <dl className="text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([label, v, mask]) => (
            <div key={label} className="flex justify-between gap-3 border-b py-2 last:border-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="flex items-center gap-2 break-all text-right font-mono">
                {shown ? v : mask(v!)}
                {shown && (label === "電話" || label === "其他電話") && (
                  <a href={`tel:${v!.replace(/[^\d+]/g, "")}`} aria-label={`撥打 ${label}`} className="rounded-md bg-primary p-1.5 text-primary-foreground">
                    <Phone className="size-3.5" />
                  </a>
                )}
              </dd>
            </div>
          ))}
      </dl>
      <Button type="button" size="sm" variant="outline" onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff /> : <Eye />} {shown ? "隱藏" : "顯示完整資訊"}
      </Button>
    </div>
  );
}
