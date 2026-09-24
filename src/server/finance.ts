import "server-only";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type {
  FinanceAction,
  FinancialCharge,
  FinancialOverview,
  FinancialPackage,
  FinancialPayment,
} from "@/lib/finance";
import { paymentPage } from "@/lib/finance";
import { ApiFailure } from "./errors";
import { getAppData, localAllowed } from "./repository";
import { createSupabaseServerClient } from "./supabase";

const PAYMENT_PAGE_SIZE = 20;

export async function getFinancialOverview(
  teacherId: string,
  options: { studentId?: string; cursor?: number } = {},
): Promise<FinancialOverview> {
  if (localAllowed())
    return localFinancialOverview(teacherId, options.studentId);
  const { supabase, workspaceId, timezone, currency, dueDays } =
    await financialContext(teacherId, false);
  const cursor = Math.max(0, options.cursor ?? 0);

  let chargesQuery = supabase
    .from("charge_balances")
    .select(
      "charge_id,student_id,lesson_id,package_id,type,description,amount_grosz,currency,status,due_at,created_at,settled_at,allocated_grosz,outstanding_grosz,is_overdue",
    )
    .eq("workspace_id", workspaceId)
    .gt("outstanding_grosz", 0)
    .neq("status", "cancelled")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at")
    .limit(100);
  let paymentsQuery = supabase
    .from("payment_balances")
    .select(
      "payment_id,student_id,amount_grosz,currency,status,paid_at,payment_method,note,created_at,allocated_grosz,unallocated_grosz",
    )
    .eq("workspace_id", workspaceId)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("payment_id", { ascending: false })
    .range(cursor, cursor + PAYMENT_PAGE_SIZE);
  let packagesQuery = supabase
    .from("packages")
    .select(
      "id,student_id,name,total_lessons,price_grosz,currency,status,purchased_at,expires_at",
    )
    .eq("workspace_id", workspaceId)
    .order("purchased_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (options.studentId) {
    chargesQuery = chargesQuery.eq("student_id", options.studentId);
    paymentsQuery = paymentsQuery.eq("student_id", options.studentId);
    packagesQuery = packagesQuery.eq("student_id", options.studentId);
  }

  const dateKey = formatInTimeZone(new Date(), timezone, "yyyy-MM-01");
  const monthStart = fromZonedTime(
    `${dateKey}T00:00:00`,
    timezone,
  ).toISOString();
  const [
    studentsResult,
    chargesResult,
    paymentsResult,
    packagesResult,
    summaryResult,
    debtStudentsResult,
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id,display_name,currency,status")
      .eq("workspace_id", workspaceId)
      .order("display_name")
      .limit(1000),
    chargesQuery,
    paymentsQuery,
    packagesQuery,
    supabase.rpc("finance_summary", {
      p_workspace_id: workspaceId,
      p_currency: currency,
      p_month_start: monthStart,
      p_student_id: options.studentId ?? null,
    }),
    supabase
      .from("charge_balances")
      .select("student_id")
      .eq("workspace_id", workspaceId)
      .gt("outstanding_grosz", 0)
      .neq("status", "cancelled")
      .limit(1000),
  ]);
  const failure = [
    studentsResult,
    chargesResult,
    paymentsResult,
    packagesResult,
    summaryResult,
    debtStudentsResult,
  ].find((result) => result.error);
  if (failure?.error) databaseFailure(failure.error);

  const students = new Map(
    (studentsResult.data ?? []).map((row) => [row.id as string, row]),
  );
  const debtStudentIds = new Set(
    (debtStudentsResult.data ?? []).map((row) => row.student_id as string),
  );
  const chargeRows = chargesResult.data ?? [];
  const paymentPageResult = paymentPage(
    paymentsResult.data ?? [],
    cursor,
    PAYMENT_PAGE_SIZE,
  );
  const packageRows = packagesResult.data ?? [];
  const packageIds = packageRows.map((row) => row.id as string);
  const [balancesResult, usagesResult, packageChargesResult] = await Promise.all([
    packageIds.length
      ? supabase
          .from("package_balances")
          .select("package_id,used_lessons,remaining_lessons")
          .eq("workspace_id", workspaceId)
          .in("package_id", packageIds)
      : Promise.resolve({ data: [], error: null }),
    packageIds.length
      ? supabase
          .from("package_usages")
          .select("id,package_id,lesson_id,kind,units,created_at")
          .eq("workspace_id", workspaceId)
          .in("package_id", packageIds)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    packageIds.length
      ? supabase
          .from("charge_balances")
          .select("package_id,outstanding_grosz")
          .eq("workspace_id", workspaceId)
          .in("package_id", packageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (balancesResult.error) databaseFailure(balancesResult.error);
  if (usagesResult.error) databaseFailure(usagesResult.error);
  if (packageChargesResult.error) databaseFailure(packageChargesResult.error);
  const lessonIds = [
    ...new Set((usagesResult.data ?? []).map((row) => row.lesson_id as string)),
  ];
  const lessonsResult = lessonIds.length
    ? await supabase
        .from("lessons")
        .select("id,title,starts_at")
        .eq("workspace_id", workspaceId)
        .in("id", lessonIds)
    : { data: [], error: null };
  if (lessonsResult.error) databaseFailure(lessonsResult.error);

  const lessonById = new Map(
    (lessonsResult.data ?? []).map((row) => [row.id as string, row]),
  );
  const balanceByPackage = new Map(
    (balancesResult.data ?? []).map((row) => [row.package_id as string, row]),
  );
  const outstandingByPackage = new Map(
    (packageChargesResult.data ?? [])
      .filter((row) => row.package_id)
      .map((row) => [row.package_id as string, Number(row.outstanding_grosz)]),
  );
  const usagesByPackage = new Map<string, FinancialPackage["usage"]>();
  for (const row of usagesResult.data ?? []) {
    const lesson = lessonById.get(row.lesson_id as string);
    const current = usagesByPackage.get(row.package_id as string) ?? [];
    current.push({
      id: row.id as string,
      lessonId: row.lesson_id as string,
      lessonLabel: lesson
        ? `${(lesson.title as string) || "Lekcja"} · ${new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: timezone }).format(new Date(lesson.starts_at as string))}`
        : "Lekcja",
      kind: row.kind as "consumption" | "reversal",
      units: Number(row.units),
      createdAt: row.created_at as string,
    });
    usagesByPackage.set(row.package_id as string, current);
  }

  const openCharges: FinancialCharge[] = chargeRows.map((row) => ({
    id: row.charge_id as string,
    studentId: row.student_id as string,
    studentName:
      (students.get(row.student_id as string)?.display_name as
        string | undefined) ?? "Archiwalny uczeń",
    lessonId: (row.lesson_id as string | null) ?? undefined,
    packageId: (row.package_id as string | null) ?? undefined,
    type: row.type as FinancialCharge["type"],
    description: row.description as string,
    amount: Number(row.amount_grosz),
    allocated: Number(row.allocated_grosz),
    outstanding: Number(row.outstanding_grosz),
    currency: row.currency as string,
    status: row.status as FinancialCharge["status"],
    dueAt: (row.due_at as string | null) ?? undefined,
    createdAt: row.created_at as string,
    settledAt: (row.settled_at as string | null) ?? undefined,
    overdue: Boolean(row.is_overdue),
  }));
  const recentPayments: FinancialPayment[] = paymentPageResult.items.map(
    (row) => ({
      id: row.payment_id as string,
      studentId: row.student_id as string,
      studentName:
        (students.get(row.student_id as string)?.display_name as
          string | undefined) ?? "Archiwalny uczeń",
      amount: Number(row.amount_grosz),
      allocated: Number(row.allocated_grosz),
      unallocated: Number(row.unallocated_grosz),
      currency: row.currency as string,
      status: row.status as FinancialPayment["status"],
      method:
        (row.payment_method as FinancialPayment["method"] | null) ?? undefined,
      note: (row.note as string | null) ?? undefined,
      paidAt: (row.paid_at as string | null) ?? undefined,
      createdAt: row.created_at as string,
    }),
  );
  const packages: FinancialPackage[] = packageRows.map((row) => {
    const balance = balanceByPackage.get(row.id as string);
    const remainingLessons = Number(
      balance?.remaining_lessons ?? row.total_lessons,
    );
    const expired = Boolean(
      row.expires_at && Date.parse(row.expires_at as string) < Date.now(),
    );
    const storedStatus = row.status as FinancialPackage["status"];
    return {
      id: row.id as string,
      studentId: row.student_id as string,
      studentName:
        (students.get(row.student_id as string)?.display_name as
          string | undefined) ?? "Archiwalny uczeń",
      name: row.name as string,
      totalLessons: Number(row.total_lessons),
      usedLessons: Number(balance?.used_lessons ?? 0),
      remainingLessons,
      price: Number(row.price_grosz),
      currency: row.currency as string,
      status:
        storedStatus === "cancelled"
          ? "cancelled"
          : expired
            ? "expired"
            : remainingLessons <= 0
              ? "exhausted"
              : storedStatus,
      purchasedAt: row.purchased_at as string,
      expiresAt: (row.expires_at as string | null) ?? undefined,
      paymentOutstanding: outstandingByPackage.get(row.id as string) ?? 0,
      usage: usagesByPackage.get(row.id as string) ?? [],
    };
  });

  return {
    workspace: { currency, timezone, dueDays },
    students: (studentsResult.data ?? []).map((row) => ({
        id: row.id as string,
        name: row.display_name as string,
        currency: (row.currency as string | null) ?? currency,
        status: row.status as "active" | "archived",
        canRecordPayment:
          row.status === "active" || debtStudentIds.has(row.id as string),
      })),
    summary: {
      outstanding: databaseMinorUnits(
        summaryResult.data?.[0]?.outstanding_grosz,
      ),
      overdue: databaseMinorUnits(summaryResult.data?.[0]?.overdue_grosz),
      receivedThisMonth: databaseMinorUnits(
        summaryResult.data?.[0]?.received_this_month_grosz,
      ),
      currency,
    },
    openCharges,
    recentPayments,
    packages,
    nextPaymentCursor: paymentPageResult.nextCursor,
    scopeStudentId: options.studentId,
  };
}

export async function mutateFinance(
  teacherId: string,
  action: FinanceAction,
): Promise<FinancialOverview> {
  if (localAllowed()) {
    throw new ApiFailure(503, {
      code: "FINANCE_REQUIRES_DATABASE",
      message: "Zapisy finansowe wymagają połączenia z bazą danych.",
      retryable: true,
    });
  }
  const { supabase, workspaceId } = await financialContext(teacherId, true);
  const result =
    action.type === "recordPayment"
      ? await supabase.rpc("record_student_payment", {
          p_workspace_id: workspaceId,
          p_student_id: action.studentId,
          p_amount_grosz: action.amountGrosz,
          p_currency: action.currency,
          p_paid_at: action.paidAt,
          p_payment_method: action.paymentMethod,
          p_note: action.note ?? "",
          p_allocations: action.allocations,
          p_idempotency_key: action.idempotencyKey,
        })
      : await supabase.rpc("create_student_package", {
          p_workspace_id: workspaceId,
          p_student_id: action.studentId,
          p_name: action.name,
          p_total_lessons: action.totalLessons,
          p_price_grosz: action.priceGrosz,
          p_currency: action.currency,
          p_purchased_at: action.purchasedAt,
          p_expires_at: action.expiresAt ?? null,
          p_idempotency_key: action.idempotencyKey,
        });
  if (result.error) databaseFailure(result.error);
  return getFinancialOverview(teacherId, { studentId: action.studentId });
}

async function financialContext(teacherId: string, write: boolean) {
  const supabase = await createSupabaseServerClient();
  const [{ data: auth }, tutor, workspace, subscription] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tutor_profiles")
      .select("workspace_id,timezone")
      .eq("user_id", teacherId)
      .single(),
    supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", teacherId)
      .eq("status", "active")
      .limit(1)
      .single(),
    supabase
      .from("subscriptions")
      .select("read_only")
      .eq("teacher_id", teacherId)
      .single(),
  ]);
  if (auth.user?.id !== teacherId) unauthenticated();
  if (tutor.error || workspace.error || subscription.error) notFound();
  if (write && subscription.data.read_only) {
    throw new ApiFailure(403, {
      code: "READ_ONLY",
      message: "W trybie tylko do odczytu nie można zmieniać rozliczeń.",
    });
  }
  const workspaceId = tutor.data.workspace_id as string;
  const workspaceResult = await supabase
    .from("workspaces")
    .select("currency,timezone,payment_due_days")
    .eq("id", workspaceId)
    .single();
  if (workspaceResult.error) databaseFailure(workspaceResult.error);
  return {
    supabase,
    workspaceId,
    timezone: (tutor.data.timezone as string) || workspaceResult.data.timezone,
    currency: workspaceResult.data.currency as string,
    dueDays: Number(workspaceResult.data.payment_due_days),
  };
}

