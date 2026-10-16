import { currentTeacherId } from "@/server/auth";
import { getCommunityTemplateReports } from "@/server/community-templates";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacherId = await currentTeacherId();
    if (!teacherId)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    return Response.json({
      reports: await getCommunityTemplateReports(teacherId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
