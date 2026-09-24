import { SubscriptionSettings } from "@/components/pages/subscription-settings";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
  const safePayment = ["processing", "failed", "cancelled"].includes(
    payment ?? "",
  )
    ? (payment as "processing" | "failed" | "cancelled")
    : undefined;
  return <SubscriptionSettings payment={safePayment} />;
}
