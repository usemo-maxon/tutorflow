import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ createSupabaseAdminClient: vi.fn() }));

import { resolveLinkedEventChange } from "./google-calendar-sync";

describe("Google Calendar conflict and loop resolution", () => {
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
