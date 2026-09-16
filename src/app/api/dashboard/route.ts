import { currentTeacherId } from "@/server/auth";
import { getTodayDashboard } from "@/server/dashboard-service";
import { ApiFailure, errorResponse } from "@/server/errors";

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
    return Response.json(await getTodayDashboard(teacherId));
  } catch (error) {
    return errorResponse(error);
  }
}
