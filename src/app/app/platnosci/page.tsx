import { Suspense } from "react";
import { PaymentsPage } from "@/components/pages/payments-page";
import { PageLoading } from "@/components/ui/loading";
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PaymentsPage />
    </Suspense>
  );
}
