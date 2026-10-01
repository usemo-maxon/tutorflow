import { BookingAvailabilitySettingsSchema } from "@/lib/validation";
import { currentTeacher } from "@/server/auth";
import {
  getOwnBookingAvailabilitySettings,
  saveOwnBookingAvailabilitySettings,
} from "@/server/booking-availability";
import { ApiFailure, errorResponse } from "@/server/errors";

export async function GET() {
  try {
    const teacher = await currentTeacher();
    if (!teacher)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Zaloguj się ponownie.",
      });
    return Response.json(await getOwnBookingAvailabilitySettings(teacher.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
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
    const parsed = BookingAvailabilitySettingsSchema.safeParse(
      await request.json(),
    );
    if (!parsed.success)
      throw new ApiFailure(400, {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ?? "Sprawdź ustawienia dostępności.",
      });
    return Response.json(
      await saveOwnBookingAvailabilitySettings(teacher.id, parsed.data),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
