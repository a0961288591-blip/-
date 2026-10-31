import Link from "next/link";
import { AuthShell } from "@/components/brand";
import { isSupabaseConfigured } from "@/lib/env";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "系統設定說明" };

export default function SetupPage() {
  const configured = isSupabaseConfigured();
  return (
    <AuthShell title="連接雲端資料庫" subtitle="系統需要 Supabase 專案憑證才能登入與儲存資料。">
      <div className="space-y-4 text-sm leading-relaxed">
        <p>
          目前狀態：
          {configured ? <Badge variant="success">已設定</Badge> : <Badge variant="warning">尚未設定，所有功能未啟用</Badge>}
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            建立 Supabase 專案（區域建議 <b>Northeast Asia (Tokyo)</b>）。
          </li>
          <li>
            在專案根目錄執行 <code className="rounded bg-muted px-1">supabase db push</code> 套用 <code className="rounded bg-muted px-1">supabase/migrations</code>。
          </li>
          <li>
            複製 <code className="rounded bg-muted px-1">.env.example</code> 為 <code className="rounded bg-muted px-1">.env.local</code>，填入 URL 與 anon key；service role key 只放伺服器環境變數。
          </li>
          <li>重新啟動服務後回到首頁。</li>
        </ol>
        <p className="text-muted-foreground">詳細步驟見 docs/SETUP.md。</p>
        {configured && (
          <Link href="/login" className="font-medium text-primary underline underline-offset-4">
            前往登入
          </Link>
        )}
      </div>
    </AuthShell>
  );
}
