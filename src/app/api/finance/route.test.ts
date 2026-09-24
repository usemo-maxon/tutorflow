import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiFailure } from "@/server/errors";

const mocks = vi.hoisted(() => ({
  currentTeacherId: vi.fn(),
  getFinancialOverview: vi.fn(),
  mutateFinance: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  currentTeacherId: mocks.currentTeacherId,
}));

vi.mock("@/server/finance", () => ({
  getFinancialOverview: mocks.getFinancialOverview,
  mutateFinance: mocks.mutateFinance,
}));

import { GET, POST } from "./route";

const teacherId = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";

function paymentRequest(headers: HeadersInit = {}) {
  return new Request("https://easy4tutor.pl/api/finance", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      type: "recordPayment",
      studentId,
      amountGrosz: 10_000,
      currency: "PLN",
      paidAt: "2026-09-24T12:00:00.000Z",
      paymentMethod: "bank_transfer",
      allocations: [],
      idempotencyKey: "payment-test-key",
    }),
  });
}

function packageRequest() {
  return new Request("https://easy4tutor.pl/api/finance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "createPackage",
      studentId,
      name: "Pakiet 8 zajęć",
      totalLessons: 8,
      priceGrosz: 64_000,
      currency: "PLN",
      purchasedAt: "2026-09-24T12:00:00.000Z",
      expiresAt: "2027-03-24T12:00:00.000Z",
      idempotencyKey: "package-test-key",
    }),
  });
}

describe("finance API boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTeacherId.mockResolvedValue(teacherId);
    mocks.getFinancialOverview.mockResolvedValue({ ok: true });
    mocks.mutateFinance.mockResolvedValue({ ok: true });
  });

  it("returns 401 for unauthenticated reads and writes", async () => {
    mocks.currentTeacherId.mockResolvedValue(null);
    expect((await GET(new Request("https://easy4tutor.pl/api/finance"))).status).toBe(401);
    expect((await POST(paymentRequest())).status).toBe(401);
  });

  it("rejects cross-site mutations before invoking finance", async () => {
    const response = await POST(paymentRequest({ "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(mocks.mutateFinance).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid input", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "recordPayment", amountGrosz: -1 }),
      }),
    );
    expect(response.status).toBe(422);
  });

  it("forwards a valid payment using the authenticated teacher", async () => {
    const response = await POST(paymentRequest());
    expect(response.status).toBe(200);
    expect(mocks.mutateFinance).toHaveBeenCalledWith(
      teacherId,
      expect.objectContaining({
        type: "recordPayment",
        studentId,
        amountGrosz: 10_000,
      }),
    );
  });

  it("forwards a valid package using the authenticated teacher", async () => {
    const response = await POST(packageRequest());
    expect(response.status).toBe(200);
    expect(mocks.mutateFinance).toHaveBeenCalledWith(
      teacherId,
      expect.objectContaining({
        type: "createPackage",
        studentId,
        totalLessons: 8,
      }),
    );
  });

  it("preserves the read-only 403 returned by the trusted server layer", async () => {
    mocks.mutateFinance.mockRejectedValue(
      new ApiFailure(403, {
        code: "READ_ONLY",
        message: "W trybie tylko do odczytu nie można zmieniać rozliczeń.",
      }),
    );
    expect((await POST(paymentRequest())).status).toBe(403);
  });
});
