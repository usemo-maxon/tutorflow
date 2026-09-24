import { z } from "zod";

export type FinancialStatus = "open" | "partial" | "settled" | "cancelled";
export type FinancialPaymentMethod =
  "cash" | "bank_transfer" | "card_external" | "other";

export interface FinancialCharge {
  id: string;
  studentId: string;
  studentName: string;
  lessonId?: string;
  packageId?: string;
  type: "lesson" | "package" | "manual";
  description: string;
  amount: number;
  allocated: number;
  outstanding: number;
  currency: string;
  status: FinancialStatus;
  dueAt?: string;
  createdAt: string;
  settledAt?: string;
  overdue: boolean;
}

export interface FinancialPayment {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  allocated: number;
  unallocated: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded" | "cancelled";
  method?: FinancialPaymentMethod;
  note?: string;
  paidAt?: string;
  createdAt: string;
}

export interface FinancialPackage {
  id: string;
  studentId: string;
  studentName: string;
  name: string;
  totalLessons: number;
  usedLessons: number;
  remainingLessons: number;
  price: number;
  currency: string;
  status: "active" | "exhausted" | "expired" | "cancelled";
  purchasedAt: string;
  expiresAt?: string;
  paymentOutstanding: number;
  usage: Array<{
    id: string;
    lessonId: string;
    lessonLabel: string;
    kind: "consumption" | "reversal";
    units: number;
    createdAt: string;
  }>;
}

export interface FinancialOverview {
  workspace: { currency: string; timezone: string; dueDays: number };
  students: Array<{
    id: string;
    name: string;
    currency: string;
    status: "active" | "archived";
    canRecordPayment: boolean;
  }>;
  summary: {
    outstanding: number;
    overdue: number;
    receivedThisMonth: number;
    currency: string;
  };
  openCharges: FinancialCharge[];
  recentPayments: FinancialPayment[];
  packages: FinancialPackage[];
  nextPaymentCursor?: number;
  scopeStudentId?: string;
}

const entityId = z.string().uuid();
const currency = z.string().regex(/^[A-Z]{3}$/);
const minorUnits = z.number().int().safe().positive();

export const FinanceActionSchema = z
  .discriminatedUnion("type", [
  z.object({
    type: z.literal("recordPayment"),
    studentId: entityId,
    amountGrosz: minorUnits,
    currency,
    paidAt: z.string().datetime(),
    paymentMethod: z.enum(["cash", "bank_transfer", "card_external", "other"]),
    note: z.string().trim().max(500).optional(),
    allocations: z
      .array(
        z.object({
          chargeId: entityId,
          amountGrosz: minorUnits,
        }),
      )
      .max(100),
    idempotencyKey: z.string().trim().min(8).max(200),
  }),
  z.object({
    type: z.literal("createPackage"),
    studentId: entityId,
    name: z.string().trim().min(1).max(180),
    totalLessons: z.number().int().positive().max(1_000),
    priceGrosz: z.number().int().safe().nonnegative(),
    currency,
    purchasedAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(200),
  }),
  ])
  .superRefine((action, context) => {
    if (
      action.type === "createPackage" &&
      action.expiresAt &&
      Date.parse(action.expiresAt) < Date.parse(action.purchasedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Data ważności nie może poprzedzać daty zakupu.",
      });
    }
  });

export type FinanceAction = z.infer<typeof FinanceActionSchema>;

export function suggestedAllocations(
  paymentAmount: number,
  charges: Array<
    Pick<FinancialCharge, "id" | "outstanding" | "dueAt" | "createdAt">
  >,
) {
  let remaining = paymentAmount;
  return [...charges]
    .filter((charge) => charge.outstanding > 0)
    .sort(
      (a, b) =>
        (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .flatMap((charge) => {
      if (remaining <= 0) return [];
      const amountGrosz = Math.min(remaining, charge.outstanding);
      remaining -= amountGrosz;
      return [{ chargeId: charge.id, amountGrosz }];
    });
}

export function sumMinorUnits(values: number[]) {
  return values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value)) throw new Error("UNSAFE_MONEY_VALUE");
    const next = sum + value;
    if (!Number.isSafeInteger(next)) throw new Error("UNSAFE_MONEY_TOTAL");
    return next;
  }, 0);
}

export function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const amount = whole * 100 + fraction;
  return Number.isSafeInteger(amount) ? amount : null;
}

export function paymentPage<T>(
  rawRows: T[],
  cursor: number,
  pageSize = 20,
) {
  const hasMore = rawRows.length > pageSize;
  return {
    items: rawRows.slice(0, pageSize),
    nextCursor: hasMore ? cursor + pageSize : undefined,
  };
}

export function paymentStudentCandidates(
  overview: Pick<
    FinancialOverview,
    "students" | "openCharges" | "recentPayments" | "packages"
  >,
) {
  return overview.students.filter((student) => student.canRecordPayment);
}
