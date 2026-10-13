import { materialFormInput, MaterialInputSchema } from "@/lib/materials";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { archiveMaterial, updateMaterial } from "@/server/materials";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ materialId: string }> },
) {
  try {
    assertSameOrigin(request);
    const teacherId = await authenticatedTeacher();
    const { materialId } = await params;
    if (request.headers.get("content-type")?.includes("application/json")) {
      const action = (await request.json()) as { action?: unknown };
      if (action.action !== "archive") validationError();
      return Response.json(await archiveMaterial(teacherId, materialId));
    }
    const form = await request.formData();
    const parsed = MaterialInputSchema.safeParse(materialFormInput(form));
    if (!parsed.success) validationError(parsed.error.issues[0]?.message);
    const file = form.get("file");
    return Response.json(
      await updateMaterial(
        teacherId,
        materialId,
        parsed.data,
        file instanceof File && file.size ? file : undefined,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function validationError(message = "Sprawdź dane materiału."): never {
  throw new ApiFailure(422, { code: "VALIDATION_ERROR", message });
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
