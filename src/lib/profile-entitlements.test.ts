import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROFILE_PLAN_ENTITLEMENTS, resolveEntitlements } from "./entitlements";
import { defaultPublicProfile } from "./public-profile";
import {
  entitledPublicProfile,
  exceedsCertificatePublicationLimit,
  profileEditViolation,
  publishedProfileOffers,
} from "./profile-entitlements";

const free = resolveEntitlements({ tier: "free", status: "active" });
const premium = resolveEntitlements({ tier: "pro", status: "active" });
const profile = {
  ...defaultPublicProfile("Anna"),
  theme: "modern" as const,
  certificates: Array.from({ length: 3 }, (_, i) => ({
    id: String(i),
    title: `Certificate ${i}`,
    issuer: "School",
    visible: true,
  })),
};

describe("profile publication entitlements", () => {
  it("keeps the database registry identical to the application registry", () => {
    const sql = readFileSync(
      "supabase/migrations/20261019115436_public_profile_plan_publication.sql",
      "utf8",
    );
    expect(JSON.parse(sql.split("$registry$")[1])).toEqual(
      PROFILE_PLAN_ENTITLEMENTS,
    );
  });
  it("falls back to Free for expired paid profile access, but never for a verified owner", () => {
    expect(
      resolveEntitlements({ tier: "pro", status: "past_due" })
        .maxPublishedCertificates,
    ).toBe(1);
    expect(
      resolveEntitlements({
        tier: "free",
        status: "past_due",
        accessGrant: "owner_lifetime",
      }).maxPublishedCertificates,
    ).toBe(10);
  });
  it("downgrades the public projection without mutating saved content", () => {
    const projected = entitledPublicProfile(profile, free);
    expect(projected.theme).toBe("professional");
    expect(projected.certificates).toHaveLength(1);
    expect(profile.theme).toBe("modern");
    expect(profile.certificates).toHaveLength(3);
    expect(entitledPublicProfile(profile, premium).certificates).toHaveLength(
      3,
    );
  });
  it("does not reveal hidden content when resetting customization", () => {
    const hidden = {
      ...profile,
      sections: [
        { id: "certificates" as const, title: "Secret", visible: false },
      ],
    };
    expect(entitledPublicProfile(hidden, free).certificates ?? []).toHaveLength(
      0,
    );
  });
  it("preserves old premium settings but refuses new ones on Free", () => {
    expect(profileEditViolation(profile, profile, free)).toBeUndefined();
    expect(
      profileEditViolation({ ...profile, theme: "friendly" }, profile, free),
    ).toBe("advancedProfilePersonalization");
    expect(
      profileEditViolation(
        { ...profile, theme: "professional" },
        profile,
        free,
      ),
    ).toBeUndefined();
  });
  it("retains grandfathered certificates but rejects newly published excess", () => {
    expect(exceedsCertificatePublicationLimit(profile, profile, 1)).toBe(false);
    expect(exceedsCertificatePublicationLimit(profile, undefined, 1)).toBe(
      true,
    );
    expect(
      exceedsCertificatePublicationLimit(
        {
          ...profile,
          certificates: [
            ...profile.certificates,
            { id: "new", title: "New", issuer: "", visible: true },
          ],
        },
        profile,
        1,
      ),
    ).toBe(true);
  });
  it("selects offers deterministically without mutating the source", () => {
    const offers = ["c", "b", "a"].map((id) => ({
      id,
      name: id,
      active: true,
      isPublic: true,
      displayOrder: 0,
      durationMinutes: 60,
      priceGrosz: 100,
      currency: "PLN" as const,
      format: "online" as const,
    }));
    expect(publishedProfileOffers(offers, free).map((item) => item.id)).toEqual(
      ["a", "b"],
    );
    expect(offers.map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(publishedProfileOffers(offers, premium)).toHaveLength(3);
  });
});
