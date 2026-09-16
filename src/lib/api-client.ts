import type { DashboardData } from "./dashboard";
import type {
  LessonWorkspaceAction,
  LessonWorkspaceData,
} from "./lesson-workspace";
import type { AppAction, AppData, AppError, MutationResponse } from "./domain";

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: AppError,
  ) {
    super(data.message);
  }
}

export async function fetchAppData(
  signal?: AbortSignal,
  range?: { start: string; end: string },
): Promise<AppData> {
  const timeout = AbortSignal.timeout(20_000);
  const params = range
    ? `?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`
    : "";
  const response = await fetch(`/api/app${params}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: "no-store",
  });
  return parseResponse<AppData>(response);
}

export async function fetchDashboardData(
  signal?: AbortSignal,
): Promise<DashboardData> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch("/api/dashboard", {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: "no-store",
  });
  return parseResponse<DashboardData>(response);
}

export async function mutateApp(action: AppAction): Promise<MutationResponse> {
  const response = await fetch("/api/app", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
  return parseResponse<MutationResponse>(response);
}

export async function fetchLessonWorkspace(
  lessonId: string,
  signal?: AbortSignal,
): Promise<LessonWorkspaceData> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(
    `/api/lessons/${encodeURIComponent(lessonId)}/workspace`,
    {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    },
  );
  return parseResponse<LessonWorkspaceData>(response);
}

export async function mutateLessonWorkspace(
  lessonId: string,
  action: LessonWorkspaceAction,
): Promise<LessonWorkspaceData> {
  const response = await fetch(
    `/api/lessons/${encodeURIComponent(lessonId)}/workspace`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    },
  );
  return parseResponse<LessonWorkspaceData>(response);
}

export async function authRequest(
  action:
    | "login"
    | "register"
    | "demo"
    | "logout"
    | "request-reset"
    | "update-password",
  body?: unknown,
): Promise<{
  teacher?: { id: string };
  requiresEmailConfirmation?: boolean;
  ok?: boolean;
}> {
  const response = await fetch(`/api/auth/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | AppError;
  if (!response.ok) throw new ClientApiError(response.status, data as AppError);
  return data as T;
}
