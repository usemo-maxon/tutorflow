import "server-only";

import { randomUUID } from "node:crypto";
import type {
  BookingEventType,
  BookingEventTypeInput,
} from "@/lib/booking-event-types";
import { isSupabaseConfigured } from "./env";
import { mutateStore, queryStore } from "./store";
import { createSupabaseServerClient } from "./supabase";

type Row = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_grosz: number;
  currency: "PLN";
  format: "online" | "offline";
  is_active: boolean;
  is_public: boolean;
  display_order: number;
};

const normalize = (input: BookingEventTypeInput): BookingEventTypeInput => ({
  ...input,
  name: input.name.trim(),
  description: input.description?.trim() || undefined,
});

const mapRow = (row: Row): BookingEventType => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  durationMinutes: row.duration_minutes,
  priceGrosz: row.price_grosz,
  currency: row.currency,
  format: row.format,
  active: row.is_active,
  isPublic: row.is_public,
  displayOrder: row.display_order,
});

const withoutTeacherId = (
  item: import("./store").BookingEventTypeRecord,
): BookingEventType => ({
  id: item.id,
  name: item.name,
  description: item.description,
  durationMinutes: item.durationMinutes,
  priceGrosz: item.priceGrosz,
  currency: item.currency,
  format: item.format,
  active: item.active,
  isPublic: item.isPublic,
  displayOrder: item.displayOrder,
});

export async function getOwnBookingEventTypes(
  teacherId: string,
): Promise<BookingEventType[]> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
    return queryStore((store) =>
      (store.bookingEventTypes ?? [])
        .filter((item) => item.teacherId === teacherId)
        .map(withoutTeacherId)
        .sort(
          (a, b) =>
            a.displayOrder - b.displayOrder ||
            a.name.localeCompare(b.name, "pl"),
        ),
    );
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_event_types")
    .select(
      "id,name,description,duration_minutes,price_grosz,currency,format,is_active,is_public,display_order",
    )
    .eq("tutor_id", teacherId)
    .order("display_order")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as Row[]).map(mapRow);
}

export async function createBookingEventType(
  teacherId: string,
  input: BookingEventTypeInput,
): Promise<BookingEventType> {
  const eventType = normalize(input);
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
    return mutateStore((store) => {
      const types = (store.bookingEventTypes ??= []);
      const displayOrder =
        types
          .filter((item) => item.teacherId === teacherId)
          .reduce((max, item) => Math.max(max, item.displayOrder), -1) + 1;
      const created = {
        ...eventType,
        id: randomUUID(),
        teacherId,
        displayOrder,
      };
      types.push(created);
      return withoutTeacherId(created);
    });
  const supabase = await createSupabaseServerClient();
  const { data: tutor, error: tutorError } = await supabase
    .from("tutor_profiles")
    .select("workspace_id")
    .eq("user_id", teacherId)
    .single();
  if (tutorError || !tutor) throw new Error("NOT_FOUND");
  const displayOrder =
    (await getOwnBookingEventTypes(teacherId)).reduce(
      (max, item) => Math.max(max, item.displayOrder),
      -1,
    ) + 1;
  const { data, error } = await supabase
    .from("booking_event_types")
    .insert({
      workspace_id: tutor.workspace_id,
      tutor_id: teacherId,
      name: eventType.name,
      description: eventType.description ?? null,
      duration_minutes: eventType.durationMinutes,
      price_grosz: eventType.priceGrosz,
      currency: eventType.currency,
      format: eventType.format,
      is_active: eventType.active,
      is_public: eventType.isPublic,
      display_order: displayOrder,
    })
    .select(
      "id,name,description,duration_minutes,price_grosz,currency,format,is_active,is_public,display_order",
    )
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateBookingEventType(
  teacherId: string,
  eventTypeId: string,
  input: BookingEventTypeInput,
): Promise<BookingEventType> {
  const eventType = normalize(input);
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
    return mutateStore((store) => {
      const current = (store.bookingEventTypes ?? []).find(
        (item) => item.id === eventTypeId && item.teacherId === teacherId,
      );
      if (!current) throw new Error("NOT_FOUND");
      Object.assign(current, eventType);
      return withoutTeacherId(current);
    });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_event_types")
    .update({
      name: eventType.name,
      description: eventType.description ?? null,
      duration_minutes: eventType.durationMinutes,
      price_grosz: eventType.priceGrosz,
      currency: eventType.currency,
      format: eventType.format,
      is_active: eventType.active,
      is_public: eventType.isPublic,
      display_order: eventType.displayOrder,
    })
    .eq("id", eventTypeId)
    .eq("tutor_id", teacherId)
    .select(
      "id,name,description,duration_minutes,price_grosz,currency,format,is_active,is_public,display_order",
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
  return mapRow(data);
}

export async function deleteBookingEventType(
  teacherId: string,
  eventTypeId: string,
): Promise<void> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    await mutateStore((store) => {
      const types = store.bookingEventTypes ?? [];
      const index = types.findIndex(
        (item) => item.id === eventTypeId && item.teacherId === teacherId,
      );
      if (index < 0) throw new Error("NOT_FOUND");
      types.splice(index, 1);
    });
    return;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_event_types")
    .delete()
    .eq("id", eventTypeId)
    .eq("tutor_id", teacherId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
}
