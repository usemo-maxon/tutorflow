import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getStudentMemory } from "@/server/student-memory";
import { updateStudentHomework } from "@/server/student-memory";
import { StudentHomeworkUpdateSchema } from "@/lib/homework";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiFailure(403, {
        code: "CROSS_SITE_REQUEST",
        message: "Żądanie zostało odrzucone.",
      });
    }
    const teacherId = await currentTeacherId();
    if (!teacherId) {
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    }
    const parsed = StudentHomeworkUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: "Sprawdź status i informację zwrotną.",
      });
    }
    const { studentId } = await params;
    return Response.json(
      await updateStudentHomework(teacherId, studentId, parsed.data),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
