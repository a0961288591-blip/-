import Link from "next/link";
import { AuthShell } from "@/components/brand";
import { SignupForm } from "./signup-form";

export const metadata = { title: "註冊" };

export default function SignupPage() {
  return (
    <AuthShell title="建立帳號" subtitle="註冊後可建立個人工作室或團隊工作空間，含 14 天試用。">
      <SignupForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        已有帳號？
        <Link href="/login" className="ml-1 font-medium text-primary underline underline-offset-4">
          登入
        </Link>
      </p>
    </AuthShell>
  );
}
