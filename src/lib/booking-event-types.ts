export type BookingEventFormat = "online" | "offline";

export type BookingEventTypeInput = {
  name: string;
  description?: string;
  durationMinutes: number;
  priceGrosz: number;
  currency: "PLN";
  format: BookingEventFormat;
  active: boolean;
  isPublic: boolean;
  displayOrder: number;
};

export type BookingEventType = BookingEventTypeInput & { id: string };

// Deliberately excludes workspace, tutor, publication and ordering internals.
export type PublicBookingEventType = Pick<
  BookingEventType,
  | "id"
  | "name"
  | "description"
  | "durationMinutes"
  | "priceGrosz"
  | "currency"
  | "format"
>;

export const EMPTY_BOOKING_EVENT_TYPE: BookingEventTypeInput = {
  name: "",
  description: "",
  durationMinutes: 60,
  priceGrosz: 0,
  currency: "PLN",
  format: "online",
  active: true,
  isPublic: true,
  displayOrder: 0,
};

export function toPublicBookingEventType(
  eventType: BookingEventType,
): PublicBookingEventType {
  const {
    id,
    name,
    description,
    durationMinutes,
    priceGrosz,
    currency,
    format,
  } = eventType;
  return {
    id,
    name,
    description,
    durationMinutes,
    priceGrosz,
    currency,
    format,
  };
}

export function formatEventTypePrice(
  priceGrosz: number,
  currency = "PLN",
): string {
  if (priceGrosz === 0) return "Bezpłatnie";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: priceGrosz % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceGrosz / 100);
}

/** Converts a Polish decimal input to integer grosz without storing a float. */
export function priceInputToGrosz(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const amount = whole * 100 + fraction;
  return Number.isSafeInteger(amount) ? amount : null;
}

export function groszToPriceInput(priceGrosz: number): string {
  return (priceGrosz / 100).toFixed(priceGrosz % 100 === 0 ? 0 : 2);
}
