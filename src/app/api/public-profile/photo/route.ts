import { currentTeacher } from "@/server/auth";
import { uploadPublicPhoto } from "@/server/public-profile";
import { errorResponse, ApiFailure } from "@/server/errors";
export async function POST(request: Request) {
  try { const teacher = await currentTeacher(); if (!teacher) throw new ApiFailure(401, { code: "UNAUTHENTICATED", message: "Zaloguj się ponownie." }); const file = (await request.formData()).get("photo"); if (!(file instanceof File)) throw new ApiFailure(422, { code: "INVALID_PHOTO", message: "Wybierz zdjęcie." }); return Response.json({ photoUrl: await uploadPublicPhoto(teacher.id, file) }); } catch (error) { return errorResponse(error); }
}
