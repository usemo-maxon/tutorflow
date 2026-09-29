import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getStudentMemory } from "@/server/student-memory";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const teacherId = await currentTeacherId();
    if (!teacherId) {
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    }
    const { studentId } = await params;
    const memory = await getStudentMemory(teacherId, studentId);
    return Response.json(memory, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
