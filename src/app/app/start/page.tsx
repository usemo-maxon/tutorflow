import { redirect } from "next/navigation";
import { OnboardingPage } from "@/components/pages/onboarding-page";
import { currentTeacher } from "@/server/auth";

export default async function Page() {
  const teacher = await currentTeacher();
  if (!teacher) redirect("/logowanie");
  if (teacher.onboardingCompletedAt) redirect("/app/dzisiaj");
  return <OnboardingPage />;
}
