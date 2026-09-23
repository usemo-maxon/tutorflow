import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiFailure } from "./errors";

let directory: string;
let store: typeof import("./store");
let performAction: typeof import("./app-service").performAction;
let completeOnboarding: typeof import("./onboarding").completeOnboarding;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "tutorflow-onboarding-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  store = await import("./store");
  performAction = (await import("./app-service")).performAction;
  completeOnboarding = (await import("./onboarding")).completeOnboarding;
});

afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith("tutorflow-onboarding-")
  ) {
    await rm(directory, { recursive: true });
  }
});

describe("local onboarding persistence", () => {
  it("creates new local accounts as incomplete and the demo as complete", async () => {
    const teacher = await store.createTeacher({
      name: "Nowy Tutor",
      email: "new-local@example.test",
      password: "test-only-password",
    });
    const demo = await store.ensureDemoTeacher();
    expect(teacher.onboardingCompletedAt).toBeUndefined();
    expect(demo.onboardingCompletedAt).toBeTruthy();
  });

  it("validates real local data and preserves the first completion timestamp", async () => {
    const teacher = await store.createTeacher({
      name: "Anna Kowalska",
      email: "complete-local@example.test",
      password: "test-only-password",
    });

    await expect(completeOnboarding(teacher.id)).rejects.toMatchObject<
      Partial<ApiFailure>
    >({ status: 409 });

    const student = await performAction(teacher.id, {
      type: "createStudent",
      student: {
        firstName: "Jan",
        lastName: "Uczeń",
        email: "",
        phone: "",
        subject: "Matematyka",
        level: "Liceum",
      },
    });
    await performAction(teacher.id, {
      type: "createLesson",
      lesson: {
        participantIds: [student.result!.id!],
        mode: "single",
        occurrences: [
          { startsAt: "2035-09-24T10:00:00.000Z", durationMinutes: 60 },
        ],
        format: "online",
        location: "https://meet.example.test/first",
        priceAmount: null,
        topic: "Pierwsza lekcja",
        plan: [],
        allowOutsideAvailability: true,
      },
    });

    const first = await completeOnboarding(teacher.id);
    const second = await completeOnboarding(teacher.id);
    expect(first.alreadyCompleted).toBe(false);
    expect(second).toEqual({
      completedAt: first.completedAt,
      alreadyCompleted: true,
    });
  });
});
