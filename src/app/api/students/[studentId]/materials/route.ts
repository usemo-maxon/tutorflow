import { z } from "zod";
import { MaterialAssignmentInputSchema } from "@/lib/context-materials";
import { currentTeacherId } from "@/server/auth";
import {
  assignContextMaterial,
  getStudentMaterials,
  removeContextMaterial,
} from "@/server/context-materials";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const teacherId = await authenticatedTeacher();
    const studentId = parseUuid((await params).studentId);
    return Response.json(await getStudentMaterials(teacherId, studentId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    assertSameOrigin(request);
    const teacherId = await authenticatedTeacher();
    const studentId = parseUuid((await params).studentId);
    const parsed = MaterialAssignmentInputSchema.safeParse(
      await request.json(),
    );
    if (!parsed.success) validationError();
    const { materialId } = parsed.data;
    return Response.json(
      await assignContextMaterial(teacherId, "student", studentId, materialId),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    assertSameOrigin(request);
    const teacherId = await authenticatedTeacher();
    const studentId = parseUuid((await params).studentId);
    const materialId = parseUuid(
      new URL(request.url).searchParams.get("materialId"),
    );
    return Response.json(
      await removeContextMaterial(teacherId, "student", studentId, materialId),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function authenticatedTeacher() {
  const teacherId = await currentTeacherId();
  if (!teacherId) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  return teacherId;
}
function assertSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
  }
}
function parseUuid(value: unknown) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) validationError();
  return parsed.data;
}
function validationError(): never {
  throw new ApiFailure(422, {
    code: "VALIDATION_ERROR",
    message: "Wybierz poprawny materiał.",
  });
}
