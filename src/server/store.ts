import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { addDays, addMinutes } from "date-fns";
import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type {
  AppData,
  AvailabilityException,
  AvailabilityRule,
  CalendarBlock,
  ExternalGoogleEvent,
  Lesson,
  LessonParticipant,
  PlanItem,
  Student,
  StudentContact,
  StudentGroup,
  StudentStatImport,
  Teacher,
} from "@/lib/domain";
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar-colors";

export interface TeacherRecord extends Teacher {
  passwordHash: string;
  google: AppData["integrations"]["google"];
  telegram: AppData["integrations"]["telegram"];
  payu: AppData["integrations"]["payu"];
  demo?: boolean;
}

export interface StudentRecord extends Student {
  teacherId: string;
}

export interface StudentContactRecord extends StudentContact {
  teacherId: string;
}

export interface StudentGroupRecord extends StudentGroup {
  teacherId: string;
}

export interface LessonRecord extends Lesson {
  teacherId: string;
}

export interface AvailabilityRecord extends AvailabilityRule {
  teacherId: string;
}

export interface AvailabilityExceptionRecord extends AvailabilityException {
  teacherId: string;
}

export interface CalendarBlockRecord extends CalendarBlock {
  teacherId: string;
}

export interface ExternalGoogleEventRecord extends ExternalGoogleEvent {
  teacherId: string;
}

export interface StudentStatImportRecord extends StudentStatImport {
  teacherId: string;
}

export interface SessionRecord {
  token: string;
  teacherId: string;
  expiresAt: string;
}

export interface StoreShape {
  version: 1;
  teachers: TeacherRecord[];
  students: StudentRecord[];
  contacts: StudentContactRecord[];
  groups: StudentGroupRecord[];
  lessons: LessonRecord[];
  studentStatImports: StudentStatImportRecord[];
  availability: AvailabilityRecord[];
  availabilityExceptions?: AvailabilityExceptionRecord[];
  calendarBlocks?: CalendarBlockRecord[];
  externalGoogleEvents?: ExternalGoogleEventRecord[];
  sessions: SessionRecord[];
}

const runtimeDir =
  process.env.TUTORFLOW_DATA_DIR?.trim() ||
  path.join(process.cwd(), ".tutorflow");
const dataFile = path.join(runtimeDir, "data.json");

let mutationQueue: Promise<unknown> = Promise.resolve();

async function ensureStore(): Promise<void> {
  await fs.mkdir(runtimeDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await writeStore({
      version: 1,
      teachers: [],
      students: [],
      contacts: [],
      groups: [],
      lessons: [],
      studentStatImports: [],
      availability: [],
      availabilityExceptions: [],
      calendarBlocks: [],
      sessions: [],
    });
  }
}

async function readStore(): Promise<StoreShape> {
  await ensureStore();
  return JSON.parse(await fs.readFile(dataFile, "utf8")) as StoreShape;
}

