import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./crypto", () => ({
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
}));
vi.mock("./supabase", () => ({ createSupabaseAdminClient: vi.fn() }));

import {
  googleApiRequest,
  googleEvent,
  googleEventStateHash,
  isRetryableGoogleStatus,
  lessonIdFromGoogleEvent,
  normalizeGoogleEventTiming,
} from "./google-calendar";

describe("Google Calendar outbound event", () => {
  const lesson = {
    id: "lesson-1",
    color: "#6F8FEF",
    startsAt: "2035-01-10T16:00:00.000Z",
    durationMinutes: 60,
    location: "https://meet.example.test/lesson",
    status: "scheduled" as const,
    topic: "Present Perfect",
  };

  beforeEach(() => vi.clearAllMocks());

  it("sends a provider colorId while preserving the easy4tutor event identity", () => {
    expect(googleEvent(lesson, ["Zosia"])).toMatchObject({
      colorId: "9",
      extendedProperties: {
        private: {
          easy4tutor: "true",
          easy4tutorLessonId: lesson.id,
          tutorflowLessonId: lesson.id,
        },
      },
    });
  });

  it("changes only the mapped color when a custom lesson color changes", () => {
    const original = googleEvent(lesson, ["Zosia"]);
    const recolored = googleEvent({ ...lesson, color: "#DC2127" }, ["Zosia"]);
    expect(recolored.colorId).toBe("11");
    expect(recolored.extendedProperties).toEqual(original.extendedProperties);
  });

  it("keeps visible descriptions free of internal lesson data", () => {
    const event = googleEvent(lesson, ["Zosia"]);
    expect(event.summary).toBe("Present Perfect");
    expect(event.description).toBe("Lekcja zaplanowana w easy4tutor");
    expect(event.description).not.toContain("Zosia");
  });

  it("recognizes current and legacy private event identity", () => {
    expect(
      lessonIdFromGoogleEvent({
        extendedProperties: {
          private: { easy4tutorLessonId: "lesson-current" },
        },
      }),
    ).toBe("lesson-current");
    expect(
      lessonIdFromGoogleEvent({
        extendedProperties: { private: { tutorflowLessonId: "lesson-old" } },
      }),
    ).toBe("lesson-old");
  });

  it("hashes only shared calendar state for loop prevention", () => {
    const event = {
      id: "provider-1",
      summary: "Lesson",
      start: { dateTime: "2035-01-10T16:00:00.000Z" },
      end: { dateTime: "2035-01-10T17:00:00.000Z" },
      etag: "etag-1",
    };
    expect(googleEventStateHash({ ...event, etag: "etag-2" })).toBe(
      googleEventStateHash(event),
    );
    expect(
      googleEventStateHash({
        ...event,
        start: { dateTime: "2035-01-10T17:00:00.000Z" },
      }),
    ).not.toBe(googleEventStateHash(event));
  });

  it("retries transient Google failures without retrying authorization errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: "event-1" }, { status: 200 }));
    const wait = vi.fn(async () => undefined);
    const response = await googleApiRequest(
      "token",
      "/events",
      {},
      {
        fetcher,
        wait,
      },
    );
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(isRetryableGoogleStatus(401)).toBe(false);
    expect(isRetryableGoogleStatus(502)).toBe(true);
  });

  it("keeps all-day Google dates separate from timed Lesson timestamps", () => {
    expect(
      normalizeGoogleEventTiming({
        id: "all-day",
        start: { date: "2035-03-29" },
        end: { date: "2035-03-31" },
      }),
    ).toEqual({
      allDay: true,
      startsAt: null,
      endsAt: null,
      startDate: "2035-03-29",
      endDate: "2035-03-31",
      timezone: null,
    });
  });

  it("normalizes offset date-times safely across DST", () => {
    expect(
      normalizeGoogleEventTiming({
        id: "dst",
        start: {
          dateTime: "2035-03-25T09:00:00+01:00",
          timeZone: "Europe/Warsaw",
        },
        end: {
          dateTime: "2035-03-25T10:00:00+01:00",
          timeZone: "Europe/Warsaw",
        },
      }),
    ).toMatchObject({
      allDay: false,
      startsAt: "2035-03-25T08:00:00.000Z",
      endsAt: "2035-03-25T09:00:00.000Z",
      timezone: "Europe/Warsaw",
    });
  });
});
