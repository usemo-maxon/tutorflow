import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  GoogleApiError,
  type GoogleEventResource,
  googleApiRequest,
  googleEvent,
  googleEventStateHash,
  lessonIdFromGoogleEvent,
  normalizeGoogleEventTiming,
  safeGoogleError,
  validGoogleAccessToken,
} from "./google-calendar";
import { GOOGLE_EVENT_COLORS } from "./google-calendar-colors";
import { createSupabaseAdminClient } from "./supabase";

interface ConnectionRow {
  id: string;
  workspace_id: string;
  teacher_id: string;
  status: string;
  encrypted_credentials: string;
  selected_calendar_id: string;
  sync_token: string | null;
  watch_channel_id: string | null;
  watch_resource_id: string | null;
  watch_token_hash: string | null;
  watch_expires_at: string | null;
  sync_requested_at: string | null;
  last_successful_sync_at: string | null;
}

interface MappingRow {
  id: string;
  lesson_id: string;
  google_event_id: string;
  google_etag: string | null;
  google_updated_at: string | null;
  last_synced_hash: string | null;
  local_updated_at_at_sync: string | null;
}

interface LessonRow {
  id: string;
  title: string;
  color: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  format: "online" | "offline";
  location: string | null;
  meeting_url: string | null;
  status:
    "scheduled" | "needs_completion" | "completed" | "cancelled" | "no_show";
  recurrence_original_starts_at: string | null;
  updated_at: string;
  sync_status: string;
}

interface GoogleEventsPage {
  items?: GoogleEventResource[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

const reconnectMessage = "Google Calendar wymaga ponownego połączenia.";
const syncFailureMessage =
  "Lekcja została zapisana, ale nie udało się zsynchronizować jej z Google Calendar.";

export function googleEventIdForLesson(
  teacherId: string,
  lessonId: string,
): string {
  // Keep this identical to private.enqueue_lesson_side_effects in the database.
  return createHash("md5")
    .update(`${teacherId}:${lessonId}`)
    .digest("hex")
    .slice(0, 32);
}

export type LinkedChangeResolution = "noop" | "google_wins" | "local_wins";

export function resolveLinkedEventChange(input: {
  incomingHash: string;
  lastSyncedHash: string | null;
  localUpdatedAt: string;
  localUpdatedAtAtSync: string | null;
  googleUpdatedAt: string | null;
}): LinkedChangeResolution {
  if (input.incomingHash === input.lastSyncedHash) return "noop";
  const localChanged =
    !input.localUpdatedAtAtSync ||
    Date.parse(input.localUpdatedAt) > Date.parse(input.localUpdatedAtAtSync);
  if (!localChanged) return "google_wins";
  if (!input.googleUpdatedAt) return "local_wins";
  return Date.parse(input.localUpdatedAt) > Date.parse(input.googleUpdatedAt)
    ? "local_wins"
    : "google_wins";
}

function logSync(
  operation: string,
  connectionId: string,
  details: Record<string, unknown>,
) {
  console.info(
    JSON.stringify({
      scope: "google_calendar",
      operation,
      connectionId,
      ...details,
    }),
  );
}

function hashChannelToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function connectionById(connectionId: string): Promise<ConnectionRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("integration_connections")
    .select(
      "id,workspace_id,teacher_id,status,encrypted_credentials,selected_calendar_id,sync_token,watch_channel_id,watch_resource_id,watch_token_hash,watch_expires_at,sync_requested_at,last_successful_sync_at",
    )
    .eq("id", connectionId)
    .eq("provider", "google")
    .single();
  if (error || !data?.encrypted_credentials)
    throw new Error("GOOGLE_CONNECTION_NOT_FOUND");
  return data as ConnectionRow;
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new GoogleApiError(
      `GOOGLE_HTTP_${response.status}`,
      response.status,
      response.status === 429 || response.status >= 500,
      response.status === 401 || response.status === 403,
    );
  }
  return response.json() as Promise<T>;
}

