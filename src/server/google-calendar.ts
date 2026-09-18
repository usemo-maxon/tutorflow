import "server-only";

import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";
import { createSupabaseAdminClient } from "./supabase";
import { nearestGoogleEventColorId } from "./google-calendar-colors";

export interface GoogleCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  calendarId: string;
}

export interface GoogleEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEventResource {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  transparency?: "opaque" | "transparent";
  etag?: string;
  updated?: string;
  recurringEventId?: string;
  originalStartTime?: GoogleEventTime;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  extendedProperties?: { private?: Record<string, string> };
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly reconnectRequired = false,
  ) {
    super(message);
  }
}

const tokenUrl = "https://oauth2.googleapis.com/token";
const calendarApi = "https://www.googleapis.com/calendar/v3";

function googleCalendarOAuthCredentials() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const missing = [
    !clientId ? "GOOGLE_CALENDAR_CLIENT_ID" : null,
    !clientSecret ? "GOOGLE_CALENDAR_CLIENT_SECRET" : null,
  ].filter((name): name is string => Boolean(name));
  if (missing.length) {
    console.error(
      JSON.stringify({
        scope: "google_calendar",
        operation: "oauth_credentials",
        error: "missing_environment_variables",
        missing,
      }),
    );
    throw new Error("GOOGLE_CALENDAR_CONFIGURATION_MISSING");
  }
  return { clientId: clientId!, clientSecret: clientSecret! };
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = googleCalendarOAuthCredentials();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function validGoogleAccessToken(
  teacherId: string,
  encrypted: string,
) {
  const credentials = decryptSecret<GoogleCredentials>(encrypted);
  if (credentials.expiresAt > Date.now() + 60_000)
    return { token: credentials.accessToken, credentials };
  const { clientId, clientSecret } = googleCalendarOAuthCredentials();
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: credentials.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    throw new GoogleApiError("GOOGLE_TOKEN_REFRESH_UNAVAILABLE", 503, true);
  }
  if (!response.ok) {
    const reconnectRequired =
      response.status === 400 || response.status === 401;
    throw new GoogleApiError(
      reconnectRequired
        ? "GOOGLE_REFRESH_TOKEN_INVALID"
        : "GOOGLE_TOKEN_REFRESH_FAILED",
      response.status,
      response.status === 429 || response.status >= 500,
      reconnectRequired,
    );
  }
  const refreshed = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  credentials.accessToken = refreshed.access_token;
  credentials.expiresAt = Date.now() + refreshed.expires_in * 1000;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("integration_connections")
    .update({
      encrypted_credentials: encryptSecret(credentials),
      updated_at: new Date().toISOString(),
    })
    .eq("teacher_id", teacherId)
    .eq("provider", "google");
  if (error) throw error;
  return { token: credentials.accessToken, credentials };
}

export function isRetryableGoogleStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

export async function googleApiRequest(
  token: string,
  path: string,
  init: RequestInit = {},
  options: {
    attempts?: number;
    fetcher?: typeof fetch;
    wait?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const attempts = options.attempts ?? 3;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(
        path.startsWith("https://") ? path : `${calendarApi}${path}`,
        {
          ...init,
          headers: {
            authorization: `Bearer ${token}`,
            ...init.headers,
          },
        },
      );
      if (!isRetryableGoogleStatus(response.status) || attempt === attempts - 1)
        return response;
    } catch {
      if (attempt === attempts - 1)
        throw new GoogleApiError("GOOGLE_NETWORK_ERROR", 503, true);
    }
    await wait(250 * 2 ** attempt);
  }
  throw new GoogleApiError("GOOGLE_REQUEST_FAILED", 503, true);
}

interface CalendarLesson {
  id: string;
  workspaceId?: string;
  color: string;
  startsAt: string;
  durationMinutes: number;
  location: string;
  timezone?: string;
  recurrenceOriginalStartsAt?: string;
  status:
    "scheduled" | "needs_completion" | "completed" | "cancelled" | "no_show";
  topic: string;
}

export function googleEvent(lesson: CalendarLesson, studentNames: string[]) {
  const end = new Date(
    new Date(lesson.startsAt).getTime() + lesson.durationMinutes * 60_000,
  ).toISOString();
  const privateProperties: Record<string, string> = {
    easy4tutor: "true",
    easy4tutorLessonId: lesson.id,
    // Retained while provider events created by earlier releases still exist.
    tutorflowLessonId: lesson.id,
  };
  if (lesson.workspaceId)
    privateProperties.easy4tutorWorkspaceId = lesson.workspaceId;
  if (lesson.recurrenceOriginalStartsAt)
    privateProperties.easy4tutorOccurrenceStart =
      lesson.recurrenceOriginalStartsAt;
  return {
    summary:
      lesson.topic.trim() ||
      (studentNames.length
        ? `Lekcja: ${studentNames.join(", ")}`
        : "Lekcja easy4tutor"),
    description: "Lekcja zaplanowana w easy4tutor",
    start: { dateTime: lesson.startsAt, timeZone: lesson.timezone },
    end: { dateTime: end, timeZone: lesson.timezone },
    location: lesson.location || undefined,
    colorId: nearestGoogleEventColorId(lesson.color),
    status: lesson.status === "cancelled" ? "cancelled" : "confirmed",
    extendedProperties: { private: privateProperties },
  };
}

function normalizedEventState(event: Partial<GoogleEventResource>) {
  return {
    status: event.status ?? "confirmed",
    summary: event.summary ?? "",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    timezone: event.start?.timeZone ?? event.end?.timeZone ?? "",
    colorId: event.colorId ?? "",
    transparency: event.transparency ?? "opaque",
  };
}

export function googleEventStateHash(
  event: Partial<GoogleEventResource>,
): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizedEventState(event)))
    .digest("hex");
}

export function lessonIdFromGoogleEvent(
  event: Partial<GoogleEventResource>,
): string | null {
  const metadata = event.extendedProperties?.private;
  return metadata?.easy4tutorLessonId ?? metadata?.tutorflowLessonId ?? null;
}

export function normalizeGoogleEventTiming(event: GoogleEventResource) {
  const allDay = Boolean(event.start?.date);
  if (allDay && event.start?.date && event.end?.date) {
    return {
      allDay: true as const,
      startsAt: null,
      endsAt: null,
      startDate: event.start.date,
      endDate: event.end.date,
      timezone: event.start.timeZone ?? event.end.timeZone ?? null,
    };
  }
  if (event.start?.dateTime && event.end?.dateTime) {
    return {
      allDay: false as const,
      startsAt: new Date(event.start.dateTime).toISOString(),
      endsAt: new Date(event.end.dateTime).toISOString(),
      startDate: null,
      endDate: null,
      timezone: event.start.timeZone ?? event.end.timeZone ?? null,
    };
  }
  throw new Error("GOOGLE_EVENT_TIME_MISSING");
}

export function safeGoogleError(error: unknown): string {
  if (error instanceof GoogleApiError) return error.message;
  if (error instanceof Error) return error.message.slice(0, 120);
  return "GOOGLE_UNKNOWN_ERROR";
}
