import { queryOptions } from "@tanstack/react-query";
import type { AppDataScope } from "./domain";
import {
  fetchAppData,
  fetchDashboardData,
  fetchFinancialOverview,
  fetchTutorBookings,
  fetchMaterials,
} from "./api-client";

// Keep one definition for consumers and navigation prefetching.
// The cache lives only in the signed-in workspace's QueryClient.
export function appDataOptions(
  teacherId: string,
  range?: { start: string; end: string },
  scope: AppDataScope = "full",
) {
  return queryOptions({
    queryKey: [
      "app",
      teacherId,
      scope,
      range?.start ?? "all",
      range?.end ?? "all",
    ],
    queryFn: ({ signal }) => fetchAppData(signal, range, scope),
  });
}

export function dashboardOptions(teacherId: string) {
  return queryOptions({
    queryKey: ["dashboard", teacherId],
    queryFn: ({ signal }) => fetchDashboardData(signal),
  });
}

export function financeOptions(teacherId: string, studentId?: string) {
  return queryOptions({
    queryKey: ["finance", teacherId, studentId ?? "workspace"],
    queryFn: ({ signal }) => fetchFinancialOverview({ studentId }, signal),
  });
}

export function bookingsOptions(teacherId: string) {
  return queryOptions({
    queryKey: ["new-bookings", teacherId],
    queryFn: ({ signal }) => fetchTutorBookings(signal),
  });
}

export function materialsOptions(teacherId: string, query = "") {
  return queryOptions({
    queryKey: ["materials", teacherId, query],
    queryFn: ({ signal }) => fetchMaterials(query, signal),
  });
}
