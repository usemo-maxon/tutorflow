import { z } from "zod";
import { currentTeacherId } from "@/server/auth";
import {
  convertTutorBooking,
  getTutorBooking,
} from "@/server/booking-lifecycle";
import { ApiFailure, errorResponse } from "@/server/errors";

export const runtime = "nodejs";

const conversionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), studentId: z.string().uuid() }),
  z.object({
    mode: z.literal("new"),
    student: z.object({
      firstName: z.string().trim().min(1).max(120),
      lastName: z.string().trim().max(120),
      email: z.union([z.literal(""), z.string().trim().email().max(255)]),
      phone: z.string().trim().max(50),
      level: z.string().trim().max(80),
      goal: z.string().trim().max(500),
    }),
  }),
]);

async function authenticatedTeacherId(): Promise<string> {
  const teacherId = await currentTeacherId();
  if (!teacherId) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  return teacherId;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const teacherId = await authenticatedTeacherId();
    const { bookingId } = await params;
    return Response.json(await getTutorBooking(teacherId, bookingId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiFailure(403, {
        code: "CROSS_SITE_REQUEST",
        message: "Żądanie zostało odrzucone.",
      });
    }
    const teacherId = await authenticatedTeacherId();
    const parsed = conversionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiFailure(422, {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Sprawdź podane dane.",
      });
    }
    const { bookingId } = await params;
    return Response.json(
      await convertTutorBooking(teacherId, bookingId, parsed.data),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
