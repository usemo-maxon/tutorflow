import { describe, expect, it } from "vitest";
import {
  FinanceActionSchema,
  parseMoneyInput,
  paymentPage,
  paymentStudentCandidates,
  suggestedAllocations,
  sumMinorUnits,
} from "./finance";

describe("financial allocation rules", () => {
  it("allocates oldest due items first and preserves overpayment", () => {
    const allocations = suggestedAllocations(20_000, [
      {
        id: "b",
        outstanding: 8_000,
        dueAt: "2026-09-20T00:00:00Z",
        createdAt: "2026-09-10T00:00:00Z",
      },
      {
        id: "a",
        outstanding: 8_000,
        dueAt: "2026-09-10T00:00:00Z",
        createdAt: "2026-09-01T00:00:00Z",
      },
    ]);
    expect(allocations).toEqual([
      { chargeId: "a", amountGrosz: 8_000 },
      { chargeId: "b", amountGrosz: 8_000 },
    ]);
    expect(sumMinorUnits(allocations.map((item) => item.amountGrosz))).toBe(
      16_000,
    );
  });

  it("supports a partial allocation", () => {
    expect(
      suggestedAllocations(10_000, [
        {
          id: "a",
          outstanding: 16_000,
          dueAt: undefined,
          createdAt: "2026-09-01T00:00:00Z",
        },
      ]),
    ).toEqual([{ chargeId: "a", amountGrosz: 10_000 }]);
  });

  it("rejects unsafe integer totals", () => {
    expect(() => sumMinorUnits([Number.MAX_SAFE_INTEGER, 1])).toThrow(
      "UNSAFE_MONEY_TOTAL",
    );
  });

  it("parses decimal input without floating-point arithmetic", () => {
    expect(parseMoneyInput("0.01")).toBe(1);
    expect(parseMoneyInput("39.00")).toBe(3_900);
    expect(parseMoneyInput("1234.56")).toBe(123_456);
    expect(parseMoneyInput("100")).toBe(10_000);
    expect(parseMoneyInput("100,5")).toBe(10_050);
    expect(parseMoneyInput("100,50")).toBe(10_050);
    expect(parseMoneyInput("100.50")).toBe(10_050);
    expect(parseMoneyInput("160,50")).toBe(16_050);
    expect(parseMoneyInput("80")).toBe(8_000);
    expect(parseMoneyInput("-1")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("10.999")).toBeNull();
    expect(parseMoneyInput("NaN")).toBeNull();
    expect(parseMoneyInput("Infinity")).toBeNull();
  });

  it.each([
    [0, 0, undefined],
    [1, 1, undefined],
    [20, 20, undefined],
    [21, 20, 20],
    [40, 20, 20],
    [41, 20, 20],
  ])(
    "paginates %i raw payments into %i visible rows",
    (count, visible, nextCursor) => {
      const rows = Array.from({ length: count }, (_, index) => index);
      expect(paymentPage(rows, 0)).toEqual({
        items: rows.slice(0, visible),
        nextCursor,
      });
    },
  );

  it("returns the remaining row on page two without duplicating page one", () => {
    const rows = Array.from({ length: 21 }, (_, index) => index);
    const first = paymentPage(rows.slice(0, 21), 0);
    const second = paymentPage(rows.slice(20), 20);
    expect(first.items).toHaveLength(20);
    expect(second.items).toEqual([20]);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.items, ...second.items])).toHaveLength(21);
  });

  it("keeps archived students available only when finance history exists", () => {
    const students = [
      { id: "active", name: "Aktywny", currency: "PLN", status: "active" as const, canRecordPayment: true },
      { id: "debt", name: "Dług", currency: "PLN", status: "archived" as const, canRecordPayment: true },
      { id: "empty", name: "Bez historii", currency: "PLN", status: "archived" as const, canRecordPayment: false },
    ];
    expect(
      paymentStudentCandidates({
        students,
        openCharges: [{ studentId: "debt" }] as never,
        recentPayments: [],
        packages: [],
      }).map((student) => student.id),
    ).toEqual(["active", "debt"]);
  });

  it("rejects package chronology that ends before purchase", () => {
    const result = FinanceActionSchema.safeParse({
      type: "createPackage",
      studentId: "22222222-2222-4222-8222-222222222222",
      name: "Pakiet",
      totalLessons: 8,
      priceGrosz: 0,
      currency: "PLN",
      purchasedAt: "2026-09-24T12:00:00.000Z",
      expiresAt: "2026-09-23T12:00:00.000Z",
      idempotencyKey: "package-test-key",
    });
    expect(result.success).toBe(false);
  });
});