async function localFinancialOverview(
  teacherId: string,
  studentId?: string,
): Promise<FinancialOverview> {
  const data = await getAppData(teacherId);
  const students = data.students.filter(
    (student) => !studentId || student.id === studentId,
  );
  const names = new Map(
    data.students.map((student) => [student.id, student.name]),
  );
  const openCharges: FinancialCharge[] = data.lessons.flatMap((lesson) =>
    lesson.status === "completed" && lesson.price
      ? lesson.participants
          .filter(
            (participant) =>
              participant.paymentStatus === "unpaid" &&
              (!studentId || participant.studentId === studentId),
          )
          .map((participant) => ({
            id: `demo-${lesson.id}-${participant.studentId}`,
            studentId: participant.studentId,
            studentName: names.get(participant.studentId) ?? "Uczeń",
            lessonId: lesson.id,
            type: "lesson" as const,
            description: lesson.topic || "Lekcja",
            amount: lesson.price!.amount,
            allocated: 0,
            outstanding: lesson.price!.amount,
            currency: lesson.price!.currency,
            status: "open" as const,
            createdAt: lesson.startsAt,
            overdue: false,
          }))
      : [],
  );
  const debtStudentIds = new Set(
    openCharges.map((charge) => charge.studentId),
  );
  return {
    workspace: { currency: "PLN", timezone: data.teacher.timezone, dueDays: 7 },
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      currency: student.defaultPrice?.currency ?? "PLN",
      status: student.status,
      canRecordPayment:
        student.status === "active" || debtStudentIds.has(student.id),
    })),
    summary: {
      outstanding: openCharges.reduce(
        (sum, charge) => sum + charge.outstanding,
        0,
      ),
      overdue: 0,
      receivedThisMonth: 0,
      currency: "PLN",
    },
    openCharges,
    recentPayments: [],
    packages: [],
    scopeStudentId: studentId,
  };
}

