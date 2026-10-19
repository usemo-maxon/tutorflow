import { z } from "zod";
import { PRODUCT_TOUR_VERSION } from "@/lib/product-tour";
import { currentTeacherId } from "@/server/auth";
import { isSupabaseConfigured } from "@/server/env";
import { ApiFailure, errorResponse } from "@/server/errors";
import { createSupabaseServerClient } from "@/server/supabase";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum([
    "in_progress",
    "completed",
    "skipped",
    "invitation_dismissed",
  ]),
  currentStep: z.number().int().min(0).max(20),
  version: z.literal(PRODUCT_TOUR_VERSION),
});

const localStates = new Map<string, z.infer<typeof updateSchema>>();

export async function GET() {
  try {
    const userId = await requireUser();
    if (!isSupabaseConfigured()) {
      return noStore(localStates.get(userId) ?? emptyState());
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("product_tour_states")
      .select("version,status,current_step")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return noStore(
      data
        ? {
            version: data.version,
            status: data.status,
            currentStep: data.current_step,
          }
        : emptyState(),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const userId = await requireUser();
    const parsed = updateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new ApiFailure(422, {
        code: "INVALID_TOUR_STATE",
        message: "Nie udało się zapisać postępu przewodnika.",
      });
    }
    if (!isSupabaseConfigured()) {
      localStates.set(userId, parsed.data);
      return noStore(parsed.data);
    }
    const now = new Date().toISOString();
    const { error } = await (
      await createSupabaseServerClient()
    )
      .from("product_tour_states")
      .upsert(
        {
          user_id: userId,
          tour_key: "main",
          version: parsed.data.version,
          status: parsed.data.status,
          current_step: parsed.data.currentStep,
          started_at: parsed.data.status === "in_progress" ? now : undefined,
          completed_at: parsed.data.status === "completed" ? now : undefined,
          updated_at: now,
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return noStore(parsed.data);
  } catch (error) {
    return errorResponse(error);
  }
}

function emptyState() {
  return {
    version: PRODUCT_TOUR_VERSION,
    status: "not_started" as const,
    currentStep: 0,
  };
}

async function requireUser() {
  const userId = await currentTeacherId();
  if (!userId) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  return userId;
}

function noStore(body: unknown) {
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

function assertSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
  }
}
