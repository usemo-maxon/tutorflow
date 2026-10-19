import type { Entitlements } from "./entitlements";
import type { BookingEventType } from "./booking-event-types";
import {
  DEFAULT_PROFILE_SECTIONS,
  defaultPublicProfile,
  visiblePublicProfile,
  type TutorPublicProfile,
  type PublicTutorProfile,
} from "./public-profile";

export function publishedProfileOffers<T extends BookingEventType>(
  offers: T[],
  entitlements: Entitlements,
): T[] {
  return offers
    .filter((item) => item.active && item.isPublic)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
    .slice(0, entitlements.maxPublishedLessonOffers ?? 500);
}

export function entitledPublicProfile<
  T extends TutorPublicProfile | PublicTutorProfile,
>(input: T, entitlements: Entitlements): T {
  // Privacy comes first: downgrading a theme must not reveal previously hidden sections.
  const profile = visiblePublicProfile(input);
  return {
    ...profile,
    certificates: profile.certificates?.slice(
      0,
      entitlements.maxPublishedCertificates,
    ),
    video:
      profile.video?.source === "upload" &&
      !entitlements.hostedIntroductionVideo
        ? undefined
        : profile.video,
    ...(!entitlements.advancedProfilePersonalization
      ? {
          theme: "professional" as const,
          accentColor: "#137d60",
          heroLayout: "portrait" as const,
          coverUrl: undefined,
          sections: DEFAULT_PROFILE_SECTIONS.map((section) => ({
            ...section,
            visible:
              input.sections?.find((item) => item.id === section.id)
                ?.visible !== false,
          })),
        }
      : {}),
  };
}

export function profileEditViolation(
  next: TutorPublicProfile,
  previous: TutorPublicProfile | undefined,
  entitlements: Entitlements,
): string | undefined {
  const defaults = defaultPublicProfile(next.publicName);
  const prior = previous ?? defaults;
  if (!entitlements.advancedProfilePersonalization) {
    for (const key of [
      "theme",
      "accentColor",
      "heroLayout",
      "coverUrl",
      "sections",
    ] as const) {
      const value = next[key] ?? defaults[key];
      if (
        JSON.stringify(value) !== JSON.stringify(prior[key] ?? defaults[key]) &&
        JSON.stringify(value) !== JSON.stringify(defaults[key])
      )
        return "advancedProfilePersonalization";
    }
  }
  if (
    !entitlements.hostedIntroductionVideo &&
    next.video?.source === "upload" &&
    JSON.stringify(next.video) !== JSON.stringify(prior.video)
  )
    return "hostedIntroductionVideo";
  return undefined;
}

export function exceedsCertificatePublicationLimit(
  next: TutorPublicProfile,
  previousPublished: TutorPublicProfile | undefined,
  limit: number,
): boolean {
  const visible = next.certificates?.filter((item) => item.visible) ?? [];
  if (visible.length <= limit) return false;
  const previous =
    previousPublished?.certificates?.filter((item) => item.visible) ?? [];
  // Existing excess records survive a downgrade. Newly enabled records require capacity.
  return (
    visible.length > previous.length ||
    visible.some(
      (item) =>
        !previous.some(
          (old) => old.id === item.id && old.storagePath === item.storagePath,
        ),
    )
  );
}
