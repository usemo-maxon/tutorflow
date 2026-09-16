import { Suspense } from "react";
import { GroupsPage } from "@/components/pages/groups-page";
import { PageLoading } from "@/components/ui/loading";

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <GroupsPage />
    </Suspense>
  );
}
