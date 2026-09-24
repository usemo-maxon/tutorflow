import { describe, expect, it } from "vitest";
import { parseCheckoutProduct, payuAmountForProduct } from "./payu-pricing";

describe("PayU server pricing", () => {
  it("maps billing products to authoritative amounts", () => {
    expect(payuAmountForProduct("monthly", false)).toBe(4_499);
    expect(payuAmountForProduct("annual", false)).toBe(39_900);
    expect(payuAmountForProduct("monthly", true)).toBe(2_999);
  });

  it.each(["weekly", "lifetime", "founder", "enterprise"])(
    "rejects the unknown %s product",
    (plan) => expect(parseCheckoutProduct({ plan })).toBeNull(),
  );

  it("does not accept a client-controlled amount", () => {
    expect(parseCheckoutProduct({ plan: "monthly", amount: 1 })).toBeNull();
    expect(payuAmountForProduct("monthly", false)).toBe(4_499);
  });
});
