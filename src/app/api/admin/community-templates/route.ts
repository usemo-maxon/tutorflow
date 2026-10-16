import { currentTeacherId } from "@/server/auth";
import { getCommunityModerationQueue } from "@/server/community-templates";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacherId = await currentTeacherId();
    if (!teacherId) unauthenticated();
    return Response.json({
      submissions: await getCommunityModerationQueue(teacherId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function unauthenticated(): never {
  throw new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Sesja wygasła. Zaloguj się ponownie.",
  });
}
