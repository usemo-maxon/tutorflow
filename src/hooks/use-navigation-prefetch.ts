"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { calendarQueryRange } from "@/lib/calendar-interactions";
import {
  appDataOptions,
  bookingsOptions,
  dashboardOptions,
  financeOptions,
  materialsOptions,
} from "@/lib/workspace-queries";

const warmRoutes = [
  "/app/dzisiaj",
  "/app/uczniowie",
  "/app/kalendarz",
  "/app/materialy",
  "/app/rezerwacje",
  "/app/statystyki",
  "/app/platnosci",
];

export function useNavigationPrefetch(teacherId: string, timezone: string) {
  const client = useQueryClient();
  const prefetch = useCallback(
    async (href: string) => {
      const options = { staleTime: 30_000, retry: false as const };
      switch (href) {
        case "/app/dzisiaj":
          await client.prefetchQuery({
            ...dashboardOptions(teacherId),
            ...options,
          });
          break;
        case "/app/kalendarz":
          await client.prefetchQuery({
            ...appDataOptions(
              teacherId,
              calendarQueryRange(new Date(), "week", timezone),
              "calendar",
            ),
            ...options,
          });
          break;
        case "/app/uczniowie":
        case "/app/statystyki":
          await client.prefetchQuery({
            ...appDataOptions(
              teacherId,
              undefined,
              href.endsWith("uczniowie") ? "students" : "statistics",
            ),
            ...options,
          });
          break;
        case "/app/rezerwacje":
          await client.prefetchQuery({
            ...bookingsOptions(teacherId),
            ...options,
          });
          break;
        case "/app/materialy":
          await client.prefetchQuery({
            ...materialsOptions(teacherId),
            ...options,
          });
          break;
        case "/app/platnosci":
          await client.prefetchQuery({
            ...financeOptions(teacherId),
            ...options,
          });
          break;
      }
    },
    [client, teacherId, timezone],
  );

  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (
      connection?.saveData ||
      /(^|-)2g$/.test(connection?.effectiveType ?? "")
    )
      return;
    let stopped = false;
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const warmNext = async () => {
      if (stopped || index >= warmRoutes.length) return;
      // Let the visible page finish first. Warm only one API at a time,
      // and stop issuing background work while the tab is hidden.
      if (document.visibilityState === "visible" && client.isFetching() === 0) {
        await prefetch(warmRoutes[index++]);
      }
      if (!stopped) timer = setTimeout(warmNext, 1_000);
    };
    timer = setTimeout(warmNext, 1_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [client, prefetch]);

  return prefetch;
}
