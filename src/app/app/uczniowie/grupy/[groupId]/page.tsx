import { Suspense } from "react";
import { GroupDetailPage } from "@/components/pages/group-detail-page";
import { PageLoading } from "@/components/ui/loading";

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <GroupDetailPage />
    </Suspense>
  );
}
