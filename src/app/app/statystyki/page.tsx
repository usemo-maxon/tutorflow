import { Suspense } from "react";
import { StatisticsPage } from "@/components/pages/statistics-page";
import { PageLoading } from "@/components/ui/loading";
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StatisticsPage />
    </Suspense>
  );
}
