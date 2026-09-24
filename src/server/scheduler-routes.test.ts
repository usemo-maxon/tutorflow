import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const updates: Array<[string, Record<string, unknown>]> = [];
  function chain(result: { data: unknown[]; error: null }, table: string) {
    const proxy: Record<string, unknown> = new Proxy(
      {
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(result).then(resolve);
        },
      },
      {
        get(target, property) {
          if (property in target)
            return target[property as keyof typeof target];
          if (property === "update") {
            return (value: Record<string, unknown>) => {
              updates.push([table, value]);
              return proxy;
            };
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  }

  const from = vi.fn((table: string) =>
    chain({ data: [], error: null }, table),
  );
  return {
    from,
    updates,
    client: {
      from,
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async () => ({ error: null })),
        })),
      },
    },
  };
});

vi.mock("@/server/supabase", () => ({
  createSupabaseAdminClient: () => mocks.client,
}));

import { GET as googleSync } from "@/app/api/cron/google-sync/route";
import { GET as maintenance } from "@/app/api/cron/maintenance/route";
import { GET as telegramReminders } from "@/app/api/cron/telegram-reminders/route";

const handlers = [telegramReminders, googleSync, maintenance];

afterEach(() => {
  delete process.env.CRON_SECRET;
  mocks.from.mockClear();
  mocks.updates.length = 0;
});

describe("external scheduler endpoints", () => {
  for (const [index, handler] of handlers.entries()) {
    it(`route ${index + 1} rejects a missing scheduler header`, async () => {
      process.env.CRON_SECRET = "scheduler-secret-at-least-16-chars";
      const response = await handler(new Request("https://example.test"));
      expect(response.status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it(`route ${index + 1} rejects a wrong scheduler token`, async () => {
      process.env.CRON_SECRET = "scheduler-secret-at-least-16-chars";
      const response = await handler(
        new Request("https://example.test", {
          headers: { authorization: "Bearer wrong" },
        }),
      );
      expect(response.status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it(`route ${index + 1} starts with the exact scheduler token`, async () => {
      process.env.CRON_SECRET = "scheduler-secret-at-least-16-chars";
      const response = await handler(
        new Request("https://example.test", {
          headers: {
            authorization: "Bearer scheduler-secret-at-least-16-chars",
          },
        }),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).ok).toBe(true);
      expect(mocks.from).toHaveBeenCalled();
    });
  }

  it("moves expired trials to active Free without touching students", async () => {
    process.env.CRON_SECRET = "scheduler-secret-at-least-16-chars";
    const response = await maintenance(
      new Request("https://example.test", {
        headers: {
          authorization: "Bearer scheduler-secret-at-least-16-chars",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updates).toContainEqual([
      "subscriptions",
      expect.objectContaining({
        status: "active",
        tier: "free",
        billing_interval: null,
        read_only: false,
      }),
    ]);
    expect(mocks.from).not.toHaveBeenCalledWith("students");
  });
});
