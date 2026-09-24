import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ createSupabaseAdminClient: vi.fn() }));

import {
  collectGoogleEventPages,
  googleEventIdForLesson,
  googleReplacementEventId,
  googleWatchExpiration,
  googleWebhookHeaders,
  isValidGoogleChannelToken,
  prioritizeGoogleMaintenanceCandidates,
  recoverInvalidGoogleSyncToken,
  replaceGoogleWatchSafely,
  resolveLinkedEventChange,
  shouldRecreateDeletedProviderEvent,
  shouldRenewGoogleWatch,
} from "./google-calendar-sync";

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
});
