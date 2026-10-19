import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultPublicProfile, profileContentKey } from "@/lib/public-profile";
import {
  cleanPublicProfile,
  getOwnPublicProfile,
  getPublishedTutorProfile,
  publishOwnPublicProfile,
  saveOwnPublicProfile,
  unpublishOwnPublicProfile,
} from "./public-profile";
import { parseProfileInput } from "./public-profile-request";
import { createTeacher } from "./store";

const directory = vi.hoisted(async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const directory = await mkdtemp(path.join(tmpdir(), "easy4tutor-profile-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  return directory;
});
let teacherId: string;
beforeAll(async () => {
  teacherId = (
    await createTeacher({
      name: "Anna Profil",
      email: "profile@example.test",
      password: "test-only-password",
    })
  ).id;
});
afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    (await directory) &&
    path
      .resolve(await directory)
      .startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(await directory).startsWith("easy4tutor-profile-")
  )
    await rm(await directory, { recursive: true });
});

describe("profile publication boundary", () => {
  it("persists drafts, publishes explicitly, redacts hidden content and preserves the published URL", async () => {
    const input = {
      ...defaultPublicProfile("Anna Profil"),
      headline: "Matematyka bez stresu",
      subjects: ["Matematyka"],
      certificates: [
        {
          id: "secret",
          title: "PRIVATE DOCUMENT",
          issuer: "Private",
          visible: false,
        },
      ],
      faq: [{ id: "unfinished", question: "Jak", answer: "", visible: true }],
    };
    await saveOwnPublicProfile(teacherId, "Anna", input);
    expect(await getPublishedTutorProfile("anna-profil")).toBeNull();
    const draft = await getOwnPublicProfile(teacherId, "Anna");
    expect(draft.faq).toHaveLength(1);
    expect(draft.faq?.[0].question).toBe("Jak");
    await publishOwnPublicProfile(teacherId, "Anna", { ...input, faq: [] });
    expect(
      (await getOwnPublicProfile(teacherId, "Anna")).hasUnpublishedChanges,
    ).toBe(false);
    const publicProfile = await getPublishedTutorProfile("anna-profil");
    expect(publicProfile?.certificates).toEqual([]);
    expect(JSON.stringify(publicProfile)).not.toContain("PRIVATE");
    await saveOwnPublicProfile(teacherId, "Anna", {
      ...input,
      slug: "anna-nowy-adres",
      headline: "New draft headline",
    });
    const next = await getOwnPublicProfile(teacherId, "Anna");
    expect(next.publishedSlug).toBe("anna-profil");
    expect(next.hasUnpublishedChanges).toBe(true);
    expect((await getPublishedTutorProfile("anna-profil"))?.headline).toBe(
      "Matematyka bez stresu",
    );
    await unpublishOwnPublicProfile(teacherId);
    expect(await getPublishedTutorProfile("anna-profil")).toBeNull();
    expect((await getOwnPublicProfile(teacherId, "Anna")).headline).toBe(
      "New draft headline",
    );
  });

  it("never keeps a foreign or malformed media path", () => {
    const profile = defaultPublicProfile("Anna Profil");
    const clean = cleanPublicProfile(
      {
        ...profile,
        certificates: [
          {
            id: "bad",
            title: "Bad",
            issuer: "",
            visible: true,
            storagePath:
              "00000000-0000-0000-0000-000000000000/certificate/00000000-0000-0000-0000-000000000000.pdf",
          },
        ],
        video: {
          source: "upload",
          title: "Bad",
          storagePath: `${teacherId}/../private.mp4`,
        },
      },
      teacherId,
    );
    expect(clean.video).toBeUndefined();
    expect(clean.certificates?.[0].storagePath).toBeUndefined();
  });
});

describe("profile input and dirty-state validation", () => {
  it.each([
    null,
    [],
    { ...defaultPublicProfile("Anna Profil"), certificates: "not-an-array" },
    {
      ...defaultPublicProfile("Anna Profil"),
      timeline: [
        {
          id: "a",
          kind: "experience",
          title: "A",
          institution: "B",
          startYear: -1,
        },
      ],
    },
  ])("rejects invalid input with a usable validation error", (input) => {
    expect(() => parseProfileInput(input)).toThrowError(
      expect.objectContaining({
        status: 422,
        body: expect.objectContaining({ code: "VALIDATION_ERROR" }),
      }),
    );
  });
  it("does not trust client URLs or compare temporary URLs as edits", () => {
    const profile = {
      ...defaultPublicProfile("Anna Profil"),
      video: {
        source: "upload" as const,
        title: "Hello",
        storagePath: `${teacherId}/video/00000000-0000-0000-0000-000000000000.mp4`,
        url: "https://example.test/temp",
      },
    };
    expect(parseProfileInput(profile).video).not.toHaveProperty("url");
    expect(profileContentKey(profile)).toBe(
      profileContentKey({
        ...profile,
        enabled: true,
        publishedSlug: "anna-profil",
        draftUpdatedAt: "later",
        video: { ...profile.video, url: "https://example.test/new" },
      }),
    );
    expect(profileContentKey(profile)).not.toBe(
      profileContentKey({ ...profile, headline: "Changed" }),
    );
  });
});
