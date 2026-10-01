import type { DashboardData } from "./dashboard";
import type { FinanceAction, FinancialOverview } from "./finance";
import type {
  LessonWorkspaceAction,
  LessonWorkspaceData,
} from "./lesson-workspace";
import type {
  AppAction,
  AppData,
  AppDataScope,
  AppError,
  MutationResponse,
} from "./domain";
import type { StudentMemory } from "./student-memory";
import type { NextLessonBriefing } from "./next-lesson-briefing";
import type { GroupContinuity } from "./group-continuity";
import type {
  BookingConversionInput,
  BookingConversionResult,
  PublicBookingRecord,
  TutorBookingDetail,
} from "./public-booking";

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
  scope: AppDataScope = "full",
): Promise<AppData> {
  const timeout = AbortSignal.timeout(20_000);
  const params = new URLSearchParams();
  if (range) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  if (scope !== "full") params.set("scope", scope);
  const search = params.size ? `?${params}` : "";
  const response = await fetch(`/api/app${search}`, {
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

export async function fetchTutorBookings(
  signal?: AbortSignal,
): Promise<PublicBookingRecord[]> {
  const response = await fetch("/api/bookings", {
    signal,
    cache: "no-store",
  });
  return parseResponse(response);
}

export async function fetchTutorBooking(
  bookingId: string,
  signal?: AbortSignal,
): Promise<TutorBookingDetail> {
  const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
    signal,
    cache: "no-store",
  });
  return parseResponse(response);
}

export async function convertTutorBooking(
  bookingId: string,
  input: BookingConversionInput,
): Promise<BookingConversionResult> {
  const response = await fetch(
    `/api/bookings/${encodeURIComponent(bookingId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return parseResponse(response);
}

export async function completeOnboarding(): Promise<{
  completedAt: string;
  alreadyCompleted: boolean;
}> {
  const response = await fetch("/api/onboarding/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  return parseResponse(response);
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

export async function fetchStudentMemory(
  studentId: string,
  signal?: AbortSignal,
): Promise<StudentMemory> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(
    `/api/students/${encodeURIComponent(studentId)}/memory`,
    {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    },
  );
  return parseResponse<StudentMemory>(response);
}

export async function fetchNextLessonBriefing(
  lessonId: string,
  signal?: AbortSignal,
): Promise<NextLessonBriefing> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(
    `/api/lessons/${encodeURIComponent(lessonId)}/briefing`,
    {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    },
  );
  return parseResponse<NextLessonBriefing>(response);
}

export async function fetchGroupContinuity(
  groupId: string,
  signal?: AbortSignal,
): Promise<GroupContinuity> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/continuity`,
    {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    },
  );
  return parseResponse<GroupContinuity>(response);
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

export async function fetchFinancialOverview(
  options: { studentId?: string; cursor?: number } = {},
  signal?: AbortSignal,
): Promise<FinancialOverview> {
  const search = new URLSearchParams();
  if (options.studentId) search.set("studentId", options.studentId);
  if (options.cursor) search.set("cursor", String(options.cursor));
  const response = await fetch(`/api/finance?${search}`, {
    signal,
    cache: "no-store",
  });
  return parseResponse<FinancialOverview>(response);
}

export async function mutateFinancialOverview(
  action: FinanceAction,
): Promise<FinancialOverview> {
  const response = await fetch("/api/finance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
  return parseResponse<FinancialOverview>(response);
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
