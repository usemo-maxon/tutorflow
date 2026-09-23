"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AppAction, AppData } from "@/lib/domain";
import type {
  LessonWorkspaceAction,
  LessonWorkspaceData,
} from "@/lib/lesson-workspace";
import type { FinanceAction, FinancialOverview } from "@/lib/finance";
import {
  ClientApiError,
  fetchAppData,
  fetchDashboardData,
  fetchLessonWorkspace,
  fetchFinancialOverview,
  mutateApp,
  mutateLessonWorkspace,
  mutateFinancialOverview,
  completeOnboarding,
} from "@/lib/api-client";

export function useDashboardData(teacherId: string) {
  const router = useRouter();
  return useQuery({
    queryKey: ["dashboard", teacherId],
    queryFn: ({ signal }) => fetchDashboardData(signal),
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

export function useLessonWorkspace(teacherId: string, lessonId: string) {
  const router = useRouter();
  return useQuery({
    queryKey: ["lesson-workspace", teacherId, lessonId],
    queryFn: ({ signal }) => fetchLessonWorkspace(lessonId, signal),
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

export function useLessonWorkspaceMutation(
  teacherId: string,
  lessonId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: LessonWorkspaceAction) =>
      mutateLessonWorkspace(lessonId, action),
    onSuccess(data) {
      queryClient.setQueryData<LessonWorkspaceData>(
        ["lesson-workspace", teacherId, lessonId],
        data,
      );
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", teacherId],
      });
      void queryClient.invalidateQueries({ queryKey: ["app", teacherId] });
    },
  });
}

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
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", teacherId],
      });
    },
  });
}

export function useCompleteOnboarding(teacherId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeOnboarding,
    onSuccess({ completedAt }) {
      queryClient.setQueriesData<AppData>(
        { queryKey: ["app", teacherId] },
        (data) =>
          data
            ? {
                ...data,
                teacher: {
                  ...data.teacher,
                  onboardingCompletedAt: completedAt,
                },
              }
            : data,
      );
      void queryClient.invalidateQueries({ queryKey: ["app", teacherId] });
    },
  });
}

export function useFinancialOverview(teacherId: string, studentId?: string) {
  const router = useRouter();
  return useQuery({
    queryKey: ["finance", teacherId, studentId ?? "workspace"],
    queryFn: ({ signal }) => fetchFinancialOverview({ studentId }, signal),
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

export function useFinanceMutation(teacherId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: FinanceAction) => mutateFinancialOverview(action),
    onSuccess(data, action) {
      queryClient.setQueryData<FinancialOverview>(
        ["finance", teacherId, action.studentId],
        data,
      );
      void queryClient.invalidateQueries({ queryKey: ["finance", teacherId] });
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", teacherId],
      });
      void queryClient.invalidateQueries({ queryKey: ["app", teacherId] });
    },
  });
}
