import "server-only";

import { decryptSecret, encryptSecret } from "./crypto";
import { createSupabaseAdminClient } from "./supabase";

export interface GoogleCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  calendarId: string;
}

const tokenUrl = "https://oauth2.googleapis.com/token";

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
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
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: credentials.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("GOOGLE_TOKEN_REFRESH_FAILED");
  const refreshed = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  credentials.accessToken = refreshed.access_token;
  credentials.expiresAt = Date.now() + refreshed.expires_in * 1000;
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("integration_connections")
    .update({
      encrypted_credentials: encryptSecret(credentials),
      updated_at: new Date().toISOString(),
    })
    .eq("teacher_id", teacherId)
    .eq("provider", "google");
  return { token: credentials.accessToken, credentials };
}

interface CalendarLesson {
  id: string;
  startsAt: string;
  durationMinutes: number;
  location: string;
  status:
    "scheduled" | "needs_completion" | "completed" | "cancelled" | "no_show";
  topic: string;
}

export function googleEvent(lesson: CalendarLesson, studentNames: string[]) {
  const end = new Date(
    new Date(lesson.startsAt).getTime() + lesson.durationMinutes * 60_000,
  ).toISOString();
  return {
    summary: studentNames.length
      ? `Lekcja: ${studentNames.join(", ")}`
      : "Lekcja easy4tutor",
    description: lesson.topic || "Lekcja zaplanowana w easy4tutor",
    start: { dateTime: lesson.startsAt },
    end: { dateTime: end },
    location: lesson.location || undefined,
    status: lesson.status === "cancelled" ? "cancelled" : "confirmed",
    extendedProperties: { private: { tutorflowLessonId: lesson.id } },
  };
}
