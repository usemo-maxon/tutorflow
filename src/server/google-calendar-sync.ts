import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  GoogleApiError,
  GoogleEventTimingError,
  type GoogleCalendarListResource,
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
import { entitledTeacherIds } from "./entitlements";
import {
  applyOwnerLifetimeAccess,
  ownerLifetimeUserIds,
} from "./access-grants";
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

interface GoogleCalendarRow {
  id: string;
  connection_id: string;
  calendar_id: string;
  sync_token: string | null;
  watch_channel_id: string | null;
  watch_resource_id: string | null;
  watch_token_hash: string | null;
  watch_expires_at: string | null;
  sync_enabled: boolean;
  is_primary: boolean;
  sync_state?: string;
  last_successful_sync_at?: string | null;
  processed_event_count?: number;
  recoverable_failure?: boolean;
  sync_mode?: "full" | "incremental" | null;
  sync_page_token?: string | null;
  sync_run_id?: string | null;
  sync_force_full?: boolean;
  lease_token?: string | null;
  lease_expires_at?: string | null;
}

const reconnectMessage = "Google Calendar wymaga ponownego połączenia.";
const syncFailureMessage =
  "Lekcja została zapisana, ale nie udało się zsynchronizować jej z Google Calendar.";
export const GOOGLE_OUTBOUND_BATCH_LIMIT = 20;
export const GOOGLE_WEBHOOK_REPAIR_BATCH_LIMIT = 10;
export const GOOGLE_IMPORT_PAGE_SIZE = 100;
export const GOOGLE_IMPORT_CONCURRENCY = 8;
export const GOOGLE_SYNC_BUDGET_MS = 42_000;
export const GOOGLE_SYNC_LEASE_MS = 2 * 60_000;
export const GOOGLE_WATCH_RENEWAL_WINDOW_MS = 48 * 60 * 60_000;
const GOOGLE_MAINTENANCE_SCAN_LIMIT = 200;

export function googleCalendarProviderId(
  calendar: Pick<GoogleCalendarListResource, "id" | "primary">,
): string {
  return calendar.primary ? "primary" : calendar.id;
}

export function shouldRenewGoogleWatch(
  expiresAt: string | null,
  now = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const expiration = Date.parse(expiresAt);
  return (
    !Number.isFinite(expiration) ||
    expiration <= now + GOOGLE_WATCH_RENEWAL_WINDOW_MS
  );
}

interface MaintenanceCandidate {
  id: string;
  teacher_id: string;
  sync_state: string;
  sync_requested_at: string | null;
  last_attempted_sync_at: string | null;
  last_successful_sync_at: string | null;
  watch_expires_at: string | null;
  status: string;
}

export function prioritizeGoogleMaintenanceCandidates(
  rows: MaintenanceCandidate[],
  now = Date.now(),
): MaintenanceCandidate[] {
  const staleAt = now - 15 * 60_000;
  const priority = (row: MaintenanceCandidate) => {
    if (shouldRenewGoogleWatch(row.watch_expires_at, now)) return 0;
    if (row.sync_requested_at) return 1;
    if (
      row.sync_state === "syncing" &&
      (!row.last_attempted_sync_at ||
        Date.parse(row.last_attempted_sync_at) < staleAt)
    )
      return 2;
    return 3;
  };
  return rows
    .filter(
      (row) =>
        shouldRenewGoogleWatch(row.watch_expires_at, now) ||
        row.sync_requested_at ||
        (row.sync_state === "syncing" &&
          (!row.last_attempted_sync_at ||
            Date.parse(row.last_attempted_sync_at) < staleAt)) ||
        !row.last_successful_sync_at ||
        Date.parse(row.last_successful_sync_at) < staleAt,
    )
    .toSorted((left, right) => {
      const difference = priority(left) - priority(right);
      if (difference) return difference;
      const leftTime = Date.parse(
        left.sync_requested_at ??
          left.last_attempted_sync_at ??
          left.last_successful_sync_at ??
          "1970-01-01T00:00:00.000Z",
      );
      const rightTime = Date.parse(
        right.sync_requested_at ??
          right.last_attempted_sync_at ??
          right.last_successful_sync_at ??
          "1970-01-01T00:00:00.000Z",
      );
      return leftTime - rightTime || left.id.localeCompare(right.id);
    });
}

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

export function googleReplacementEventId(
  teacherId: string,
  lessonId: string,
  providerDeletionIdentity: string,
): string {
  return createHash("sha256")
    .update(`${teacherId}:${lessonId}:restore:${providerDeletionIdentity}`)
    .digest("hex")
    .slice(0, 32);
}

export function shouldRecreateDeletedProviderEvent(
  lessonStatus: LessonRow["status"],
): boolean {
  return lessonStatus !== "cancelled";
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

function safeSqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error))
    return undefined;
  const code = String(error.code);
  return /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

