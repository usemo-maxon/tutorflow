import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  function chain(result: { data: unknown[]; error: null }) {
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
          return () => proxy;
        },
      },
    );
    return proxy;
  }

  const from = vi.fn(() => chain({ data: [], error: null }));
  return {
    from,
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
});
