import { BookingEventTypeInputSchema } from "@/lib/validation";
import { currentTeacher } from "@/server/auth";
import {
  createBookingEventType,
  getOwnBookingEventTypes,
} from "@/server/booking-event-types";
import { ApiFailure, errorResponse } from "@/server/errors";

function rejectCrossSite(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
  }
}

export async function GET() {
  try {
    const teacher = await currentTeacher();
    if (!teacher)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Zaloguj się ponownie.",
      });
    return Response.json(await getOwnBookingEventTypes(teacher.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    rejectCrossSite(request);
    const teacher = await currentTeacher();
    if (!teacher)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Zaloguj się ponownie.",
      });
    const parsed = BookingEventTypeInputSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiFailure(400, {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message || "Sprawdź dane rodzaju zajęć.",
      });
    return Response.json(
      await createBookingEventType(teacher.id, parsed.data),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