async function writeStore(store: StoreShape): Promise<void> {
  await fs.mkdir(runtimeDir, { recursive: true });
  const temporary = `${dataFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(temporary, dataFile);
}

export async function mutateStore<T>(
  operation: (store: StoreShape) => T | Promise<T>,
): Promise<T> {
  const run = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await operation(store);
    await writeStore(store);
    return result;
  });
  mutationQueue = run.catch(() => undefined);
  return run;
}

export async function queryStore<T>(
  operation: (store: StoreShape) => T,
): Promise<T> {
  await mutationQueue.catch(() => undefined);
  return operation(await readStore());
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createTeacher(input: {
  name: string;
  email: string;
  password: string;
}): Promise<Teacher> {
  return mutateStore((store) => {
    if (
      store.teachers.some(
        (teacher) => teacher.email.toLowerCase() === input.email.toLowerCase(),
      )
    ) {
      throw new Error("EMAIL_TAKEN");
    }
    const now = new Date();
    const teacher: TeacherRecord = {
      id: randomUUID(),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: hashPassword(input.password),
      timezone: "Europe/Warsaw",
      subscription: {
        status: "trial",
        plan: "trial",
        readOnly: false,
        trialEndsAt: addDays(now, 14).toISOString(),
      },
      google: providerState("google"),
      telegram: providerState("telegram"),
      payu: providerState("payu"),
    };
    store.teachers.push(teacher);
    return publicTeacher(teacher);
  });
}

function providerState(provider: "google" | "telegram" | "payu") {
  const configured =
    provider === "google"
      ? Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        )
      : provider === "telegram"
        ? Boolean(process.env.TELEGRAM_BOT_TOKEN)
        : Boolean(process.env.PAYU_POS_ID && process.env.PAYU_CLIENT_SECRET);
  return {
    status: configured
      ? ("not_connected" as const)
      : ("not_configured" as const),
  };
}

export async function findTeacherByEmail(
  email: string,
): Promise<TeacherRecord | undefined> {
  return queryStore((store) =>
    store.teachers.find(
      (teacher) => teacher.email.toLowerCase() === email.trim().toLowerCase(),
    ),
  );
}

export async function createSession(teacherId: string): Promise<string> {
  return mutateStore((store) => {
    const token = randomBytes(32).toString("base64url");
    store.sessions = store.sessions.filter(
      (session) => new Date(session.expiresAt) > new Date(),
    );
    store.sessions.push({
      token,
      teacherId,
      expiresAt: addDays(new Date(), 30).toISOString(),
    });
    return token;
  });
}

export async function deleteSession(token: string): Promise<void> {
  await mutateStore((store) => {
    store.sessions = store.sessions.filter(
      (session) => session.token !== token,
    );
  });
}

export async function getTeacherBySession(
  token?: string,
): Promise<Teacher | null> {
  if (!token) return null;
  return queryStore((store) => {
    const session = store.sessions.find(
      (candidate) =>
        candidate.token === token && new Date(candidate.expiresAt) > new Date(),
    );
    const teacher = session
      ? store.teachers.find((candidate) => candidate.id === session.teacherId)
      : undefined;
    return teacher ? publicTeacher(teacher) : null;
  });
}

export async function ensureDemoTeacher(): Promise<Teacher> {
  return mutateStore((store) => {
    let teacher = store.teachers.find((candidate) => candidate.demo);
    if (teacher) return publicTeacher(teacher);

    const now = new Date();
    teacher = {
      id: randomUUID(),
      name: "Aleksandra Wysocka",
      email: "demo@tutorflow.local",
      passwordHash: hashPassword(randomUUID()),
      timezone: "Europe/Warsaw",
      demo: true,
      subscription: {
        status: "trial",
        plan: "trial",
        readOnly: false,
        trialEndsAt: addDays(now, 11).toISOString(),
      },
      google: {
        status: "error",
        label: "Kalendarz prywatny",
        lastError: "Nie udało się zsynchronizować ostatniego wydarzenia.",
      },
      telegram: providerState("telegram"),
      payu: providerState("payu"),
    };
    store.teachers.push(teacher);
    seedDemo(store, teacher.id, now);
    return publicTeacher(teacher);
  });
}

export async function getAppData(teacherId: string): Promise<AppData> {
  return queryStore((store) => appDataFromStore(store, teacherId));
}

export function appDataFromStore(
  store: StoreShape,
  teacherId: string,
): AppData {
  const teacher = store.teachers.find(
    (candidate) => candidate.id === teacherId,
  );
  if (!teacher) throw new Error("TEACHER_NOT_FOUND");
  const now = Date.now();
  const lessons = store.lessons
    .filter((lesson) => lesson.teacherId === teacherId)
    .map((record) => ({
      ...withoutTenant(record),
      color: record.color ?? DEFAULT_CALENDAR_COLOR,
      subject: record.subject ?? "",
      timezone: record.timezone ?? teacher.timezone,
      updatedAt: record.updatedAt ?? record.createdAt,
      status:
        record.status === "scheduled" &&
        new Date(record.startsAt).getTime() + record.durationMinutes * 60_000 <
          now
          ? ("needs_completion" as const)
          : record.status,
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const activeStudents = store.students.filter(
    (student) => student.teacherId === teacherId && student.status === "active",
  ).length;
  const summary = (start: Date, end: Date) => {
    const within = lessons.filter((lesson) => {
      const timestamp = new Date(lesson.startsAt).getTime();
      return (
        timestamp >= start.getTime() &&
        timestamp <= end.getTime() &&
        lesson.status !== "cancelled"
      );
    });
    let plannedAmount = 0;
    let receivableAmount = 0;
    let receivedAmount = 0;
    within.forEach((lesson) => {
      lesson.participants.forEach((participant) => {
        const amount = lesson.price?.amount ?? 0;
        if (participant.paymentStatus === "paid") receivedAmount += amount;
        else if (
          participant.paymentStatus === "unpaid" &&
          (lesson.status === "completed" ||
            lesson.status === "needs_completion")
        )
          receivableAmount += amount;
        else if (
          participant.paymentStatus === "unpaid" &&
          lesson.status === "scheduled"
        )
          plannedAmount += amount;
      });
    });
    return {
      lessonCount: within.length,
      hours: within.reduce(
        (total, lesson) => total + lesson.durationMinutes / 60,
        0,
      ),
      plannedAmount,
      receivableAmount,
      receivedAmount,
      activeStudents,
    };
  };
  const current = new Date();
  const zonedCurrent = toZonedTime(current, teacher.timezone);
  const utcRange = (start: Date, end: Date) => ({
    start: fromZonedTime(start, teacher.timezone),
    end: fromZonedTime(end, teacher.timezone),
  });
  const week = utcRange(
    startOfWeek(zonedCurrent, { weekStartsOn: 1 }),
    endOfWeek(zonedCurrent, { weekStartsOn: 1 }),
  );
  const month = utcRange(startOfMonth(zonedCurrent), endOfMonth(zonedCurrent));
  const year = utcRange(startOfYear(zonedCurrent), endOfYear(zonedCurrent));
  return {
    teacher: publicTeacher(teacher),
    students: store.students
      .filter((student) => student.teacherId === teacherId)
      .map((student) => normalizeStudent(withoutTenant(student)))
      .sort((a, b) => a.name.localeCompare(b.name, "pl")),
    contacts: (store.contacts ?? [])
      .filter((contact) => contact.teacherId === teacherId)
      .map(withoutTenant),
    groups: (store.groups ?? [])
      .filter((group) => group.teacherId === teacherId)
      .map(withoutTenant)
      .sort((a, b) => a.name.localeCompare(b.name, "pl")),
    lessons,
    studentStatImports: (store.studentStatImports ?? [])
      .filter((record) => record.teacherId === teacherId)
      .map(withoutTenant)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    availability: store.availability
      .filter((rule) => rule.teacherId === teacherId)
      .map(withoutTenant),
    availabilityExceptions: (store.availabilityExceptions ?? [])
      .filter((item) => item.teacherId === teacherId)
      .map(withoutTenant),
    calendarBlocks: (store.calendarBlocks ?? [])
      .filter((item) => item.teacherId === teacherId)
      .map((item) => ({
        ...withoutTenant(item),
        color: item.color ?? "#7F8A9A",
      }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    externalGoogleEvents: (store.externalGoogleEvents ?? [])
      .filter((item) => item.teacherId === teacherId)
      .map(withoutTenant),
    integrations: {
      google: teacher.google,
      telegram: teacher.telegram,
      payu: teacher.payu,
    },
    financials: {
      week: summary(week.start, week.end),
      month: summary(month.start, month.end),
      year: summary(year.start, year.end),
    },
  };
}

function withoutTenant<T extends { teacherId: string }>(
  record: T,
): Omit<T, "teacherId"> {
  const result = { ...record };
  delete (result as Partial<T>).teacherId;
  return result;
}

function normalizeStudent(student: Omit<StudentRecord, "teacherId">): Student {
  const legacy = student as Student & Partial<Student>;
  const name = legacy.displayName || legacy.name || "";
  const parts = name.trim().split(/\s+/);
  const email =
    legacy.email ?? (legacy.contact?.includes("@") ? legacy.contact : "");
  const phone =
    legacy.phone ??
    (!legacy.contact?.includes("@") ? (legacy.contact ?? "") : "");
  return {
    ...legacy,
    firstName: legacy.firstName ?? parts[0] ?? "",
    lastName: legacy.lastName ?? parts.slice(1).join(" "),
    displayName: name,
    name,
    email,
    phone,
    contact: legacy.contact || email || phone,
    subject: legacy.subject ?? "",
    groupIds: legacy.groupIds ?? [],
    packageRemainingLessons: legacy.packageRemainingLessons ?? null,
    balanceDue: legacy.balanceDue ?? { amount: 0, currency: "PLN" },
  };
}

function publicTeacher(teacher: TeacherRecord): Teacher {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    timezone: teacher.timezone,
    subscription: teacher.subscription,
  };
}

function seedDemo(store: StoreShape, teacherId: string, now: Date): void {
  const student = (
    name: string,
    level: string,
    goal: string,
    price: number,
    format: "online" | "offline" = "online",
    status: Student["status"] = "active",
  ): StudentRecord => ({
    id: randomUUID(),
    teacherId,
    firstName: name.split(" ")[0] ?? name,
    lastName: name.split(" ").slice(1).join(" "),
    displayName: name,
    name,
    email:
      format === "online"
        ? `${name.split(" ")[0].toLowerCase()}@example.test`
        : "",
    phone: format === "offline" ? "+48 600 000 000" : "",
    contact:
      format === "online"
        ? `${name.split(" ")[0].toLowerCase()}@example.test`
        : "+48 600 000 000",
    subject: "Angielski",
    level,
    goal,
    notes:
      status === "archived" ? "Współpraca zakończona zgodnie z planem." : "",
    status,
    defaultDurationMinutes: 60,
    defaultFormat: format,
    defaultLocation:
      format === "online"
        ? "https://meet.google.com/example"
        : "ul. Długa 12, Warszawa",
    defaultPrice: { amount: price, currency: "PLN" },
    timezone: "Europe/Warsaw",
    groupIds: [],
    packageRemainingLessons: null,
    balanceDue: { amount: 0, currency: "PLN" },
    createdAt: addDays(now, -120).toISOString(),
  });

  const anna = student(
    "Anna Nowak",
    "B1",
    "Swobodna komunikacja w pracy",
    13000,
  );
  const marta = student("Marta Kowalska", "B2", "Egzamin Cambridge FCE", 15000);
  const jan = student(
    "Jan Zieliński",
    "A2",
    "Rozmowy podczas podróży",
    12000,
    "offline",
  );
  const lena = student(
    "Lena Wiśniewska-Król",
    "B1+",
    "Pewność w prezentacjach biznesowych",
    16000,
  );
  const piotr = student("Piotr Maj", "B1", "Konwersacje bez blokady", 13000);
  const archived = student(
    "Katarzyna Domańska",
    "C1",
    "Akademicki język angielski",
    17000,
    "online",
    "archived",
  );
  store.students.push(anna, marta, jan, lena, piotr, archived);
  store.contacts ??= [];
  store.groups ??= [];
  const groupId = randomUUID();
  anna.groupIds = [groupId];
  piotr.groupIds = [groupId];
  anna.packageRemainingLessons = 7;
  anna.balanceDue = { amount: 8000, currency: "PLN" };
  store.groups.push({
    id: groupId,
    teacherId,
    name: "Konwersacje B1",
    subject: "Angielski",
    level: "B1",
    status: "active",
    defaultDurationMinutes: 60,
    defaultPrice: { amount: 8000, currency: "PLN" },
    notes: "",
    members: [anna, piotr].map((member) => ({
      id: randomUUID(),
      studentId: member.id,
      status: "active" as const,
      joinedAt: addDays(now, -90).toISOString(),
    })),
    createdAt: addDays(now, -90).toISOString(),
  });
  store.contacts.push({
    id: randomUUID(),
    teacherId,
    studentId: marta.id,
    contactId: randomUUID(),
    firstName: "Joanna",
    lastName: "Kowalska",
    displayName: "Joanna Kowalska",
    email: "joanna.kowalska@example.test",
    phone: "+48 600 100 200",
    type: "parent",
    relationship: "Mama",
    isPrimary: true,
    isBillingContact: true,
    createdAt: addDays(now, -110).toISOString(),
  });

  const makePlan = (texts: string[]): PlanItem[] =>
    texts.map((text, position) => ({ id: randomUUID(), position, text }));
  const participant = (
    studentId: string,
    plan: PlanItem[],
    payment: LessonParticipant["paymentStatus"],
    complete = false,
    score = 8,
  ): LessonParticipant => ({
    studentId,
    attendanceStatus: complete ? "present" : "unknown",
    paymentStatus: payment,
    results: plan.map((item) => ({
      planItemId: item.id,
      completed: complete,
      score: complete ? score : undefined,
      note: complete
        ? "Dobrze rozpoznaje konstrukcję, warto utrwalić ją w mówieniu."
        : "",
    })),
  });
  const lesson = (input: {
    offsetMinutes: number;
    duration?: number;
    studentIds: string[];
    topic: string;
    plan: string[];
    status?: Lesson["status"];
    payment?: LessonParticipant["paymentStatus"];
    format?: Lesson["format"];
    location?: string;
    price?: number;
    syncStatus?: Lesson["syncStatus"];
    syncMessage?: string;
  }): LessonRecord => {
    const plan = makePlan(input.plan);
    const startsAt = addMinutes(now, input.offsetMinutes);
    startsAt.setSeconds(0, 0);
    return {
      id: randomUUID(),
      color: DEFAULT_CALENDAR_COLOR,
      teacherId,
      participantIds: input.studentIds,
      startsAt: startsAt.toISOString(),
      durationMinutes: input.duration ?? 60,
      format: input.format ?? "online",
      location: input.location ?? "https://meet.google.com/example",
      price: { amount: input.price ?? 14000, currency: "PLN" },
      mode: "single",
      status: input.status ?? "scheduled",
      syncStatus: input.syncStatus ?? "synced",
      syncMessage: input.syncMessage,
      topic: input.topic,
      planItems: plan,
      homework:
        input.status === "completed"
          ? "Powtórzyć przykłady i przygotować trzy własne zdania."
          : "",
      generalNotes: "",
      participants: input.studentIds.map((id, index) =>
        participant(
          id,
          plan,
          input.payment ?? (index === 0 ? "paid" : "unpaid"),
          input.status === "completed",
          8 - index,
        ),
      ),
      createdAt: addDays(now, -10).toISOString(),
    };
  };

  store.lessons.push(
    lesson({
      offsetMinutes: -10_080,
      studentIds: [marta.id],
      topic: "Past Simple — opowiadanie o doświadczeniach",
      plan: [
        "Powtórka czasowników nieregularnych",
        "Historia z ostatniego wyjazdu",
        "Korekta wymowy końcówek -ed",
      ],
      status: "completed",
      payment: "paid",
      price: 15000,
    }),
    lesson({
      offsetMinutes: -2_880,
      studentIds: [anna.id],
      topic: "Small talk w pracy",
      plan: ["Pytania otwierające rozmowę", "Reakcje podtrzymujące dialog"],
      status: "completed",
      payment: "paid",
      price: 13000,
    }),
    lesson({
      offsetMinutes: -210,
      studentIds: [jan.id],
      topic: "Pytanie o drogę",
      plan: [
        "Słownictwo miejskie",
        "Dialog w punkcie informacji",
        "Wskazywanie kierunku",
      ],
      status: "completed",
      payment: "paid",
      format: "offline",
      location: "ul. Długa 12, Warszawa",
      price: 12000,
    }),
    lesson({
      offsetMinutes: -95,
      studentIds: [anna.id, piotr.id],
      topic: "Rozmowa o planach na weekend",
      plan: [
        "Warm-up w parach",
        "Future forms w praktyce",
        "Informacja zwrotna",
      ],
      status: "scheduled",
      payment: "unpaid",
      price: 13000,
    }),
    lesson({
      offsetMinutes: 55,
      studentIds: [marta.id],
      topic: "Present Perfect",
      plan: [
        "Różnica: finished vs unfinished time",
        "For i since w kontekście",
        "Krótka wypowiedź egzaminacyjna",
      ],
      payment: "unpaid",
      price: 15000,
    }),
    lesson({
      offsetMinutes: 210,
      studentIds: [lena.id],
      topic: "Prowadzenie prezentacji — otwarcie",
      plan: [
        "Mocne zdanie otwierające",
        "Zapowiedź struktury",
        "Przejścia między slajdami",
      ],
      payment: "paid",
      price: 16000,
    }),
    lesson({
      offsetMinutes: 1_500,
      studentIds: [jan.id],
      topic: "W hotelu",
      plan: ["Check-in", "Prośby i problemy w pokoju"],
      payment: "unpaid",
      format: "offline",
      location: "ul. Długa 12, Warszawa",
      price: 12000,
      syncStatus: "failed",
      syncMessage:
        "Nie udało się zsynchronizować wydarzenia z Google Calendar.",
    }),
    lesson({
      offsetMinutes: 2_940,
      studentIds: [anna.id, piotr.id],
      topic: "Opinie i argumentowanie",
      plan: ["Wyrażanie opinii", "Zgoda i sprzeciw", "Mini-debata"],
      payment: "unpaid",
      price: 13000,
    }),
    lesson({
      offsetMinutes: 4_320,
      studentIds: [marta.id],
      topic: "Present Perfect vs Past Simple",
      plan: ["Linia czasu", "Transformacje zdań", "Speaking practice"],
      payment: "unpaid",
      price: 15000,
      syncStatus: "deleted_in_google",
      syncMessage: "Wydarzenie usunięte w Google Calendar",
    }),
    lesson({
      offsetMinutes: -1_560,
      studentIds: [lena.id],
      topic: "Spotkanie statusowe",
      plan: ["Raportowanie postępu", "Sygnalizowanie ryzyka"],
      status: "cancelled",
      payment: "cancelled",
      price: 16000,
    }),
  );

  store.availability.push({
    id: randomUUID(),
    teacherId,
    kind: "single",
    label: "Czas niedostępny",
    start: addMinutes(now, 1_020).toISOString(),
    end: addMinutes(now, 1_200).toISOString(),
  });
}
