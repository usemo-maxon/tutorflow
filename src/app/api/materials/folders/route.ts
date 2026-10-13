import { MaterialFolderInputSchema } from "@/lib/materials";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { createMaterialFolder } from "@/server/materials";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const teacherId = await authenticatedTeacher();
    const parsed = MaterialFolderInputSchema.safeParse(await request.json());
    if (!parsed.success) validationError(parsed.error.issues[0]?.message);
    return Response.json(
      await createMaterialFolder(teacherId, parsed.data.name),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function validationError(message = "Podaj nazwę folderu."): never {
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
