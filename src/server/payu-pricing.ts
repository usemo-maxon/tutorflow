import "server-only";

import { z } from "zod";
import type { BillingInterval } from "@/lib/domain";
import { checkoutPrice } from "@/lib/pricing";

const checkoutSchema = z
  .object({ plan: z.enum(["monthly", "annual"]) })
  .strict();

export function parseCheckoutProduct(input: unknown): BillingInterval | null {
  const parsed = checkoutSchema.safeParse(input);
  return parsed.success ? parsed.data.plan : null;
}

export function payuAmountForProduct(
  product: BillingInterval,
  founderEligible: boolean,
): number {
  return checkoutPrice(product, founderEligible);
}
