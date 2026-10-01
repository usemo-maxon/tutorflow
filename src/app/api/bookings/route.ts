import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { listTutorBookings } from "@/server/booking-lifecycle";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacherId = await currentTeacherId();
    if (!teacherId) {
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    }
    return Response.json(await listTutorBookings(teacherId));
  } catch (error) {
    return errorResponse(error);
  }
}
