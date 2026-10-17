import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ createSupabaseAdminClient: vi.fn() }));

import {
  collectGoogleEventPages,
  googleEventIdForLesson,
  googleCalendarProviderId,
  googleReplacementEventId,
  googleWatchExpiration,
  googleWebhookHeaders,
  isValidGoogleChannelToken,
  prioritizeGoogleMaintenanceCandidates,
  reconcileGoogleEventBatch,
  recoverInvalidGoogleSyncToken,
  replaceGoogleWatchSafely,
  resolveLinkedEventChange,
  shouldRecreateDeletedProviderEvent,
  shouldCleanupGoogleEventCache,
  shouldRenewGoogleWatch,
} from "./google-calendar-sync";
import { GoogleEventTimingError } from "./google-calendar";

describe("Google Calendar conflict and loop resolution", () => {
  it("uses the same deterministic event ID as database-enqueued jobs", () => {
    const source = "teacher-1:lesson-1";
    expect(googleEventIdForLesson("teacher-1", "lesson-1")).toBe(
      createHash("md5").update(source).digest("hex"),
    );
  });

  it("ignores the provider echo of the state easy4tutor just wrote", () => {
    expect(
      resolveLinkedEventChange({
        incomingHash: "same",
        lastSyncedHash: "same",
        localUpdatedAt: "2035-01-10T10:00:00.000Z",
        localUpdatedAtAtSync: "2035-01-10T10:00:00.000Z",
        googleUpdatedAt: "2035-01-10T10:00:01.000Z",
      }),
    ).toBe("noop");
  });

  it("accepts a Google move when the local Lesson has not changed", () => {
    expect(
      resolveLinkedEventChange({
        incomingHash: "changed",
        lastSyncedHash: "old",
        localUpdatedAt: "2035-01-10T10:00:00.000Z",
        localUpdatedAtAtSync: "2035-01-10T10:00:00.000Z",
        googleUpdatedAt: "2035-01-10T10:05:00.000Z",
      }),
    ).toBe("google_wins");
  });

  it("keeps the newer local edit during a concurrent change", () => {
    expect(
      resolveLinkedEventChange({
        incomingHash: "changed",
        lastSyncedHash: "old",
        localUpdatedAt: "2035-01-10T10:10:00.000Z",
        localUpdatedAtAtSync: "2035-01-10T10:00:00.000Z",
        googleUpdatedAt: "2035-01-10T10:05:00.000Z",
      }),
    ).toBe("local_wins");
  });

  it("accepts the newer Google edit during a concurrent change", () => {
    expect(
      resolveLinkedEventChange({
        incomingHash: "changed",
        lastSyncedHash: "old",
        localUpdatedAt: "2035-01-10T10:05:00.000Z",
        localUpdatedAtAtSync: "2035-01-10T10:00:00.000Z",
        googleUpdatedAt: "2035-01-10T10:10:00.000Z",
      }),
    ).toBe("google_wins");
  });
});

