import "server-only";
import type { Entitlements } from "@/lib/entitlements";
import { profileEditViolation } from "@/lib/profile-entitlements";
import type { TutorPublicProfile } from "@/lib/public-profile";
import { ApiFailure } from "./errors";

export function assertProfileEdits(
  next: TutorPublicProfile,
  previous: TutorPublicProfile | undefined,
  rights: Entitlements,
) {
  const capability = profileEditViolation(next, previous, rights);
  if (capability)
    throw new ApiFailure(403, {
      code: "PLAN_REQUIRED",
      message:
        "Ta zmiana wymaga planu Premium. Dotychczasowe ustawienia pozostają zapisane.",
      details: { capability },
    });
}

export function profileDatabaseFailure(error: {
  message: string;
  code?: string;
}): never {
  if (error.message.includes("PLAN_REQUIRED"))
    throw new ApiFailure(403, {
      code: "PLAN_REQUIRED",
      message: "Ta zmiana wymaga planu Premium.",
    });
  if (error.message.includes("PLAN_LIMIT_REACHED"))
    throw new ApiFailure(403, {
      code: "PLAN_LIMIT_REACHED",
      message:
        "Osiągnięto limit publikacji w Twoim planie. Ukryj inną pozycję lub wybierz Premium.",
    });
  if (error.code === "23505")
    throw new ApiFailure(409, {
      code: "SLUG_TAKEN",
      message: "Ten adres jest już zajęty.",
    });
  throw error;
}
