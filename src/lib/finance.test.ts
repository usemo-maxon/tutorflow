import { describe, expect, it } from "vitest";
import {
  parseMoneyInput,
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
    expect(parseMoneyInput("160,50")).toBe(16_050);
    expect(parseMoneyInput("80")).toBe(8_000);
    expect(parseMoneyInput("10.999")).toBeNull();
  });
});
