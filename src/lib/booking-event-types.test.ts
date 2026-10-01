import { describe, expect, it } from "vitest";
import {
  formatEventTypePrice,
  priceInputToGrosz,
  toPublicBookingEventType,
  type BookingEventType,
} from "./booking-event-types";
import { BookingEventTypeInputSchema } from "./validation";

const eventType: BookingEventType = {
  id: "event-type-1",
  name: "Pierwsze spotkanie",
  description: "Poznajmy się.",
  durationMinutes: 30,
  priceGrosz: 0,
  currency: "PLN",
  format: "online",
  active: true,
  isPublic: true,
  displayOrder: 2,
};

describe("booking event types", () => {
  it("supports free lesson types in safe integer grosz", () => {
    expect(priceInputToGrosz("0")).toBe(0);
    expect(formatEventTypePrice(0)).toBe("Bezpłatnie");
    expect(
      BookingEventTypeInputSchema.safeParse({
        name: eventType.name,
        description: eventType.description,
        durationMinutes: eventType.durationMinutes,
        priceGrosz: eventType.priceGrosz,
        currency: eventType.currency,
        format: eventType.format,
        active: eventType.active,
        isPublic: eventType.isPublic,
        displayOrder: eventType.displayOrder,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid duration and price", () => {
    expect(
      BookingEventTypeInputSchema.safeParse({
        ...eventType,
        durationMinutes: 0,
      }),
    ).toMatchObject({ success: false });
    expect(
      BookingEventTypeInputSchema.safeParse({ ...eventType, priceGrosz: -1 }),
    ).toMatchObject({ success: false });
    expect(priceInputToGrosz("20.999")).toBeNull();
  });

  it("exposes only safe fields in the public DTO", () => {
    expect(toPublicBookingEventType(eventType)).toEqual({
      id: "event-type-1",
      name: "Pierwsze spotkanie",
      description: "Poznajmy się.",
      durationMinutes: 30,
      priceGrosz: 0,
      currency: "PLN",
      format: "online",
    });
  });
});