describe("Google Calendar production hardening helpers", () => {
  it("normalizes the primary calendar identity without collapsing secondary calendars", () => {
    expect(
      googleCalendarProviderId({ id: "owner@example.test", primary: true }),
    ).toBe("primary");
    expect(googleCalendarProviderId({ id: "work@example.test" })).toBe(
      "work@example.test",
    );
  });
  it("requires every identity header and compares only the token hash", () => {
    expect(
      googleWebhookHeaders(
        new Request("https://easy4tutor.pl/api/webhooks/google-calendar"),
      ),
    ).toBeNull();
    const request = new Request(
      "https://easy4tutor.pl/api/webhooks/google-calendar",
      {
        headers: {
          "x-goog-channel-id": "channel-1",
          "x-goog-resource-id": "resource-1",
          "x-goog-channel-token": "secret-token",
        },
      },
    );
    expect(googleWebhookHeaders(request)).toEqual({
      channelId: "channel-1",
      resourceId: "resource-1",
      channelToken: "secret-token",
    });
    const expectedHash = createHash("sha256")
      .update("secret-token")
      .digest("hex");
    expect(isValidGoogleChannelToken("secret-token", expectedHash)).toBe(true);
    expect(isValidGoogleChannelToken("spoofed-token", expectedHash)).toBe(
      false,
    );
  });

  it("keeps the final page sync token authoritative", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: "event-1" }],
        nextPageToken: "page-2",
        nextSyncToken: "must-not-be-used",
      })
      .mockResolvedValueOnce({
        items: [{ id: "event-2" }],
        nextSyncToken: "final-token",
      });
    await expect(collectGoogleEventPages(fetchPage, false)).resolves.toEqual({
      events: [{ id: "event-1" }, { id: "event-2" }],
      syncToken: "final-token",
      full: false,
    });
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "page-2");
  });

  it("does not accept an incomplete paginated sync", async () => {
    await expect(
      collectGoogleEventPages(async () => ({ items: [] }), true),
    ).rejects.toThrow("GOOGLE_NEXT_SYNC_TOKEN_MISSING");
  });

  it("clears one invalid token and performs exactly one full resync", async () => {
    const incremental = vi.fn(async () => {
      const { GoogleApiError } = await import("./google-calendar");
      throw new GoogleApiError("GOOGLE_SYNC_TOKEN_EXPIRED", 410, false);
    });
    const clear = vi.fn(async () => undefined);
    const full = vi.fn(async () => "new-sync-token");
    await expect(
      recoverInvalidGoogleSyncToken(incremental, clear, full),
    ).resolves.toBe("new-sync-token");
    expect(incremental).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(full).toHaveBeenCalledOnce();
  });

  it("renews a missing or near-expiry watch with a 48-hour buffer", () => {
    const now = Date.parse("2035-01-10T10:00:00.000Z");
    expect(shouldRenewGoogleWatch(null, now)).toBe(true);
    expect(shouldRenewGoogleWatch("2035-01-12T09:59:59.000Z", now)).toBe(true);
    expect(shouldRenewGoogleWatch("2035-01-12T10:00:01.000Z", now)).toBe(false);
  });

  it("uses provider expiration and persists a replacement before stopping the old watch", async () => {
    expect(
      googleWatchExpiration(String(Date.parse("2035-01-01T10:00:00.000Z")), 1),
    ).toBe("2035-01-01T10:00:00.000Z");
    const order: string[] = [];
    await replaceGoogleWatchSafely(
      async () => {
        order.push("persist-new");
      },
      async () => {
        order.push("stop-old");
        throw new Error("stop failed");
      },
    );
    expect(order).toEqual(["persist-new", "stop-old"]);
  });

  it("prioritizes due watches over requested and stale backup syncs", () => {
    const now = Date.parse("2035-01-10T10:00:00.000Z");
    const base = {
      teacher_id: "teacher-1",
      sync_state: "idle",
      sync_requested_at: null,
      last_attempted_sync_at: "2035-01-10T09:00:00.000Z",
      last_successful_sync_at: "2035-01-10T09:00:00.000Z",
      watch_expires_at: "2035-01-20T10:00:00.000Z",
      status: "connected",
    };
    const ordered = prioritizeGoogleMaintenanceCandidates(
      [
        { ...base, id: "stale" },
        {
          ...base,
          id: "requested",
          sync_requested_at: "2035-01-10T09:59:00.000Z",
        },
        {
          ...base,
          id: "watch",
          watch_expires_at: "2035-01-11T10:00:00.000Z",
        },
      ],
      now,
    );
    expect(ordered.map((row) => row.id)).toEqual([
      "watch",
      "requested",
      "stale",
    ]);
  });

  it("recreates active lessons deterministically but retires cancelled ones", () => {
    expect(shouldRecreateDeletedProviderEvent("scheduled")).toBe(true);
    expect(shouldRecreateDeletedProviderEvent("cancelled")).toBe(false);
    expect(googleReplacementEventId("teacher", "lesson", "deletion")).toBe(
      googleReplacementEventId("teacher", "lesson", "deletion"),
    );
  });

  it("continues a mixed batch after one malformed event", async () => {
    const events = [{ id: "valid-1" }, { id: "invalid" }, { id: "valid-2" }];
    const reconciled: string[] = [];
    const skipped: string[] = [];
    const result = await reconcileGoogleEventBatch(
      events,
      async (event) => {
        if (event.id === "invalid")
          throw new GoogleEventTimingError("GOOGLE_EVENT_ZERO_DURATION");
        reconciled.push(event.id);
        return "external";
      },
      (event, error) => skipped.push(`${event.id}:${error.code}`),
    );
    expect(reconciled).toEqual(["valid-1", "valid-2"]);
    expect(skipped).toEqual(["invalid:GOOGLE_EVENT_ZERO_DURATION"]);
    expect(result).toEqual({ results: ["external", "external"], invalid: 1 });
  });

  it("reconciles a synthetic 1,200-event page set with bounded concurrency and stable output", async () => {
    const events = Array.from({ length: 1_200 }, (_, index) => ({
      id: `event-${index}`,
    }));
    let active = 0;
    let maximumActive = 0;
    const result = await reconcileGoogleEventBatch(
      events,
      async (event) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return event.id;
      },
      () => undefined,
    );
    expect(result.invalid).toBe(0);
    expect(result.results).toHaveLength(1_200);
    expect(result.results[0]).toBe("event-0");
    expect(result.results.at(-1)).toBe("event-1199");
    expect(maximumActive).toBeLessThanOrEqual(8);
    expect(maximumActive).toBeGreaterThan(1);
  });

  it("does not swallow persistence failures while isolating malformed items", async () => {
    await expect(
      reconcileGoogleEventBatch(
        [{ id: "database-failure" }],
        async () => {
          throw { code: "08006" };
        },
        () => undefined,
      ),
    ).rejects.toEqual({ code: "08006" });
  });

  it("suppresses full-sync cleanup when even one provider item was skipped", () => {
    expect(shouldCleanupGoogleEventCache(true, 0)).toBe(true);
    expect(shouldCleanupGoogleEventCache(true, 1)).toBe(false);
    expect(shouldCleanupGoogleEventCache(false, 0)).toBe(false);
  });
});
