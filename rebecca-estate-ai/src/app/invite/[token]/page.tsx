import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/brand";
import { isSupabaseConfigured } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { AcceptInviteForm } from "./accept-form";

export const dynamic = "force-dynamic";
// 邀請 token 在網址中，避免經由 Referer 外洩
export const metadata = { title: "接受邀請", referrer: "no-referrer" as const };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSupabaseConfigured()) redirect("/setup");
  const { user } = await getUser();
  const next = encodeURIComponent(`/invite/${token}`);

  if (!user) {
    return (
      <AuthShell title="你被邀請加入工作空間" subtitle="請用收到邀請的 Email 登入或註冊後繼續。">
        <div className="flex flex-col gap-3">
          <Link href={`/login?next=${next}`} className="rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground">
            登入
          </Link>
          <Link href={`/signup?next=${next}`} className="rounded-md border px-4 py-2.5 text-center text-sm font-medium">
            註冊新帳號
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="接受邀請" subtitle={`目前登入：${user.email}`}>
      <AcceptInviteForm token={token} />
    </AuthShell>
  );
}