export async function reconcileGoogleEventBatch<T>(
  events: GoogleEventResource[],
  reconcile: (event: GoogleEventResource) => Promise<T>,
  onInvalid: (
    event: GoogleEventResource,
    error: GoogleEventTimingError,
  ) => void,
): Promise<{ results: T[]; invalid: number }> {
  const ordered: Array<T | undefined> = new Array(events.length);
  let invalid = 0;
  let next = 0;
  async function worker() {
    while (next < events.length) {
      const index = next++;
      const event = events[index];
      try {
        ordered[index] = await reconcile(event);
      } catch (error) {
        if (!(error instanceof GoogleEventTimingError)) throw error;
        invalid += 1;
        onInvalid(event, error);
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(GOOGLE_IMPORT_CONCURRENCY, events.length) },
      () => worker(),
    ),
  );
  return {
    results: ordered.filter((value): value is T => value !== undefined),
    invalid,
  };
}

export function shouldCleanupGoogleEventCache(
  fullSync: boolean,
  invalidEventCount: number,
): boolean {
  return fullSync && invalidEventCount === 0;
}

function hashChannelToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function googleWebhookHeaders(request: Request): {
  channelId: string;
  resourceId: string;
  channelToken: string;
} | null {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceId = request.headers.get("x-goog-resource-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  return channelId && resourceId && channelToken
    ? { channelId, resourceId, channelToken }
    : null;
}

export function isValidGoogleChannelToken(
  channelToken: string,
  expectedHash: string,
): boolean {
  return safeEqual(hashChannelToken(channelToken), expectedHash);
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

async function listChangesPage(
  connection: ConnectionRow,
  calendar: GoogleCalendarRow,
  token: string,
  forceFull: boolean,
): Promise<{
  events: GoogleEventResource[];
  nextPageToken: string | null;
  syncToken: string | null;
  full: boolean;
}> {
  const full = calendar.sync_mode
    ? calendar.sync_mode === "full"
    : forceFull || !calendar.sync_token;
  const query = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "true",
    maxResults: String(GOOGLE_IMPORT_PAGE_SIZE),
  });
  if (!full && calendar.sync_token) query.set("syncToken", calendar.sync_token);
  if (calendar.sync_page_token)
    query.set("pageToken", calendar.sync_page_token);
  const response = await googleApiRequest(
    token,
    `/calendars/${encodeURIComponent(calendar.calendar_id)}/events?${query}`,
  );
  if (response.status === 410)
    throw new GoogleApiError("GOOGLE_SYNC_TOKEN_EXPIRED", 410, false);
  const page = await responseJson<GoogleEventsPage>(response);
  if (!page.nextPageToken && !page.nextSyncToken)
    throw new Error("GOOGLE_NEXT_SYNC_TOKEN_MISSING");
  return {
    events: page.items ?? [],
    nextPageToken: page.nextPageToken ?? null,
    syncToken: page.nextSyncToken ?? null,
    full,
  };
}

export async function collectGoogleEventPages(
  fetchPage: (pageToken?: string) => Promise<GoogleEventsPage>,
  full: boolean,
): Promise<{
  events: GoogleEventResource[];
  syncToken: string;
  full: boolean;
}> {
  const events: GoogleEventResource[] = [];
  let pageToken: string | undefined;
  let finalSyncToken: string | undefined;
  do {
    const page = await fetchPage(pageToken);
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    if (!pageToken) finalSyncToken = page.nextSyncToken;
  } while (pageToken);
  if (!finalSyncToken) throw new Error("GOOGLE_NEXT_SYNC_TOKEN_MISSING");
  return { events, syncToken: finalSyncToken, full };
}

async function listGoogleRangePage(
  calendarId: string,
  token: string,
  rangeStart: string,
  rangeEnd: string,
  pageToken?: string | null,
): Promise<GoogleEventsPage> {
  const query = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "true",
    maxResults: String(GOOGLE_IMPORT_PAGE_SIZE),
    timeMin: rangeStart,
    timeMax: rangeEnd,
  });
  if (pageToken) query.set("pageToken", pageToken);
  return responseJson<GoogleEventsPage>(
    await googleApiRequest(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
    ),
  );
}

export async function recoverInvalidGoogleSyncToken<T>(
  incremental: () => Promise<T>,
  clearInvalidToken: () => Promise<void>,
  fullSync: () => Promise<T>,
): Promise<T> {
  try {
    return await incremental();
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 410) throw error;
    await clearInvalidToken();
    return fullSync();
  }
}

export function googleWatchExpiration(
  providerExpiration: string | undefined,
  requestedExpiration: number,
): string {
  const milliseconds = Number(providerExpiration ?? requestedExpiration);
  if (!Number.isFinite(milliseconds))
    throw new Error("GOOGLE_WATCH_EXPIRATION_INVALID");
  return new Date(milliseconds).toISOString();
}

export async function replaceGoogleWatchSafely(
  persistReplacement: () => Promise<void>,
  stopPrevious: () => Promise<void>,
): Promise<void> {
  await persistReplacement();
  await stopPrevious().catch(() => undefined);
}

function eventOriginalStart(event: GoogleEventResource): string | null {
  return event.originalStartTime?.dateTime ?? null;
}