async function listChanges(
  connection: ConnectionRow,
  token: string,
  forceFull: boolean,
): Promise<{
  events: GoogleEventResource[];
  syncToken: string;
  full: boolean;
}> {
  const events: GoogleEventResource[] = [];
  const full = forceFull || !connection.sync_token;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const query = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "2500",
    });
    if (!full && connection.sync_token)
      query.set("syncToken", connection.sync_token);
    if (full)
      query.set(
        "timeMin",
        new Date(Date.now() - 366 * 24 * 60 * 60_000).toISOString(),
      );
    if (pageToken) query.set("pageToken", pageToken);
    const response = await googleApiRequest(
      token,
      `/calendars/${encodeURIComponent(connection.selected_calendar_id)}/events?${query}`,
    );
    if (response.status === 410)
      throw new GoogleApiError("GOOGLE_SYNC_TOKEN_EXPIRED", 410, false);
    const page = await responseJson<GoogleEventsPage>(response);
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  if (!nextSyncToken) throw new Error("GOOGLE_NEXT_SYNC_TOKEN_MISSING");
  return { events, syncToken: nextSyncToken, full };
}

function eventOriginalStart(event: GoogleEventResource): string | null {
  return event.originalStartTime?.dateTime ?? null;
}

function externalEventRow(
  connection: ConnectionRow,
  event: GoogleEventResource,
  syncRunId: string,
) {
  const timing = normalizeGoogleEventTiming(event);
  const providerColor = event.colorId
    ? GOOGLE_EVENT_COLORS[event.colorId as keyof typeof GOOGLE_EVENT_COLORS]
    : null;
  return {
    connection_id: connection.id,
    workspace_id: connection.workspace_id,
    teacher_id: connection.teacher_id,
    calendar_id: connection.selected_calendar_id,
    google_event_id: event.id,
    summary: (event.summary ?? "Zajęty").slice(0, 500),
    starts_at: timing.startsAt,
    ends_at: timing.endsAt,
    start_date: timing.startDate,
    end_date: timing.endDate,
    timezone: timing.timezone,
    all_day: timing.allDay,
    status: event.status ?? "confirmed",
    transparency: event.transparency ?? "opaque",
    google_color_id: event.colorId ?? null,
    app_color: providerColor ?? null,
    google_etag: event.etag ?? null,
    google_updated_at: event.updated ?? null,
    recurring_event_id: event.recurringEventId ?? null,
    original_start_time: eventOriginalStart(event),
    last_seen_sync_id: syncRunId,
    updated_at: new Date().toISOString(),
  };
}

async function enqueueLessonSync(
  connection: ConnectionRow,
  lessonId: string,
  googleEventId: string,
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("google_sync_jobs").upsert(
    {
      workspace_id: connection.workspace_id,
      teacher_id: connection.teacher_id,
      lesson_id: lessonId,
      google_event_id: googleEventId,
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "teacher_id,lesson_id" },
  );
  if (error) throw error;
}

