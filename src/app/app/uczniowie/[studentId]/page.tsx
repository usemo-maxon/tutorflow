import { Suspense } from "react";
import { StudentDetailPage } from "@/components/pages/student-detail-page";
import { PageLoading } from "@/components/ui/loading";
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StudentDetailPage />
    </Suspense>
  );
}
