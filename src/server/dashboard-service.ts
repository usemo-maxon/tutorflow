import "server-only";

import type { DashboardData } from "@/lib/dashboard";
import { buildDashboardData } from "./dashboard";
import { queryTodayDashboardSource } from "./dashboard-repository";

export async function getTodayDashboard(
  teacherId: string,
  now = new Date(),
): Promise<DashboardData> {
  return buildDashboardData(await queryTodayDashboardSource(teacherId, now));
}
