import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  localAllowed: vi.fn(() => false),
}));
vi.mock("./supabase", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("./repository", () => ({
  localAllowed: mocks.localAllowed,
  getAppData: vi.fn(),
}));

import { getFinancialOverview } from "./finance";

function fixture(summary: Promise<unknown>, packageError = false) {
  const started: string[] = [];
  const rows: Record<string, unknown> = {
    tutor_profiles: { workspace_id: "workspace", timezone: "Europe/Warsaw" },
    workspace_members: { workspace_id: "workspace" },
    subscriptions: { read_only: false },
    workspaces: {
      currency: "PLN",
      timezone: "Europe/Warsaw",
      payment_due_days: 7,
    },
    packages: [
      {
        id: "package",
        student_id: "student",
        total_lessons: 8,
        status: "active",
        price_grosz: 80000,
      },
    ],
    package_balances: [
      { package_id: "package", used_lessons: 1, remaining_lessons: 7 },
    ],
    package_usages: [
      {
        id: "usage",
        package_id: "package",
        lesson_id: "lesson",
        kind: "consumption",
        units: 1,
      },
    ],
    lessons: [
      { id: "lesson", title: "Algebra", starts_at: "2026-10-20T12:00:00Z" },
    ],
  };
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "gt",
      "neq",
      "order",
      "limit",
      "range",
      "in",
      "single",
    ]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown,
    ) => {
      started.push(table);
      return Promise.resolve({
        data: rows[table] ?? [],
        error:
          packageError && table === "packages" ? { message: "failed" } : null,
      }).then(resolve, reject);
    };
    return builder;
  });
  mocks.client.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "teacher" } } }),
    },
    from,
    rpc: vi.fn(() => summary),
  });
  return { started, from };
}

describe("finance read pipeline", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads package history while the independent summary is still pending", async () => {
    let release!: (value: unknown) => void;
    const { started } = fixture(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const overview = getFinancialOverview("teacher");
    await vi.waitFor(() => expect(started).toContain("lessons"));
    release({
      data: [
        {
          outstanding_grosz: 12000,
          overdue_grosz: 0,
          received_this_month_grosz: 5000,
        },
      ],
      error: null,
    });
    const result = await overview;
    expect(result.summary.outstanding).toBe(12000);
    expect(result.packages[0].remainingLessons).toBe(7);
    expect(result.packages[0].usage[0].lessonLabel).toContain("Algebra");
  });

  it("propagates a package failure without returning a partial finance result", async () => {
    fixture(Promise.resolve({ data: [], error: null }), true);
    await expect(getFinancialOverview("teacher")).rejects.toMatchObject({
      status: 422,
    });
  });

  it("rejects another teacher before issuing financial data queries", async () => {
    const { started } = fixture(Promise.resolve({ data: [], error: null }));
    await expect(getFinancialOverview("someone-else")).rejects.toMatchObject({
      status: 401,
    });
    expect(started).not.toContain("packages");
    expect(started).not.toContain("charge_balances");
  });
});
