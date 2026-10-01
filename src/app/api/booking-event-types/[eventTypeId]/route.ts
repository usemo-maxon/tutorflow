import { z } from "zod";
import { BookingEventTypeInputSchema } from "@/lib/validation";
import { currentTeacher } from "@/server/auth";
import {
  deleteBookingEventType,
  updateBookingEventType,
} from "@/server/booking-event-types";
import { ApiFailure, errorResponse } from "@/server/errors";

type RouteProps = { params: Promise<{ eventTypeId: string }> };
const idSchema = z.uuid();

async function teacherForMutation(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
  const teacher = await currentTeacher();
  if (!teacher)
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Zaloguj się ponownie.",
    });
  return teacher;
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const teacher = await teacherForMutation(request);
    const eventTypeId = idSchema.safeParse((await params).eventTypeId);
    if (!eventTypeId.success)
      throw new ApiFailure(404, {
        code: "NOT_FOUND",
        message: "Nie znaleziono rodzaju zajęć.",
      });
    const parsed = BookingEventTypeInputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiFailure(400, {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message || "Sprawdź dane rodzaju zajęć.",
      });
    return Response.json(
      await updateBookingEventType(teacher.id, eventTypeId.data, parsed.data),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const teacher = await teacherForMutation(request);
    const eventTypeId = idSchema.safeParse((await params).eventTypeId);
    if (!eventTypeId.success)
      throw new ApiFailure(404, {
        code: "NOT_FOUND",
        message: "Nie znaleziono rodzaju zajęć.",
      });
    await deleteBookingEventType(teacher.id, eventTypeId.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
