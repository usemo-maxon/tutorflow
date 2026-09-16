"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AppAction, AppData } from "@/lib/domain";
import { ClientApiError, fetchAppData, mutateApp } from "@/lib/api-client";

export function useAppData(
  teacherId: string,
  range?: { start: string; end: string },
) {
  const router = useRouter();
  return useQuery({
    queryKey: ["app", teacherId, range?.start ?? "all", range?.end ?? "all"],
    queryFn: ({ signal }) => fetchAppData(signal, range),
    refetchInterval: 60_000,
    retry(failureCount, error) {
      if (error instanceof ClientApiError && error.status < 500) return false;
      return failureCount < 2;
    },
    throwOnError(error) {
      if (error instanceof ClientApiError && error.status === 401) {
        router.push("/logowanie");
      }
      return false;
    },
  });
}

export function useAppMutation(teacherId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: AppAction) => mutateApp(action),
    onSuccess(response) {
      queryClient.setQueryData<AppData>(
        ["app", teacherId, "all", "all"],
        response.data,
      );
      void queryClient.invalidateQueries({ queryKey: ["app", teacherId] });
    },
  });
}
