import { currentTeacher } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { getAppData } from "@/server/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const teacher = await currentTeacher();
    if (!teacher) {
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    }
    const { kind } = await params;
    const data = await getAppData(teacher.id);
    let rows: string[][];
    if (kind === "uczniowie") {
      rows = [
        ["Imię i nazwisko", "Poziom", "Cel", "Kontakt", "Status"],
        ...data.students.map((student) => [
          student.name,
          student.level,
          student.goal,
          student.contact,
          student.status === "active" ? "Aktywny" : "Archiwalny",
        ]),
      ];
    } else if (kind === "lekcje") {
      rows = [
        ["Data UTC", "Uczniowie", "Temat", "Czas (min)", "Status"],
        ...data.lessons.map((lesson) => [
          lesson.startsAt,
          lesson.participantIds
            .map(
              (id) =>
                data.students.find((student) => student.id === id)?.name ?? "—",
            )
            .join(", "),
          lesson.topic,
          String(lesson.durationMinutes),
          lesson.status,
        ]),
      ];
    } else if (kind === "platnosci") {
      rows = [
        ["Data UTC", "Uczeń", "Kwota (grosz)", "Waluta", "Status"],
        ...data.lessons.flatMap((lesson) =>
          lesson.participants.map((participant) => [
            lesson.startsAt,
            data.students.find(
              (student) => student.id === participant.studentId,
            )?.name ?? "—",
            String(lesson.price?.amount ?? 0),
            "PLN",
            participant.paymentStatus,
          ]),
        ),
      ];
    } else {
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    }
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="easy4tutor-${kind}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