async function reconcileLinkedEvent(
  connection: ConnectionRow,
  event: GoogleEventResource,
  mapping: MappingRow | null,
  metadataLessonId: string | null,
) {
  const supabase = createSupabaseAdminClient();
  const lessonId = mapping?.lesson_id ?? metadataLessonId;
  if (!lessonId) return false;
  const { data: lessonData, error: lessonError } = await supabase
    .from("lessons")
    .select(
      "id,title,color,starts_at,ends_at,timezone,format,location,meeting_url,status,recurrence_original_starts_at,updated_at,sync_status",
    )
    .eq("workspace_id", connection.workspace_id)
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError) throw lessonError;
  if (!lessonData) return false;
  const lesson = lessonData as LessonRow;
  const incomingHash = googleEventStateHash(event);
  if (event.status === "cancelled") {
    if (lesson.status === "cancelled") {
      await supabase
        .from("google_event_mappings")
        .update({
          status: "retired",
          google_etag: event.etag ?? null,
          google_updated_at: event.updated ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("connection_id", connection.id)
        .eq("lesson_id", lesson.id);
      return true;
    }
    const replacementId = createHash("sha256")
      .update(
        `${connection.teacher_id}:${lesson.id}:restore:${event.updated ?? event.id}`,
      )
      .digest("hex")
      .slice(0, 32);
    await supabase
      .from("lessons")
      .update({
        sync_status: "pending",
        sync_message:
          "Wydarzenie usunięto w Google Calendar. Trwa bezpieczne odtwarzanie.",
      })
      .eq("workspace_id", connection.workspace_id)
      .eq("id", lesson.id);
    await supabase.from("google_event_mappings").upsert(
      {
        connection_id: connection.id,
        workspace_id: connection.workspace_id,
        teacher_id: connection.teacher_id,
        lesson_id: lesson.id,
        calendar_id: connection.selected_calendar_id,
        google_event_id: replacementId,
        status: "provider_deleted",
        google_etag: event.etag ?? null,
        google_updated_at: event.updated ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id,lesson_id" },
    );
    await enqueueLessonSync(connection, lesson.id, replacementId);
    return true;
  }
  if (!event.start?.dateTime || !event.end?.dateTime) return true;
  const resolution = resolveLinkedEventChange({
    incomingHash,
    lastSyncedHash: mapping?.last_synced_hash ?? null,
    localUpdatedAt: lesson.updated_at,
    localUpdatedAtAtSync: mapping?.local_updated_at_at_sync ?? null,
    googleUpdatedAt: event.updated ?? null,
  });
  if (resolution === "local_wins") {
    await enqueueLessonSync(connection, lesson.id, event.id);
    return true;
  }
  let syncedLocalUpdatedAt = lesson.updated_at;
  if (resolution === "google_wins") {
    const update = {
      starts_at: new Date(event.start.dateTime).toISOString(),
      ends_at: new Date(event.end.dateTime).toISOString(),
      timezone: event.start.timeZone ?? lesson.timezone,
      title: (event.summary ?? lesson.title).slice(0, 500),
      color: event.colorId
        ? (GOOGLE_EVENT_COLORS[
            event.colorId as keyof typeof GOOGLE_EVENT_COLORS
          ] ?? lesson.color)
        : lesson.color,
      sync_status: "synced",
      sync_message: null,
      updated_at: new Date().toISOString(),
    };
    const { data: updated, error: updateError } = await supabase
      .from("lessons")
      .update(update)
      .eq("workspace_id", connection.workspace_id)
      .eq("id", lesson.id)
      .select("updated_at")
      .single();
    if (updateError) throw updateError;
    syncedLocalUpdatedAt = updated.updated_at as string;
  }
  const { error: mappingError } = await supabase
    .from("google_event_mappings")
    .upsert(
      {
        connection_id: connection.id,
        workspace_id: connection.workspace_id,
        teacher_id: connection.teacher_id,
        lesson_id: lesson.id,
        calendar_id: connection.selected_calendar_id,
        google_event_id: event.id,
        google_etag: event.etag ?? null,
        google_updated_at: event.updated ?? null,
        recurring_event_id: event.recurringEventId ?? null,
        original_start_time: eventOriginalStart(event),
        last_synced_at: new Date().toISOString(),
        local_updated_at_at_sync: syncedLocalUpdatedAt,
        last_synced_hash: incomingHash,
        status: "synced",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id,lesson_id" },
    );
  if (mappingError) throw mappingError;
  return true;
}

async function reconcileGoogleEvent(
  connection: ConnectionRow,
  event: GoogleEventResource,
  syncRunId: string,
) {
  const supabase = createSupabaseAdminClient();
  const { data: mappingData, error: mappingError } = await supabase
    .from("google_event_mappings")
    .select(
      "id,lesson_id,google_event_id,google_etag,google_updated_at,last_synced_hash,local_updated_at_at_sync",
    )
    .eq("connection_id", connection.id)
    .eq("calendar_id", connection.selected_calendar_id)
    .eq("google_event_id", event.id)
    .maybeSingle();
  if (mappingError) throw mappingError;
  const mapping = (mappingData as MappingRow | null) ?? null;
  const metadataLessonId = lessonIdFromGoogleEvent(event);
  if (
    await reconcileLinkedEvent(connection, event, mapping, metadataLessonId)
  ) {
    await supabase
      .from("external_google_events")
      .delete()
      .eq("connection_id", connection.id)
      .eq("google_event_id", event.id);
    return "linked";
  }
  if (event.status === "cancelled") {
    const { error } = await supabase
      .from("external_google_events")
      .delete()
      .eq("connection_id", connection.id)
      .eq("calendar_id", connection.selected_calendar_id)
      .eq("google_event_id", event.id);
    if (error) throw error;
    return "deleted_external";
  }
  const { error } = await supabase
    .from("external_google_events")
    .upsert(externalEventRow(connection, event, syncRunId), {
      onConflict: "connection_id,calendar_id,google_event_id",
    });
  if (error) throw error;
  return "external";
}

async function markConnectionFailure(
  connectionId: string,
  error: unknown,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const reconnect = error instanceof GoogleApiError && error.reconnectRequired;
  const safeError = safeGoogleError(error);
  await supabase
    .from("integration_connections")
    .update({
      status: reconnect ? "reconnect_required" : "connected",
      sync_state: reconnect ? "reconnect_required" : "error",
      sync_requested_at: reconnect ? null : new Date().toISOString(),
      last_error: reconnect ? reconnectMessage : safeError,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
  if (reconnect) {
    const { data: connection } = await supabase
      .from("integration_connections")
      .select("workspace_id,teacher_id")
      .eq("id", connectionId)
      .single();
    if (connection)
      await supabase
        .from("lessons")
        .update({ sync_status: "failed", sync_message: reconnectMessage })
        .eq("workspace_id", connection.workspace_id)
        .eq("tutor_id", connection.teacher_id)
        .neq("sync_status", "disabled");
  }
}

export async function syncGoogleConnection(
  connectionId: string,
  forceFull = false,
): Promise<{ changed: number; full: boolean }> {
  const supabase = createSupabaseAdminClient();
  const attemptedAt = new Date().toISOString();
  await supabase
    .from("integration_connections")
    .update({
      sync_state: "syncing",
      last_attempted_sync_at: attemptedAt,
      sync_requested_at: null,
      updated_at: attemptedAt,
    })
    .eq("id", connectionId);
  try {
    const connection = await connectionById(connectionId);
    const { token } = await validGoogleAccessToken(
      connection.teacher_id,
      connection.encrypted_credentials,
    );
    let result;
    try {
      result = await listChanges(connection, token, forceFull);
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 410)
        throw error;
      await supabase
        .from("integration_connections")
        .update({ sync_token: null })
        .eq("id", connection.id);
      result = await listChanges(
        { ...connection, sync_token: null },
        token,
        true,
      );
    }
    const syncRunId = randomUUID();
    const counters: Record<string, number> = {};
    for (const event of result.events) {
      const kind = await reconcileGoogleEvent(connection, event, syncRunId);
      counters[kind] = (counters[kind] ?? 0) + 1;
    }
    if (result.full) {
      const { error: cleanupError } = await supabase
        .from("external_google_events")
        .delete()
        .eq("connection_id", connection.id)
        .neq("last_seen_sync_id", syncRunId);
      if (cleanupError) throw cleanupError;
    }
    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("integration_connections")
      .update({
        status: "connected",
        sync_state: "idle",
        sync_token: result.syncToken,
        last_successful_sync_at: completedAt,
        last_error: null,
        updated_at: completedAt,
      })
      .eq("id", connection.id);
    if (updateError) throw updateError;
    logSync("reconcile", connection.id, {
      calendarId: connection.selected_calendar_id,
      changed: result.events.length,
      full: result.full,
      counters,
      result: "success",
    });
    return { changed: result.events.length, full: result.full };
  } catch (error) {
    await markConnectionFailure(connectionId, error);
    logSync("reconcile", connectionId, {
      result: "error",
      error: safeGoogleError(error),
    });
    throw error;
  }
}

export async function registerGoogleWatch(connectionId: string): Promise<void> {
  const webhookUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error(
      JSON.stringify({
        scope: "google_calendar",
        operation: "watch_register",
        error: "missing_environment_variables",
        missing: ["GOOGLE_CALENDAR_WEBHOOK_URL"],
      }),
    );
    throw new Error("GOOGLE_CALENDAR_CONFIGURATION_MISSING");
  }
  const connection = await connectionById(connectionId);
  const { token } = await validGoogleAccessToken(
    connection.teacher_id,
    connection.encrypted_credentials,
  );
  const channelId = randomUUID();
  const channelToken = randomBytes(32).toString("base64url");
  const requestedExpiration = Date.now() + 6 * 24 * 60 * 60_000;
  const response = await googleApiRequest(
    token,
    `/calendars/${encodeURIComponent(connection.selected_calendar_id)}/events/watch`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: channelToken,
        expiration: String(requestedExpiration),
      }),
    },
  );
  const channel = await responseJson<{
    id: string;
    resourceId: string;
    expiration?: string;
  }>(response);
  const supabase = createSupabaseAdminClient();
  const oldChannel = connection.watch_channel_id;
  const oldResource = connection.watch_resource_id;
  const { error } = await supabase
    .from("integration_connections")
    .update({
      watch_channel_id: channel.id,
      watch_resource_id: channel.resourceId,
      watch_token_hash: hashChannelToken(channelToken),
      watch_expires_at: new Date(
        Number(channel.expiration ?? requestedExpiration),
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
  if (error) throw error;
  if (oldChannel && oldResource) {
    await googleApiRequest(token, "/channels/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: oldChannel, resourceId: oldResource }),
    }).catch(() => undefined);
  }
  logSync("watch_register", connection.id, {
    calendarId: connection.selected_calendar_id,
    result: "success",
  });
}

export async function initializeGoogleConnection(connectionId: string) {
  const watchPromise = registerGoogleWatch(connectionId);
  const sync = await Promise.resolve()
    .then(async () => {
      const result = await syncGoogleConnection(connectionId, true);
      const queued =
        await enqueueMissingGoogleLessonsForConnection(connectionId);
      const connection = await connectionById(connectionId);
      await processGoogleLessonJobs({
        teacherId: connection.teacher_id,
        limit: Math.max(20, queued),
      });
      return result;
    })
    .then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason }),
    );
  const watch = await watchPromise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );
  if (watch.status === "rejected") {
    const supabase = createSupabaseAdminClient();
    const watchError = safeGoogleError(watch.reason);
    await supabase
      .from("integration_connections")
      .update({
        sync_state: "error",
        sync_requested_at: new Date().toISOString(),
        last_error: watchError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("status", "connected");
    logSync("watch_register", connectionId, {
      result: "error",
      error: watchError,
    });
  }
  return {
    sync: sync.status,
    watch: watch.status,
  };
}

export async function requestGoogleSyncForTeacher(
  teacherId: string,
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const requestedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("integration_connections")
    .update({
      sync_requested_at: requestedAt,
      sync_state: "pending",
      updated_at: requestedAt,
    })
    .eq("teacher_id", teacherId)
    .eq("provider", "google")
    .eq("status", "connected")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("GOOGLE_NOT_CONNECTED");
  return data.id as string;
}

/**
 * Adds lessons that pre-date the Google connection to the outbound queue.
 * Existing mappings are deliberately left alone so reconnecting cannot create
 * duplicate provider events.
 */
export async function enqueueMissingGoogleLessonsForConnection(
  connectionId: string,
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const connection = await connectionById(connectionId);
  if (connection.status !== "connected")
    throw new Error("GOOGLE_NOT_CONNECTED");

  const [lessonResult, mappingResult] = await Promise.all([
    supabase
      .from("lessons")
      .select("id,status")
      .eq("workspace_id", connection.workspace_id)
      .eq("tutor_id", connection.teacher_id)
      .neq("status", "cancelled"),
    supabase
      .from("google_event_mappings")
      .select("lesson_id")
      .eq("connection_id", connection.id),
  ]);
  if (lessonResult.error) throw lessonResult.error;
  if (mappingResult.error) throw mappingResult.error;

  const mappedLessonIds = new Set(
    (mappingResult.data ?? []).map((mapping) => mapping.lesson_id as string),
  );
  const lessonIds = (lessonResult.data ?? [])
    .map((lesson) => lesson.id as string)
    .filter((lessonId) => !mappedLessonIds.has(lessonId));
  if (!lessonIds.length) return 0;

  const queuedAt = new Date().toISOString();
  const jobs = lessonIds.map((lessonId) => ({
    workspace_id: connection.workspace_id,
    teacher_id: connection.teacher_id,
    lesson_id: lessonId,
    google_event_id: googleEventIdForLesson(connection.teacher_id, lessonId),
    status: "pending",
    attempts: 0,
    next_attempt_at: queuedAt,
    last_error: null,
    locked_at: null,
    updated_at: queuedAt,
  }));
  const [lessonUpdate, jobUpsert] = await Promise.all([
    supabase
      .from("lessons")
      .update({
        sync_status: "pending",
        sync_message: null,
        updated_at: queuedAt,
      })
      .eq("workspace_id", connection.workspace_id)
      .in("id", lessonIds),
    supabase
      .from("google_sync_jobs")
      .upsert(jobs, { onConflict: "teacher_id,lesson_id" }),
  ]);
  if (lessonUpdate.error) throw lessonUpdate.error;
  if (jobUpsert.error) throw jobUpsert.error;
  return lessonIds.length;
}

export async function acceptGoogleWebhook(
  request: Request,
): Promise<string | null> {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceId = request.headers.get("x-goog-resource-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  if (!channelId || !resourceId || !channelToken) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("integration_connections")
    .select("id,watch_token_hash")
    .eq("provider", "google")
    .eq("watch_channel_id", channelId)
    .eq("watch_resource_id", resourceId)
    .eq("status", "connected")
    .maybeSingle();
  if (error || !data?.watch_token_hash) return null;
  if (!safeEqual(hashChannelToken(channelToken), data.watch_token_hash))
    return null;
  const requestedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("integration_connections")
    .update({
      sync_requested_at: requestedAt,
      sync_state: "pending",
      updated_at: requestedAt,
    })
    .eq("id", data.id)
    .eq("watch_channel_id", channelId);
  return updateError ? null : (data.id as string);
}

export async function maintainGoogleConnections(limit = 10) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("integration_connections")
    .select(
      "id,sync_state,sync_requested_at,last_attempted_sync_at,last_successful_sync_at,watch_expires_at,status",
    )
    .eq("provider", "google")
    .eq("status", "connected")
    .limit(50);
  if (error) throw error;
  const now = Date.now();
  const staleAt = now - 15 * 60_000;
  const watchDueAt = now + 24 * 60 * 60_000;
  const due = (data ?? [])
    .filter(
      (row) =>
        row.sync_requested_at ||
        (row.sync_state === "syncing" &&
          (!row.last_attempted_sync_at ||
            Date.parse(row.last_attempted_sync_at) < staleAt)) ||
        !row.last_successful_sync_at ||
        Date.parse(row.last_successful_sync_at) < staleAt ||
        !row.watch_expires_at ||
        Date.parse(row.watch_expires_at) < watchDueAt,
    )
    .slice(0, limit);
  let synced = 0;
  let watches = 0;
  let failed = 0;
  for (const row of due) {
    const shouldSync =
      row.sync_requested_at ||
      (row.sync_state === "syncing" &&
        (!row.last_attempted_sync_at ||
          Date.parse(row.last_attempted_sync_at) < staleAt)) ||
      !row.last_successful_sync_at ||
      Date.parse(row.last_successful_sync_at) < staleAt;
    const shouldRenewWatch =
      !row.watch_expires_at || Date.parse(row.watch_expires_at) < watchDueAt;
    if (shouldSync) {
      try {
        await syncGoogleConnection(row.id);
        await enqueueMissingGoogleLessonsForConnection(row.id);
        synced += 1;
      } catch {
        failed += 1;
      }
    }
    if (shouldRenewWatch) {
      try {
        await registerGoogleWatch(row.id);
        watches += 1;
      } catch (watchError) {
        failed += 1;
        logSync("watch_renew", row.id, {
          result: "error",
          error: safeGoogleError(watchError),
        });
      }
    }
  }
  return { inspected: due.length, synced, watches, failed };
}

export async function processGoogleLessonJobs(
  options: { teacherId?: string; limit?: number } = {},
) {
  const supabase = createSupabaseAdminClient();
  const staleLockCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  let staleQuery = supabase
    .from("google_sync_jobs")
    .update({
      status: "failed",
      locked_at: null,
      next_attempt_at: new Date().toISOString(),
      last_error: "STALE_PROCESSING_LOCK_RECOVERED",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("locked_at", staleLockCutoff)
    .select("id");
  if (options.teacherId)
    staleQuery = staleQuery.eq("teacher_id", options.teacherId);
  const { data: recoveredJobs, error: recoveryError } = await staleQuery;
  if (recoveryError) throw recoveryError;

  let query = supabase
    .from("google_sync_jobs")
    .select("id,workspace_id,teacher_id,lesson_id,google_event_id,attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", 8)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(options.limit ?? 20);
  if (options.teacherId) query = query.eq("teacher_id", options.teacherId);
  const { data: jobs, error } = await query;
  if (error) throw error;
  const results = [];
  for (const job of jobs ?? []) results.push(await processGoogleLessonJob(job));
  return {
    recovered: recoveredJobs?.length ?? 0,
    processed: results.length,
    succeeded: results.filter((result) => result === "succeeded").length,
    retried: (jobs ?? []).filter((job) => job.attempts > 0).length,
    skipped: results.filter((result) => result === "skipped").length,
    failed: results.filter((result) => result === "failed").length,
  };
}

export async function processGoogleLessonJob(job: {
  id: string;
  workspace_id: string;
  teacher_id: string;
  lesson_id: string;
  google_event_id: string;
  attempts: number;
}): Promise<"succeeded" | "skipped" | "failed"> {
  const supabase = createSupabaseAdminClient();
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("google_sync_jobs")
    .update({
      status: "processing",
      locked_at: claimedAt,
      attempts: job.attempts + 1,
    })
    .eq("id", job.id)
    .in("status", ["pending", "failed"])
    .select("id");
  if (!claimed?.length) return "skipped";
  try {
    const [{ data: connectionData }, { data: lessonData }] = await Promise.all([
      supabase
        .from("integration_connections")
        .select(
          "id,workspace_id,teacher_id,status,encrypted_credentials,selected_calendar_id,sync_token,watch_channel_id,watch_resource_id,watch_token_hash,watch_expires_at,sync_requested_at,last_successful_sync_at",
        )
        .eq("teacher_id", job.teacher_id)
        .eq("provider", "google")
        .single(),
      supabase
        .from("lessons")
        .select(
          "id,title,color,starts_at,ends_at,timezone,format,location,meeting_url,status,recurrence_original_starts_at,updated_at,sync_status",
        )
        .eq("workspace_id", job.workspace_id)
        .eq("id", job.lesson_id)
        .single(),
    ]);
    if (
      connectionData?.status === "reconnect_required" ||
      connectionData?.status === "error"
    )
      throw new GoogleApiError(
        "GOOGLE_REFRESH_TOKEN_INVALID",
        401,
        false,
        true,
      );
    if (
      connectionData?.status !== "connected" ||
      !connectionData.encrypted_credentials ||
      !lessonData
    )
      throw new Error("GOOGLE_NOT_CONNECTED");
    const connection = connectionData as ConnectionRow;
    const lesson = lessonData as LessonRow;
    if (lesson.sync_status === "disabled")
      throw new Error("LESSON_NOT_SYNCABLE");
    const [{ data: participantRows }, { data: mappingData }] =
      await Promise.all([
        supabase
          .from("lesson_participants")
          .select("student_id")
          .eq("workspace_id", job.workspace_id)
          .eq("lesson_id", job.lesson_id),
        supabase
          .from("google_event_mappings")
          .select(
            "id,lesson_id,google_event_id,google_etag,google_updated_at,last_synced_hash,local_updated_at_at_sync",
          )
          .eq("connection_id", connection.id)
          .eq("lesson_id", lesson.id)
          .maybeSingle(),
      ]);
    const studentIds = (participantRows ?? []).map((row) => row.student_id);
    const { data: studentRows } = studentIds.length
      ? await supabase
          .from("students")
          .select("id,display_name")
          .eq("workspace_id", job.workspace_id)
          .in("id", studentIds)
      : { data: [] };
    const names = studentIds
      .map(
        (id) => studentRows?.find((student) => student.id === id)?.display_name,
      )
      .filter((name): name is string => Boolean(name));
    const eventId =
      (mappingData as MappingRow | null)?.google_event_id ??
      job.google_event_id;
    const eventBody = googleEvent(
      {
        id: lesson.id,
        workspaceId: connection.workspace_id,
        color: lesson.color,
        startsAt: lesson.starts_at,
        durationMinutes: Math.round(
          (Date.parse(lesson.ends_at) - Date.parse(lesson.starts_at)) / 60_000,
        ),
        location:
          lesson.format === "online"
            ? (lesson.meeting_url ?? "")
            : (lesson.location ?? ""),
        timezone: lesson.timezone,
        recurrenceOriginalStartsAt:
          lesson.recurrence_original_starts_at ?? undefined,
        status: lesson.status,
        topic: lesson.title,
      },
      names,
    );
    const { token } = await validGoogleAccessToken(
      connection.teacher_id,
      connection.encrypted_credentials,
    );
    const eventPath = `/calendars/${encodeURIComponent(connection.selected_calendar_id)}/events/${encodeURIComponent(eventId)}`;
    let response: Response;
    if (lesson.status === "cancelled") {
      response = await googleApiRequest(token, eventPath, { method: "DELETE" });
      if (response.status === 404 || response.status === 410)
        response = new Response(null, { status: 204 });
      if (!response.ok) await responseJson(response);
      await supabase
        .from("google_event_mappings")
        .update({
          status: "retired",
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("connection_id", connection.id)
        .eq("lesson_id", lesson.id);
    } else {
      response = await googleApiRequest(token, eventPath, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...((mappingData as MappingRow | null)?.google_etag
            ? { "if-match": (mappingData as MappingRow).google_etag! }
            : {}),
        },
        body: JSON.stringify(eventBody),
      });
      if (response.status === 404 || response.status === 410) {
        response = await googleApiRequest(
          token,
          `/calendars/${encodeURIComponent(connection.selected_calendar_id)}/events`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: eventId, ...eventBody }),
          },
        );
      }
      if (response.status === 412) {
        await syncGoogleConnection(connection.id);
        const { data: refreshedLesson } = await supabase
          .from("lessons")
          .select("sync_status")
          .eq("workspace_id", job.workspace_id)
          .eq("id", job.lesson_id)
          .single();
        if (refreshedLesson?.sync_status === "synced") {
          await supabase
            .from("google_sync_jobs")
            .update({
              status: "succeeded",
              last_error: null,
              locked_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          return "succeeded";
        }
        throw new GoogleApiError("GOOGLE_ETAG_CONFLICT", 412, true);
      }
      if (!response.ok && response.status !== 409) await responseJson(response);
      let providerEvent: GoogleEventResource;
      if (response.status === 409) {
        providerEvent = await responseJson<GoogleEventResource>(
          await googleApiRequest(token, eventPath),
        );
      } else {
        providerEvent = await responseJson<GoogleEventResource>(response);
      }
      const { error: mappingError } = await supabase
        .from("google_event_mappings")
        .upsert(
          {
            connection_id: connection.id,
            workspace_id: connection.workspace_id,
            teacher_id: connection.teacher_id,
            lesson_id: lesson.id,
            calendar_id: connection.selected_calendar_id,
            google_event_id: providerEvent.id || eventId,
            google_etag: providerEvent.etag ?? null,
            google_updated_at: providerEvent.updated ?? null,
            recurring_event_id: providerEvent.recurringEventId ?? null,
            original_start_time: eventOriginalStart(providerEvent),
            last_synced_at: new Date().toISOString(),
            local_updated_at_at_sync: lesson.updated_at,
            last_synced_hash: googleEventStateHash(providerEvent),
            status: "synced",
            last_error: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "connection_id,lesson_id" },
        );
      if (mappingError) throw mappingError;
    }
    await Promise.all([
      supabase
        .from("lessons")
        .update({
          sync_status: "synced",
          sync_message: null,
        })
        .eq("workspace_id", job.workspace_id)
        .eq("id", job.lesson_id),
      supabase
        .from("google_sync_jobs")
        .update({
          google_event_id: eventId,
          status: "succeeded",
          last_error: null,
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id),
    ]);
    logSync("lesson_outbound", connection.id, {
      calendarId: connection.selected_calendar_id,
      lessonId: lesson.id,
      result: "success",
    });
    return "succeeded";
  } catch (error) {
    const attempts = job.attempts + 1;
    const safeError = safeGoogleError(error);
    const reconnect =
      error instanceof GoogleApiError && error.reconnectRequired;
    await Promise.all([
      supabase
        .from("google_sync_jobs")
        .update({
          status: "failed",
          last_error: safeError,
          locked_at: null,
          next_attempt_at: new Date(
            Date.now() + Math.min(3600, 2 ** attempts * 60) * 1000,
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id),
      supabase
        .from("lessons")
        .update({
          sync_status: "failed",
          sync_message: reconnect ? reconnectMessage : syncFailureMessage,
        })
        .eq("workspace_id", job.workspace_id)
        .eq("id", job.lesson_id),
    ]);
    if (reconnect) {
      const { data: connection } = await supabase
        .from("integration_connections")
        .select("id")
        .eq("teacher_id", job.teacher_id)
        .eq("provider", "google")
        .maybeSingle();
      if (connection) await markConnectionFailure(connection.id, error);
    }
    return "failed";
  }
}
