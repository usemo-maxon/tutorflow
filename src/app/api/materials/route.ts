import {
  materialFiltersFromSearchParams,
  materialFormInput,
  MaterialInputSchema,
} from "@/lib/materials";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { createMaterial, getMaterialsLibrary } from "@/server/materials";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const teacherId = await authenticatedTeacher();
    const filters = materialFiltersFromSearchParams(new URL(request.url).searchParams);
    return Response.json(await getMaterialsLibrary(teacherId, filters));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const teacherId = await authenticatedTeacher();
    const form = await request.formData();
    const parsed = MaterialInputSchema.safeParse(materialFormInput(form));
    if (!parsed.success) validationError(parsed.error.issues[0]?.message);
    const file = form.get("file");
    return Response.json(
      await createMaterial(
        teacherId,
        parsed.data,
        file instanceof File && file.size ? file : undefined,
      ),
      { status: 201 },
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
