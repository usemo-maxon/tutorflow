import { profileMutationTeacher } from "@/server/public-profile-request";
import { uploadPublicPhoto } from "@/server/public-profile";
import { errorResponse, ApiFailure } from "@/server/errors";
export async function POST(request: Request) {
  try {
    const teacher = await profileMutationTeacher(request);
    const file = (await request.formData()).get("photo");
    if (!(file instanceof File))
      throw new ApiFailure(422, {
        code: "INVALID_PHOTO",
        message: "Wybierz zdjęcie.",
      });
    return Response.json({
      photoUrl: await uploadPublicPhoto(teacher.id, file),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
