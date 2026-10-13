import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getMaterialFileTarget } from "@/server/materials";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ materialId: string }> },
) {
  try {
    const teacherId = await currentTeacherId();
    if (!teacherId) {
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    }
    const { materialId } = await params;
    return Response.redirect(
      await getMaterialFileTarget(teacherId, materialId),
      307,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
