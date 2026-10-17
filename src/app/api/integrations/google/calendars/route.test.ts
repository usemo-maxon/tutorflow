import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  writes: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock("@/server/auth", () => ({ currentTeacher: mocks.currentTeacher }));
vi.mock("@/server/supabase", () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      let values: Record<string, unknown> | undefined;
      const builder = {
        select: () => builder,
        update(next: Record<string, unknown>) {
          values = next;
          mocks.writes.push({ table, values: next });
          return builder;
        },
        eq: () => builder,
        maybeSingle: async () => ({
          data:
            table === "integration_connections" && !values
              ? { id: "connection-1" }
              : { id: "calendar-row-1" },
          error: null,
        }),
        then(resolve: (value: { error: null }) => unknown) {
          return Promise.resolve(resolve({ error: null }));
        },
      };
      return builder;
    },
  }),
}));

import { PATCH } from "./route";

describe("Google calendar preferences", () => {
  beforeEach(() => {
    mocks.writes.length = 0;
    mocks.currentTeacher.mockResolvedValue({
      id: "teacher-1",
      subscription: { status: "trial", tier: "free" },
    });
  });

  it("persists visibility and busy blocking independently", async () => {
    const response = await PATCH(
      new Request("https://easy4tutor.pl/api/integrations/google/calendars", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: "google",
          calendarId: "work@example.test",
          visible: false,
          countAsBusy: true,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.writes).toContainEqual({
      table: "google_calendars",
      values: expect.objectContaining({ visible: false, count_as_busy: true }),
    });
  });

  it("stores a custom provider color in normalized form", async () => {
    const response = await PATCH(
      new Request("https://easy4tutor.pl/api/integrations/google/calendars", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: "google",
          calendarId: "personal@example.test",
          color: "#aabbcc",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.writes.at(-1)?.values.custom_color).toBe("#AABBCC");
  });

  it("rejects cross-site preference mutations", async () => {
    const response = await PATCH(
      new Request("https://easy4tutor.pl/api/integrations/google/calendars", {
        method: "PATCH",
        headers: { "sec-fetch-site": "cross-site" },
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.writes).toHaveLength(0);
  });
});
