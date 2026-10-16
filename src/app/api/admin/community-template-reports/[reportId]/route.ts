import { z } from "zod";
import { ResolveReportInputSchema } from "@/lib/community-quality";
import { currentTeacherId } from "@/server/auth";
import { resolveCommunityTemplateReport } from "@/server/community-templates";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new ApiFailure(403, {
        code: "CROSS_SITE_REQUEST",
        message: "Żądanie zostało odrzucone.",
      });
    const teacherId = await currentTeacherId();
    if (!teacherId)
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    const reportId = z.uuid().safeParse((await params).reportId);
    const input = ResolveReportInputSchema.safeParse(await request.json());
    if (!reportId.success || !input.success)
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: input.success
          ? "Nieprawidłowe zgłoszenie."
          : (input.error.issues[0]?.message ?? "Sprawdź dane."),
      });
    return Response.json(
      await resolveCommunityTemplateReport(
        teacherId,
        reportId.data,
        input.data.action,
        input.data.reason,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
