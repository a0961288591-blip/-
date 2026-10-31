import Link from "next/link";
import { AuthShell } from "@/components/brand";

export default function NotFound() {
  return (
    <AuthShell title="找不到頁面" subtitle="此頁面不存在，或你沒有存取這個工作空間的權限。">
      <Link href="/" className="font-medium text-primary underline underline-offset-4">
        回到首頁
      </Link>
    </AuthShell>
  );
}