function databaseFailure(error: { message?: string; code?: string }): never {
  const message = error.message ?? "";
  if (message.includes("CURRENCY_MISMATCH")) {
    throw new ApiFailure(422, {
      code: "CURRENCY_MISMATCH",
      message: "Płatność i rozliczana pozycja muszą mieć tę samą walutę.",
    });
  }
  if (message.includes("OVERALLOCATION")) {
    throw new ApiFailure(409, {
      code: "OVERALLOCATION",
      message:
        "Kwota przypisania przekracza dostępne saldo. Dane zostały odświeżone.",
      retryable: true,
    });
  }
  if (message.includes("IDEMPOTENCY_CONFLICT")) {
    throw new ApiFailure(409, {
      code: "IDEMPOTENCY_CONFLICT",
      message:
        "Ten identyfikator operacji został już użyty z innymi danymi. Odśwież widok i spróbuj ponownie.",
    });
  }
  if (message.includes("PACKAGE_EXHAUSTED")) {
    throw new ApiFailure(409, {
      code: "PACKAGE_EXHAUSTED",
      message: "Brak aktywnego pakietu z wolnymi zajęciami.",
    });
  }
  if (message.includes("STUDENT_NOT_ACTIVE")) {
    throw new ApiFailure(422, {
      code: "STUDENT_NOT_ACTIVE",
      message: "Nowy pakiet można utworzyć tylko dla aktywnego ucznia.",
    });
  }
  if (message.includes("STUDENT_NOT_FOUND")) {
    throw new ApiFailure(404, {
      code: "STUDENT_NOT_FOUND",
      message: "Nie znaleziono ucznia.",
    });
  }
  if (error.code === "42501" || message.includes("ACCESS_DENIED")) {
    throw new ApiFailure(403, {
      code: "FORBIDDEN",
      message: "Nie masz dostępu do tych danych finansowych.",
    });
  }
  throw new ApiFailure(422, {
    code: "FINANCE_OPERATION_FAILED",
    message:
      "Nie udało się zapisać płatności. Żadne środki nie zostały przypisane.",
    retryable: true,
  });
}

function databaseMinorUnits(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isSafeInteger(amount)) {
    throw new ApiFailure(500, {
      code: "UNSAFE_MONEY_TOTAL",
      message: "Suma rozliczeń przekracza obsługiwany zakres.",
    });
  }
  return amount;
}

function notFound(): never {
  throw new ApiFailure(404, {
    code: "FINANCE_CONTEXT_NOT_FOUND",
    message: "Nie znaleziono obszaru rozliczeń.",
  });
}

function unauthenticated(): never {
  throw new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Sesja wygasła. Zaloguj się ponownie.",
  });
}
