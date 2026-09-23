import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StudentCreateInput, SubscriptionTier } from "@/lib/domain";

let storage: typeof import("./store");
let perform: typeof import("./app-service").performAction;
let directory: string;

const student = (number: number): StudentCreateInput => ({
  firstName: `Uczeń ${number}`,
  lastName: "Limit",
  email: `student-${number}@example.test`,
  phone: "",
  subject: "Angielski",
  level: "B1",
});

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "tutorflow-entitlements-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  storage = await import("./store");
  perform = (await import("./app-service")).performAction;
});

afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith("tutorflow-entitlements-")
  ) {
    await rm(directory, { recursive: true });
  }
});

async function createTeacher(
  label: string,
  status: "active" | "trial",
  tier: SubscriptionTier,
) {
  const teacher = await storage.createTeacher({
    name: label,
    email: `${label}@example.test`,
    password: "test-only-password",
  });
  await storage.mutateStore((store) => {
    Object.assign(
      store.teachers.find((item) => item.id === teacher.id)!.subscription,
      { status, tier },
    );
  });
  return teacher.id;
}

describe("active student entitlements", () => {
  it("allows the first three Free students, blocks the fourth, and allows another after archiving", async () => {
    const teacherId = await createTeacher("free-limit", "active", "free");
    const ids: string[] = [];
    for (const number of [1, 2, 3]) {
      const response = await perform(teacherId, {
        type: "createStudent",
        student: student(number),
      });
      ids.push(response.result!.id!);
    }
    await expect(
      perform(teacherId, { type: "createStudent", student: student(4) }),
    ).rejects.toMatchObject({
      status: 403,
      body: { code: "PLAN_LIMIT_REACHED" },
    });

    await perform(teacherId, {
      type: "setStudentStatus",
      studentId: ids[0],
      status: "archived",
    });
    await expect(
      perform(teacherId, { type: "createStudent", student: student(5) }),
    ).resolves.toBeDefined();
  });

  it("blocks restoring an archived student when Free already has three active students", async () => {
    const teacherId = await createTeacher("free-restore", "trial", "free");
    const ids: string[] = [];
    for (const number of [1, 2, 3, 4]) {
      ids.push(
        (
          await perform(teacherId, {
            type: "createStudent",
            student: student(number),
          })
        ).result!.id!,
      );
    }
    await perform(teacherId, {
      type: "setStudentStatus",
      studentId: ids[3],
      status: "archived",
    });
    await storage.mutateStore((store) => {
      const subscription = store.teachers.find(
        (item) => item.id === teacherId,
      )!.subscription;
      subscription.status = "active";
    });
    await expect(
      perform(teacherId, {
        type: "setStudentStatus",
        studentId: ids[3],
        status: "active",
      }),
    ).rejects.toMatchObject({
      body: { code: "PLAN_LIMIT_REACHED" },
    });
  });

  it("preserves an existing over-limit Free account but blocks further growth", async () => {
    const teacherId = await createTeacher(
      "free-grandfathered",
      "trial",
      "free",
    );
    const ids: string[] = [];
    for (const number of [1, 2, 3, 4]) {
      ids.push(
        (
          await perform(teacherId, {
            type: "createStudent",
            student: student(number),
          })
        ).result!.id!,
      );
    }
    await storage.mutateStore((store) => {
      store.teachers.find(
        (item) => item.id === teacherId,
      )!.subscription.status = "active";
    });
    expect(
      (await storage.getAppData(teacherId)).students.filter(
        (item) => item.status === "active",
      ),
    ).toHaveLength(4);
    await expect(
      perform(teacherId, { type: "createStudent", student: student(5) }),
    ).rejects.toMatchObject({ body: { code: "PLAN_LIMIT_REACHED" } });
    await expect(
      perform(teacherId, {
        type: "setStudentStatus",
        studentId: ids[0],
        status: "archived",
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ["trial", "free"],
    ["active", "pro"],
    ["active", "founder"],
  ] as const)("allows a fourth student for %s/%s", async (status, tier) => {
    const teacherId = await createTeacher(`${status}-${tier}`, status, tier);
    for (const number of [1, 2, 3, 4]) {
      await expect(
        perform(teacherId, { type: "createStudent", student: student(number) }),
      ).resolves.toBeDefined();
    }
  });
});
