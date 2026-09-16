import { describe, expect, it } from "vitest";
import {
  LessonCreateSchema,
  MoneySchema,
  PackageCreateSchema,
  StudentCreateSchema,
} from "./validation";

describe("centralized domain validation", () => {
  it("accepts integer grosz and rejects fractional money", () => {
    expect(
      MoneySchema.safeParse({ amount: 8000, currency: "PLN" }).success,
    ).toBe(true);
    expect(
      MoneySchema.safeParse({ amount: 79.999999, currency: "PLN" }).success,
    ).toBe(false);
  });

  it("validates student defaults in one schema", () => {
    const result = StudentCreateSchema.safeParse({
      name: "Zosia Kowalska",
      contact: "",
      level: "B1",
      goal: "",
      notes: "",
      status: "active",
      defaultDurationMinutes: 5,
      defaultFormat: "online",
      defaultLocation: "https://meet.example.test/zosia",
      defaultPrice: { amount: 8000, currency: "PLN" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects lessons without participants and unbounded recurring input", () => {
    const result = LessonCreateSchema.safeParse({
      participantIds: [],
      mode: "recurring",
      occurrences: [
        { startsAt: "2026-09-21T15:00:00.000Z", durationMinutes: 60 },
      ],
      format: "online",
      location: "https://meet.example.test/lesson",
      priceAmount: 8000,
      topic: "English B1",
      plan: [],
    });
    expect(result.success).toBe(false);
  });

  it("keeps package values in minor units", () => {
    expect(
      PackageCreateSchema.safeParse({
        workspaceId: "10000000-0000-4000-8000-000000000001",
        studentId: "20000000-0000-4000-8000-000000000001",
        name: "10 lekcji",
        totalLessons: 10,
        priceGrosz: 80000,
        currency: "PLN",
        purchasedAt: "2026-09-15T12:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
