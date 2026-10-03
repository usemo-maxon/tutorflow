import { currentTeacher } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getOwnPublicBookingAnalytics } from "@/server/public-booking-analytics";

export async function GET(request: Request) {
  try {
    const teacher = await currentTeacher();
    if (!teacher)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Zaloguj się ponownie.",
      });
    const value = new URL(request.url).searchParams.get("days");
    const days =
      value === "7" || value === "90" ? (Number(value) as 7 | 90) : 30;
    return Response.json(await getOwnPublicBookingAnalytics(teacher.id, days));
  } catch (error) {
    return errorResponse(error);
  }
}
