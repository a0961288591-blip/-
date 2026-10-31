import Link from "next/link";
import { AuthShell } from "@/components/brand";
import { LoginForm } from "./login-form";
import { safeNextPath } from "@/lib/validation";

export const metadata = { title: "登入" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="登入" subtitle="歡迎回來，今天也一起把案子推進一步。">
      {sp.error === "auth" && (
        <p role="alert" className="mb-4 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          驗證連結無效或已過期，請重新登入。
        </p>
      )}
      <LoginForm next={safeNextPath(sp.next, "/")} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        還沒有帳號？
        <Link href="/signup" className="ml-1 font-medium text-primary underline underline-offset-4">
          免費註冊
        </Link>
      </p>
    </AuthShell>
  );
}
