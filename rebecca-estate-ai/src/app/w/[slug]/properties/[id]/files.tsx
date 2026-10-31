"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { FILE_KIND, FILE_SENSITIVITY, optionsOf } from "@/lib/labels";
import { abortUploadAction, fileDownloadUrlAction, finishUploadAction, prepareUploadAction } from "../actions";

const MAX_BYTES = 50 * 1024 * 1024;

/** 上傳流程：伺服器建立中繼資料（RLS 驗證）→ 瀏覽器直傳私有 Storage（Storage RLS 再驗證）→ 失敗則回收中繼資料 */
export function FileUploader({ slug, propertyId, canRestricted }: { slug: string; propertyId: string; canRestricted: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("photo");
  const [sensitivity, setSensitivity] = useState("internal");
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const upload = () => {
    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) {
      setStatus({ type: "error", text: "請先選擇檔案" });
      return;
    }
    setStatus(null);
    start(async () => {
      const supabase = createClient();
      let okCount = 0;
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          setStatus({ type: "error", text: `${file.name} 超過 50MB` });
          continue;
        }
        const prep = await prepareUploadAction(slug, propertyId, {
          kind,
          sensitivity,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (!prep.ok) {
          setStatus({ type: "error", text: `${file.name}：${prep.error}` });
          continue;
        }
        const { error } = await supabase.storage.from("property-files").upload(prep.path, file, { contentType: file.type || undefined, upsert: false });
        if (error) {
          await abortUploadAction(slug, prep.fileId);
          setStatus({ type: "error", text: `${file.name} 上傳失敗` });
          continue;
        }
        okCount++;
      }
      if (okCount) {
        await finishUploadAction(slug, propertyId);
        setStatus({ type: "ok", text: `已上傳 ${okCount} 個檔案` });
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  const sensitivities = optionsOf(FILE_SENSITIVITY).filter((o) => canRestricted || o.value !== "restricted");

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="file-kind">類別</Label>
          <Select id="file-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {optionsOf(FILE_KIND).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="file-sens">權限</Label>
          <Select id="file-sens" value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
            {sensitivities.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="file-input">檔案（單檔 50MB 內）</Label>
          <input id="file-input" ref={inputRef} type="file" multiple className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={upload} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Upload />} {pending ? "上傳中…" : "上傳"}
        </Button>
        {status && (
          <span role={status.type === "error" ? "alert" : "status"} className={status.type === "error" ? "text-sm text-destructive" : "text-sm text-success"}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}

export function DownloadButton({ slug, fileId }: { slug: string; fileId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await fileDownloadUrlAction(slug, fileId);
            if (res.url) window.location.href = res.url;
            else setError(res.error ?? "無法下載");
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Download />} 下載
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
