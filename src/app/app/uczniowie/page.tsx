import { Suspense } from "react";
import { StudentsPage } from "@/components/pages/students-page";
import { PageLoading } from "@/components/ui/loading";
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StudentsPage />
    </Suspense>
  );
}
