import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getOwnCommunitySubmissions } from "@/server/community-templates";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacherId = await currentTeacherId();
    if (!teacherId) unauthenticated();
    return Response.json({
      submissions: await getOwnCommunitySubmissions(teacherId),
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
