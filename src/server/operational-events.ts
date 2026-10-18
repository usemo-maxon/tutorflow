import "server-only";

import { createSupabaseAdminClient } from "./supabase";

export async function recordOperationalEvent(input: {
  type: string;
  severity: "info" | "warning" | "error" | "critical";
  service:
    | "application"
    | "database"
    | "google_calendar"
    | "payu"
    | "webhook"
    | "scheduler";
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  idempotencyKey?: string;
}): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc(
    "record_platform_operational_event",
    {
      event_kind: input.type.slice(0, 100),
      event_severity: input.severity,
      event_service: input.service,
      event_summary: input.summary.slice(0, 500),
      event_metadata: input.metadata ?? {},
      event_idempotency_key: input.idempotencyKey?.slice(0, 240) ?? null,
    },
  );
  if (error) console.error("Unable to persist sanitized operational event");
}
