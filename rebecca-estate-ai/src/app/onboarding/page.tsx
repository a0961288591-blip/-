import { AuthShell } from "@/components/brand";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "建立工作空間" };

export default function OnboardingPage() {
  return (
    <AuthShell
      title="建立你的工作空間"
      subtitle="每個工作空間的資料完全獨立。之後可邀請同事加入，或加入其他團隊的工作空間。"
    >
      <OnboardingForm />
    </AuthShell>
  );
}
