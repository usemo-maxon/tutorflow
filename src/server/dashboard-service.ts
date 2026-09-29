import "server-only";

import { dashboardBriefingPreview, type DashboardData } from "@/lib/dashboard";
import { buildDashboardData } from "./dashboard";
import { queryTodayDashboardSource } from "./dashboard-repository";
import { getNextLessonBriefing } from "./next-lesson-briefing";

export async function getTodayDashboard(
  teacherId: string,
  now = new Date(),
): Promise<DashboardData> {
  const dashboard = buildDashboardData(
    await queryTodayDashboardSource(teacherId, now),
  );
  if (!dashboard.nextLesson) return dashboard;

  try {
    const briefing = await getNextLessonBriefing(
      teacherId,
      dashboard.nextLesson.id,
      now.toISOString(),
    );
    const preview = dashboardBriefingPreview(
      briefing,
      dashboard.nextLesson.participantLabel,
    );
    return {
      ...dashboard,
      nextLesson: { ...dashboard.nextLesson, briefing: preview },
    };
  } catch {
    return {
      ...dashboard,
      partialErrors: [...dashboard.partialErrors, "briefing"],
    };
  }
}