function externalEventRow(
  connection: ConnectionRow,
  calendarId: string,
  event: GoogleEventResource,
  syncRunId: string,
  markSeen = true,
) {
  const timing = normalizeGoogleEventTiming(event);
  const providerColor = event.colorId
    ? GOOGLE_EVENT_COLORS[event.colorId as keyof typeof GOOGLE_EVENT_COLORS]
    : null;
  return {
    connection_id: connection.id,
    workspace_id: connection.workspace_id,
    teacher_id: connection.teacher_id,
    calendar_id: calendarId,
    google_event_id: event.id,
    summary: (event.summary ?? "Zajęty").slice(0, 500),
    description: event.description?.slice(0, 10_000) ?? null,
    location: event.location?.slice(0, 2_000) ?? null,
    html_link: event.htmlLink ?? null,
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
    ...(markSeen ? { last_seen_sync_id: syncRunId } : {}),
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
    if (!shouldRecreateDeletedProviderEvent(lesson.status)) {
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
    const replacementId = googleReplacementEventId(
      connection.teacher_id,
      lesson.id,
      event.updated ?? event.id,
    );
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
  known?: { mapping: MappingRow | null },
) {
  const supabase = createSupabaseAdminClient();
  let mapping = known?.mapping;
  if (mapping === undefined) {
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
    mapping = (mappingData as MappingRow | null) ?? null;
  }
  const metadataLessonId = lessonIdFromGoogleEvent(event);
  if (
    await reconcileLinkedEvent(connection, event, mapping, metadataLessonId)
  ) {
    await supabase
      .from("external_google_events")
      .delete()
      .eq("connection_id", connection.id)
      .eq("calendar_id", connection.selected_calendar_id)
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
    .upsert(
      externalEventRow(
        connection,
        connection.selected_calendar_id,
        event,
        syncRunId,
      ),
      {
        onConflict: "connection_id,calendar_id,google_event_id",
      },
    );
  if (error) throw error;
  return "external";
}

async function reconcileGoogleEventPage(
  connection: ConnectionRow,
  events: GoogleEventResource[],
  syncRunId: string,
  onInvalid: (
    event: GoogleEventResource,
    error: GoogleEventTimingError,
  ) => void,
  markSeen = true,
): Promise<{ results: string[]; invalid: number }> {
  if (!events.length) return { results: [], invalid: 0 };
  const supabase = createSupabaseAdminClient();
  const { data: mappingsData, error: mappingsError } = await supabase
    .from("google_event_mappings")
    .select(
      "id,lesson_id,google_event_id,google_etag,google_updated_at,last_synced_hash,local_updated_at_at_sync",
    )
    .eq("connection_id", connection.id)
    .eq("calendar_id", connection.selected_calendar_id)
    .in(
      "google_event_id",
      events.map((event) => event.id),
    );
  if (mappingsError) throw mappingsError;
  const mappings = new Map(
    ((mappingsData ?? []) as MappingRow[]).map((mapping) => [
      mapping.google_event_id,
      mapping,
    ]),
  );
  const linked: GoogleEventResource[] = [];
  const cancelledIds: string[] = [];
  const externalRows: ReturnType<typeof externalEventRow>[] = [];
  let invalid = 0;
  for (const event of events) {
    if (mappings.has(event.id) || lessonIdFromGoogleEvent(event)) {
      linked.push(event);
      continue;
    }
    if (event.status === "cancelled") {
      cancelledIds.push(event.id);
      continue;
    }
    try {
      externalRows.push(
        externalEventRow(
          connection,
          connection.selected_calendar_id,
          event,
          syncRunId,
          markSeen,
        ),
      );
    } catch (error) {
      if (!(error instanceof GoogleEventTimingError)) throw error;
      invalid += 1;
      onInvalid(event, error);
    }
  }
  if (externalRows.length) {
    const { error } = await supabase
      .from("external_google_events")
      .upsert(externalRows, {
        onConflict: "connection_id,calendar_id,google_event_id",
      });
    if (error) throw error;
  }
  if (cancelledIds.length) {
    const { error } = await supabase
      .from("external_google_events")
      .delete()
      .eq("connection_id", connection.id)
      .eq("calendar_id", connection.selected_calendar_id)
      .in("google_event_id", cancelledIds);
    if (error) throw error;
  }
  const linkedBatch = await reconcileGoogleEventBatch(
    linked,
    (event) =>
      reconcileGoogleEvent(connection, event, syncRunId, {
        mapping: mappings.get(event.id) ?? null,
      }),
    onInvalid,
  );
  return {
    results: [
      ...externalRows.map(() => "external"),
      ...cancelledIds.map(() => "deleted_external"),
      ...linkedBatch.results,
    ],
    invalid: invalid + linkedBatch.invalid,
  };
}

async function markConnectionFailure(
  connectionId: string,
  error: unknown,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const reconnect = error instanceof GoogleApiError && error.reconnectRequired;
  const safeError = safeGoogleError(error);
  logSync("connection_failure", connectionId, {
    result: "error",
    error: safeError,
    sqlState: safeSqlState(error),
  });
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

async function refreshGoogleCalendarList(
  connection: ConnectionRow,
  token: string,
): Promise<GoogleCalendarRow[]> {
  const supabase = createSupabaseAdminClient();
  let pageToken: string | undefined;
  const calendars: GoogleCalendarListResource[] = [];
  do {
    const query = new URLSearchParams({
      maxResults: "250",
      showHidden: "true",
      showDeleted: "false",
      colorRgbFormat: "true",
    });
    if (pageToken) query.set("pageToken", pageToken);
    let page: {
      items?: GoogleCalendarListResource[];
      nextPageToken?: string;
    };
    try {
      page = await responseJson(
        await googleApiRequest(token, `/users/me/calendarList?${query}`),
      );
    } catch (error) {
      // Connections authorized before multi-calendar support do not yet have
      // calendarList.readonly. Keep their existing primary-calendar sync alive
      // until the user explicitly reconnects and grants the added scope.
      if (!(error instanceof GoogleApiError) || error.status !== 403)
        throw error;
      const { data, error: fallbackError } = await supabase
        .from("google_calendars")
        .select(
          "id,connection_id,calendar_id,sync_token,watch_channel_id,watch_resource_id,watch_token_hash,watch_expires_at,sync_enabled,is_primary,sync_state,last_successful_sync_at,processed_event_count,recoverable_failure,sync_mode,sync_page_token,sync_run_id,sync_force_full,lease_token,lease_expires_at",
        )
        .eq("connection_id", connection.id)
        .eq("sync_enabled", true);
      if (fallbackError) throw fallbackError;
      return (data ?? []) as GoogleCalendarRow[];
    }
    calendars.push(
      ...(page.items ?? []).filter((calendar) => !calendar.deleted),
    );
    pageToken = page.nextPageToken;
  } while (pageToken);

  for (const calendar of calendars) {
    const canReadEvents = calendar.accessRole !== "freeBusyReader";
    const providerCalendarId = googleCalendarProviderId(calendar);
    const { error } = await supabase.from("google_calendars").upsert(
      {
        connection_id: connection.id,
        workspace_id: connection.workspace_id,
        teacher_id: connection.teacher_id,
        calendar_id: providerCalendarId,
        summary: calendar.summary || "Google Calendar",
        description: calendar.description ?? null,
        timezone: calendar.timeZone ?? null,
        access_role: calendar.accessRole,
        is_primary: Boolean(calendar.primary),
        google_background_color: calendar.backgroundColor ?? null,
        sync_enabled: canReadEvents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id,calendar_id", ignoreDuplicates: false },
    );
    if (error) throw error;
  }

  const activeIds = calendars.map(googleCalendarProviderId);
  const { data: knownCalendars, error: knownCalendarsError } = await supabase
    .from("google_calendars")
    .select("id,calendar_id")
    .eq("connection_id", connection.id);
  if (knownCalendarsError) throw knownCalendarsError;
  for (const known of knownCalendars ?? []) {
    if (activeIds.includes(known.calendar_id as string)) continue;
    const { error } = await supabase
      .from("google_calendars")
      .update({
        sync_enabled: false,
        visible: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", known.id);
    if (error) throw error;
  }
  const { data, error } = await supabase
    .from("google_calendars")
    .select(
      "id,connection_id,calendar_id,sync_token,watch_channel_id,watch_resource_id,watch_token_hash,watch_expires_at,sync_enabled,is_primary,sync_state,last_successful_sync_at,processed_event_count,recoverable_failure,sync_mode,sync_page_token,sync_run_id,sync_force_full,lease_token,lease_expires_at",
    )
    .eq("connection_id", connection.id)
    .eq("sync_enabled", true);
  if (error) throw error;
  return (data ?? []) as GoogleCalendarRow[];
}

export async function syncGoogleConnection(
  connectionId: string,
  forceFull = false,
): Promise<{ changed: number; full: boolean }> {
  const supabase = createSupabaseAdminClient();
  const attemptedAt = new Date().toISOString();
  const { error: startError } = await supabase
    .from("integration_connections")
    .update({
      sync_state: "syncing",
      last_attempted_sync_at: attemptedAt,
      sync_requested_at: null,
      updated_at: attemptedAt,
    })
    .eq("id", connectionId);
  if (startError) throw startError;
  try {
    const connection = await connectionById(connectionId);
    const { token } = await validGoogleAccessToken(
      connection.teacher_id,
      connection.encrypted_credentials,
    );
    let calendars = await refreshGoogleCalendarList(connection, token);
    const counters: Record<string, number> = {};
    let changed = 0;
    let anyFull = false;
    const deadline = Date.now() + GOOGLE_SYNC_BUDGET_MS;
    const failedCalendars = new Set<string>();
    let claimedElsewhere = false;
    // Round-robin pages keep a very large calendar from starving its siblings.
    while (calendars.length && Date.now() < deadline) {
      const remaining: GoogleCalendarRow[] = [];
      for (const calendar of calendars) {
        if (Date.now() >= deadline) {
          remaining.push(calendar);
          continue;
        }
        const leaseToken = randomUUID();
        const leaseExpiresAt = new Date(
          Date.now() + GOOGLE_SYNC_LEASE_MS,
        ).toISOString();
        const runId = calendar.sync_run_id ?? randomUUID();
        const mode =
          calendar.sync_mode ??
          (forceFull || !calendar.sync_token ? "full" : "incremental");
        const { data: claimed, error: claimError } = await supabase
          .from("google_calendars")
          .update({
            sync_state: "syncing",
            sync_mode: mode,
            sync_run_id: runId,
            sync_force_full: forceFull,
            lease_token: leaseToken,
            lease_expires_at: leaseExpiresAt,
            last_attempted_sync_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", calendar.id)
          .or(
            `lease_expires_at.is.null,lease_expires_at.lt.${new Date().toISOString()}`,
          )
          .select("id")
          .maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) {
          claimedElsewhere = true;
          continue;
        }
        const scopedConnection = {
          ...connection,
          selected_calendar_id: calendar.calendar_id,
          sync_token: calendar.sync_token,
        };
        const started = Date.now();
        try {
          let result;
          try {
            result = await listChangesPage(
              scopedConnection,
              { ...calendar, sync_mode: mode, sync_run_id: runId },
              token,
              forceFull,
            );
          } catch (error) {
            if (!(error instanceof GoogleApiError) || error.status !== 410)
              throw error;
            await supabase
              .from("google_calendars")
              .update({
                sync_token: null,
                sync_page_token: null,
                sync_mode: "full",
                sync_run_id: runId,
              })
              .eq("id", calendar.id)
              .eq("lease_token", leaseToken);
            result = await listChangesPage(
              scopedConnection,
              {
                ...calendar,
                sync_token: null,
                sync_page_token: null,
                sync_mode: "full",
                sync_run_id: runId,
              },
              token,
              true,
            );
          }
          const batch = await reconcileGoogleEventPage(
            scopedConnection,
            result.events,
            runId,
            (event, timingError) => {
              counters.skipped_invalid = (counters.skipped_invalid ?? 0) + 1;
              logSync("event_skipped", connection.id, {
                calendarId: calendar.calendar_id,
                eventKey: createHash("sha256")
                  .update(event.id)
                  .digest("hex")
                  .slice(0, 12),
                reason: timingError.code,
              });
            },
          );
          for (const kind of batch.results)
            counters[String(kind)] = (counters[String(kind)] ?? 0) + 1;
          const completed = !result.nextPageToken;
          const hadInvalid =
            Boolean(calendar.recoverable_failure) || batch.invalid > 0;
          if (
            completed &&
            shouldCleanupGoogleEventCache(result.full, hadInvalid ? 1 : 0)
          ) {
            const { error: cleanupError } = await supabase
              .from("external_google_events")
              .delete()
              .eq("connection_id", connection.id)
              .eq("calendar_id", calendar.calendar_id)
              .neq("last_seen_sync_id", runId);
            if (cleanupError) throw cleanupError;
          }
          const now = new Date().toISOString();
          const { data: pageCommit, error: pageCommitError } = await supabase
            .from("google_calendars")
            .update({
              sync_token: completed ? result.syncToken : calendar.sync_token,
              sync_page_token: result.nextPageToken,
              sync_mode: completed
                ? null
                : result.full
                  ? "full"
                  : "incremental",
              sync_run_id: completed ? null : runId,
              sync_force_full: completed ? false : forceFull,
              sync_state: completed ? "idle" : "pending",
              processed_event_count:
                (calendar.processed_event_count ?? 0) +
                result.events.length -
                batch.invalid,
              recoverable_failure: completed ? false : hadInvalid,
              last_error: null,
              last_successful_sync_at: completed
                ? now
                : calendar.last_successful_sync_at,
              lease_token: null,
              lease_expires_at: null,
              updated_at: now,
            })
            .eq("id", calendar.id)
            .eq("lease_token", leaseToken)
            .select("id")
            .maybeSingle();
          if (pageCommitError) throw pageCommitError;
          if (!pageCommit) throw new Error("GOOGLE_SYNC_LEASE_LOST");
          changed += result.events.length - batch.invalid;
          anyFull ||= result.full;
          logSync("calendar_page", connection.id, {
            calendarId: calendar.calendar_id,
            batchSize: result.events.length,
            processed: result.events.length - batch.invalid,
            skipped: batch.invalid,
            durationMs: Date.now() - started,
            completed,
            nextPage: Boolean(result.nextPageToken),
            full: result.full,
          });
          if (!completed)
            remaining.push({
              ...calendar,
              sync_page_token: result.nextPageToken,
              sync_mode: result.full ? "full" : "incremental",
              sync_run_id: runId,
              processed_event_count:
                (calendar.processed_event_count ?? 0) +
                result.events.length -
                batch.invalid,
              recoverable_failure: hadInvalid,
              lease_token: null,
              lease_expires_at: null,
            });
          else if (shouldRenewGoogleWatch(calendar.watch_expires_at))
            await registerSingleGoogleWatch(
              connection.id,
              calendar.calendar_id,
            ).catch((watchError) =>
              logSync("watch_register", connection.id, {
                calendarId: calendar.calendar_id,
                result: "error",
                error: safeGoogleError(watchError),
              }),
            );
        } catch (calendarError) {
          failedCalendars.add(calendar.calendar_id);
          const safeError = safeGoogleError(calendarError);
          await supabase
            .from("google_calendars")
            .update({
              sync_state: "error",
              recoverable_failure: true,
              last_error: safeError,
              lease_token: null,
              lease_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", calendar.id)
            .eq("lease_token", leaseToken);
          logSync("calendar_reconcile", connection.id, {
            calendarId: calendar.calendar_id,
            result: "error",
            error: safeError,
            sqlState: safeSqlState(calendarError),
          });
        }
      }
      calendars = remaining;
    }
    const completedAt = new Date().toISOString();
    const unfinished = calendars.length > 0 || claimedElsewhere;
    const { error: updateError } = await supabase
      .from("integration_connections")
      .update({
        status: "connected",
        sync_state: failedCalendars.size
          ? "error"
          : unfinished
            ? "pending"
            : "idle",
        sync_requested_at: unfinished ? completedAt : null,
        last_successful_sync_at:
          !unfinished && !failedCalendars.size
            ? completedAt
            : connection.last_successful_sync_at,
        last_error: failedCalendars.size
          ? "GOOGLE_CALENDAR_PARTIAL_FAILURE"
          : null,
        updated_at: completedAt,
      })
      .eq("id", connection.id);
    if (updateError) throw updateError;
    logSync("reconcile", connection.id, {
      calendars: calendars.length,
      changed,
      full: anyFull,
      counters,
      unfinished,
      failedCalendars: failedCalendars.size,
      result: failedCalendars.size
        ? "partial"
        : unfinished
          ? "resumable"
          : "success",
    });
    return { changed, full: anyFull };
  } catch (error) {
    await markConnectionFailure(connectionId, error);
    logSync("reconcile", connectionId, {
      result: "error",
      error: safeGoogleError(error),
    });
    throw error;
  }
}

/**
 * Completes the user's visible range independently from the global incremental
 * stream. Range cursors never become global sync tokens.
 */
export async function syncGoogleVisibleRangeForTeacher(
  teacherId: string,
  range: { start: string; end: string },
): Promise<{ processed: number; complete: boolean }> {
  const startMs = Date.parse(range.start);
  const endMs = Date.parse(range.end);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    endMs - startMs > 370 * 24 * 60 * 60_000
  )
    throw new Error("GOOGLE_RANGE_INVALID");
  const rangeStart = new Date(startMs).toISOString();
  const rangeEnd = new Date(endMs).toISOString();
  const supabase = createSupabaseAdminClient();
  const { data: connectionData, error: connectionError } = await supabase
    .from("integration_connections")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connectionData) return { processed: 0, complete: true };
  const connection = await connectionById(connectionData.id as string);
  const { token } = await validGoogleAccessToken(
    connection.teacher_id,
    connection.encrypted_credentials,
  );
  const calendars = await refreshGoogleCalendarList(connection, token);
  const requestedAt = new Date().toISOString();
  const requestedRows = calendars.map((calendar) => ({
    calendar_id: calendar.id,
    connection_id: connection.id,
    workspace_id: connection.workspace_id,
    teacher_id: connection.teacher_id,
    range_start: rangeStart,
    range_end: rangeEnd,
    updated_at: requestedAt,
  }));
  if (requestedRows.length) {
    const { error } = await supabase
      .from("google_calendar_range_backfills")
      .upsert(requestedRows, {
        onConflict: "calendar_id,range_start,range_end",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
  const { data: workData, error: workError } = await supabase
    .from("google_calendar_range_backfills")
    .select(
      "id,calendar_id,page_token,sync_run_id,state,processed_event_count,lease_expires_at",
    )
    .eq("connection_id", connection.id)
    .eq("range_start", rangeStart)
    .eq("range_end", rangeEnd)
    .neq("state", "idle");
  if (workError) throw workError;
  const calendarById = new Map(
    calendars.map((calendar) => [calendar.id, calendar]),
  );
  let work = workData ?? [];
  let processed = 0;
  let claimedElsewhere = false;
  const deadline = Date.now() + GOOGLE_SYNC_BUDGET_MS;
  while (work.length && Date.now() < deadline) {
    const remaining: typeof work = [];
    for (const item of work) {
      if (Date.now() >= deadline) {
        remaining.push(item);
        continue;
      }
      const calendar = calendarById.get(item.calendar_id as string);
      if (!calendar) continue;
      const leaseToken = randomUUID();
      const { data: claimed, error: claimError } = await supabase
        .from("google_calendar_range_backfills")
        .update({
          state: "syncing",
          lease_token: leaseToken,
          lease_expires_at: new Date(
            Date.now() + GOOGLE_SYNC_LEASE_MS,
          ).toISOString(),
          last_attempted_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", item.id)
        .or(
          `lease_expires_at.is.null,lease_expires_at.lt.${new Date().toISOString()}`,
        )
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) {
        claimedElsewhere = true;
        continue;
      }
      const started = Date.now();
      try {
        const page = await listGoogleRangePage(
          calendar.calendar_id,
          token,
          rangeStart,
          rangeEnd,
          item.page_token as string | null,
        );
        const scopedConnection = {
          ...connection,
          selected_calendar_id: calendar.calendar_id,
          sync_token: calendar.sync_token,
        };
        const batch = await reconcileGoogleEventPage(
          scopedConnection,
          page.items ?? [],
          item.sync_run_id as string,
          (event, timingError) =>
            logSync("range_event_skipped", connection.id, {
              calendarId: calendar.calendar_id,
              eventKey: createHash("sha256")
                .update(event.id)
                .digest("hex")
                .slice(0, 12),
              reason: timingError.code,
            }),
          false,
        );
        const nextPageToken = page.nextPageToken ?? null;
        const count = (page.items?.length ?? 0) - batch.invalid;
        const completedAt = nextPageToken ? null : new Date().toISOString();
        const { data: commit, error: commitError } = await supabase
          .from("google_calendar_range_backfills")
          .update({
            page_token: nextPageToken,
            state: nextPageToken ? "pending" : "idle",
            processed_event_count:
              Number(item.processed_event_count ?? 0) + count,
            completed_at: completedAt,
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("lease_token", leaseToken)
          .select("id")
          .maybeSingle();
        if (commitError) throw commitError;
        if (!commit) throw new Error("GOOGLE_RANGE_LEASE_LOST");
        processed += count;
        logSync("range_page", connection.id, {
          calendarId: calendar.calendar_id,
          rangeStart,
          rangeEnd,
          batchSize: page.items?.length ?? 0,
          processed: count,
          skipped: batch.invalid,
          durationMs: Date.now() - started,
          completed: !nextPageToken,
        });
        if (nextPageToken)
          remaining.push({
            ...item,
            page_token: nextPageToken,
            state: "pending",
            processed_event_count:
              Number(item.processed_event_count ?? 0) + count,
            lease_expires_at: null,
          });
      } catch (error) {
        const safeError = safeGoogleError(error);
        await supabase
          .from("google_calendar_range_backfills")
          .update({
            state: "error",
            last_error: safeError,
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("lease_token", leaseToken);
        logSync("range_page", connection.id, {
          calendarId: calendar.calendar_id,
          rangeStart,
          rangeEnd,
          result: "error",
          error: safeError,
        });
      }
    }
    work = remaining;
  }
  return { processed, complete: work.length === 0 && !claimedElsewhere };
}

async function registerSingleGoogleWatch(
  connectionId: string,
  calendarId: string,
): Promise<void> {
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
  const parsedWebhookUrl = new URL(webhookUrl);
  if (parsedWebhookUrl.protocol !== "https:")
    throw new Error("GOOGLE_CALENDAR_WEBHOOK_HTTPS_REQUIRED");
  const connection = await connectionById(connectionId);
  const supabase = createSupabaseAdminClient();
  const { data: calendarData, error: calendarError } = await supabase
    .from("google_calendars")
    .select(
      "id,connection_id,calendar_id,sync_token,watch_channel_id,watch_resource_id,watch_token_hash,watch_expires_at,sync_enabled,is_primary",
    )
    .eq("connection_id", connection.id)
    .eq("calendar_id", calendarId)
    .eq("sync_enabled", true)
    .single();
  if (calendarError || !calendarData)
    throw new Error("GOOGLE_CALENDAR_NOT_FOUND");
  const calendar = calendarData as GoogleCalendarRow;
  const { token } = await validGoogleAccessToken(
    connection.teacher_id,
    connection.encrypted_credentials,
  );
  const channelId = randomUUID();
  const channelToken = randomBytes(32).toString("base64url");
  const requestedExpiration = Date.now() + 6 * 24 * 60 * 60_000;
  const response = await googleApiRequest(
    token,
    `/calendars/${encodeURIComponent(calendar.calendar_id)}/events/watch`,
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
  const oldChannel = calendar.watch_channel_id;
  const oldResource = calendar.watch_resource_id;
  await replaceGoogleWatchSafely(
    async () => {
      const { error } = await supabase
        .from("google_calendars")
        .update({
          watch_channel_id: channel.id,
          watch_resource_id: channel.resourceId,
          watch_token_hash: hashChannelToken(channelToken),
          watch_expires_at: googleWatchExpiration(
            channel.expiration,
            requestedExpiration,
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", calendar.id);
      if (error) throw error;
      if (calendar.is_primary) {
        await supabase
          .from("integration_connections")
          .update({
            watch_channel_id: channel.id,
            watch_resource_id: channel.resourceId,
            watch_token_hash: hashChannelToken(channelToken),
            watch_expires_at: googleWatchExpiration(
              channel.expiration,
              requestedExpiration,
            ),
          })
          .eq("id", connection.id);
      }
    },
    async () => {
      if (!oldChannel || !oldResource) return;
      const stopResponse = await googleApiRequest(token, "/channels/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: oldChannel, resourceId: oldResource }),
      });
      if (!stopResponse.ok) await responseJson(stopResponse);
    },
  );
  logSync("watch_register", connection.id, {
    calendarId: calendar.calendar_id,
    result: "success",
  });
}

export async function registerGoogleWatch(connectionId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("google_calendars")
    .select("calendar_id,watch_expires_at")
    .eq("connection_id", connectionId)
    .eq("sync_enabled", true);
  if (error) throw error;
  for (const calendar of data ?? []) {
    if (!shouldRenewGoogleWatch(calendar.watch_expires_at as string | null))
      continue;
    await registerSingleGoogleWatch(
      connectionId,
      calendar.calendar_id as string,
    );
  }
}

export async function initializeGoogleConnection(connectionId: string) {
  const sync = await Promise.resolve()
    .then(async () => {
      const result = await syncGoogleConnection(connectionId, true);
      await enqueueMissingGoogleLessonsForConnection(connectionId);
      const connection = await connectionById(connectionId);
      await processGoogleLessonJobs({
        teacherId: connection.teacher_id,
        limit: GOOGLE_OUTBOUND_BATCH_LIMIT,
      });
      return result;
    })
    .then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason }),
    );
  const watch = await registerGoogleWatch(connectionId).then(
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

export type GoogleWebhookDecision =
  | { kind: "invalid" }
  | { kind: "skipped_not_entitled" }
  | { kind: "accepted"; connectionId: string; teacherId: string };

export async function acceptGoogleWebhook(
  request: Request,
): Promise<GoogleWebhookDecision> {
  const headers = googleWebhookHeaders(request);
  if (!headers) return { kind: "invalid" };
  const { channelId, resourceId, channelToken } = headers;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("google_calendars")
    .select("connection_id,teacher_id,watch_token_hash")
    .eq("watch_channel_id", channelId)
    .eq("watch_resource_id", resourceId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.watch_token_hash) return { kind: "invalid" };
  if (!isValidGoogleChannelToken(channelToken, data.watch_token_hash))
    return { kind: "invalid" };
  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("teacher_id,status,tier")
    .eq("teacher_id", data.teacher_id)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;
  const lifetimeOwners = await ownerLifetimeUserIds(supabase, [
    data.teacher_id,
  ]);
  const entitled = entitledTeacherIds(
    applyOwnerLifetimeAccess(
      subscription ? [subscription] : [],
      lifetimeOwners,
    ),
    "googleCalendar",
  );
  if (!entitled.has(data.teacher_id)) return { kind: "skipped_not_entitled" };
  const requestedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("integration_connections")
    .update({
      sync_requested_at: requestedAt,
      sync_state: "pending",
      updated_at: requestedAt,
    })
    .eq("id", data.connection_id)
    .eq("status", "connected");
  if (updateError) throw updateError;
  return {
    kind: "accepted",
    connectionId: data.connection_id as string,
    teacherId: data.teacher_id as string,
  };
}

export async function maintainGoogleConnections(limit = 10) {
  const supabase = createSupabaseAdminClient();
  const lifetimeOwners = await ownerLifetimeUserIds(supabase);
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("teacher_id,status,tier")
    .or("status.eq.trial,tier.neq.free")
    .limit(GOOGLE_MAINTENANCE_SCAN_LIMIT);
  if (subscriptionError) throw subscriptionError;
  const ownerIds = [...lifetimeOwners];
  const { data: ownerSubscriptions, error: ownerSubscriptionError } =
    ownerIds.length
      ? await supabase
          .from("subscriptions")
          .select("teacher_id,status,tier")
          .in("teacher_id", ownerIds)
      : { data: [], error: null };
  if (ownerSubscriptionError) throw ownerSubscriptionError;
  const subscriptionByTeacher = new Map(
    [...(subscriptions ?? []), ...(ownerSubscriptions ?? [])].map((row) => [
      row.teacher_id,
      row,
    ]),
  );
  const entitled = entitledTeacherIds(
    applyOwnerLifetimeAccess(
      [...subscriptionByTeacher.values()],
      lifetimeOwners,
    ),
    "googleCalendar",
  );
  const teacherIds = [...entitled];
  if (!teacherIds.length)
    return { inspected: 0, synced: 0, watches: 0, skipped: 0, failed: 0 };
  const { data, error } = await supabase
    .from("integration_connections")
    .select(
      "id,teacher_id,sync_state,sync_requested_at,last_attempted_sync_at,last_successful_sync_at,watch_expires_at,status",
    )
    .eq("provider", "google")
    .eq("status", "connected")
    .in("teacher_id", teacherIds)
    .order("watch_expires_at", { ascending: true, nullsFirst: true })
    .limit(GOOGLE_MAINTENANCE_SCAN_LIMIT);
  if (error) throw error;
  const now = Date.now();
  const staleAt = now - 15 * 60_000;
  const due = prioritizeGoogleMaintenanceCandidates(
    (data ?? []) as MaintenanceCandidate[],
    now,
  ).slice(0, limit);
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
    const shouldRenewWatch = shouldRenewGoogleWatch(row.watch_expires_at, now);
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
  return {
    inspected: due.length,
    synced,
    watches,
    skipped: 0,
    failed,
  };
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
    .limit(Math.min((options.limit ?? GOOGLE_OUTBOUND_BATCH_LIMIT) * 5, 100));
  if (options.teacherId) query = query.eq("teacher_id", options.teacherId);
  const { data: jobs, error } = await query;
  if (error) throw error;
  const teacherIds = [
    ...new Set((jobs ?? []).map((job) => job.teacher_id as string)),
  ];
  const { data: subscriptions, error: subscriptionError } = teacherIds.length
    ? await supabase
        .from("subscriptions")
        .select("teacher_id,status,tier")
        .in("teacher_id", teacherIds)
    : { data: [], error: null };
  if (subscriptionError) throw subscriptionError;
  const lifetimeOwners = await ownerLifetimeUserIds(supabase, teacherIds);
  const entitled = entitledTeacherIds(
    applyOwnerLifetimeAccess(subscriptions ?? [], lifetimeOwners),
    "googleCalendar",
  );
  const processableJobs = (jobs ?? [])
    .filter((job) => entitled.has(job.teacher_id))
    .slice(0, options.limit ?? GOOGLE_OUTBOUND_BATCH_LIMIT);
  const results = [];
  for (const job of processableJobs)
    results.push(await processGoogleLessonJob(job));
  return {
    recovered: recoveredJobs?.length ?? 0,
    processed: results.length,
    succeeded: results.filter((result) => result === "succeeded").length,
    retried: (jobs ?? []).filter((job) => job.attempts > 0).length,
    skipped:
      results.filter((result) => result === "skipped").length +
      (jobs?.length ?? 0) -
      processableJobs.length,
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
