import Link from "next/link";
import { AuthShell } from "@/components/brand";
import { SignupForm } from "./signup-form";
import { safeNextPath } from "@/lib/validation";

export const metadata = { title: "註冊" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next, "/onboarding");
  return (
    <AuthShell title="建立帳號" subtitle="註冊後可建立個人工作室或團隊工作空間，含 14 天試用。">
      <SignupForm next={safeNext} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        已有帳號？
        <Link href={`/login?next=${encodeURIComponent(safeNext)}`} className="ml-1 font-medium text-primary underline underline-offset-4">
          登入
        </Link>
      </p>
    </AuthShell>
  );
}
