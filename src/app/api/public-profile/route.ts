import { currentTeacher } from "@/server/auth";
import { getOwnPublicProfile, publishOwnPublicProfile, saveOwnPublicProfile, unpublishOwnPublicProfile } from "@/server/public-profile";
import { errorResponse, ApiFailure } from "@/server/errors";

function rejectCrossSite(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ApiFailure(403, { code: "CROSS_SITE_REQUEST", message: "Żądanie zostało odrzucone." });
}
export async function GET() {
  try { const teacher = await currentTeacher(); if (!teacher) throw new ApiFailure(401, { code: "UNAUTHENTICATED", message: "Zaloguj się ponownie." }); return Response.json(await getOwnPublicProfile(teacher.id, teacher.name)); } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try { rejectCrossSite(request); const teacher = await currentTeacher(); if (!teacher) throw new ApiFailure(401, { code: "UNAUTHENTICATED", message: "Zaloguj się ponownie." }); return Response.json(await saveOwnPublicProfile(teacher.id, teacher.name, await request.json())); } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try { rejectCrossSite(request); const teacher = await currentTeacher(); if (!teacher) throw new ApiFailure(401, { code: "UNAUTHENTICATED", message: "Zaloguj się ponownie." }); return Response.json(await publishOwnPublicProfile(teacher.id, teacher.name, await request.json())); } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try { rejectCrossSite(request); const teacher = await currentTeacher(); if (!teacher) throw new ApiFailure(401, { code: "UNAUTHENTICATED", message: "Zaloguj się ponownie." }); await unpublishOwnPublicProfile(teacher.id); return new Response(null, { status: 204 }); } catch (error) { return errorResponse(error); }
}
