import { progressContext } from "@/lib/progress";
import { Check, Circle, Diamond } from "lucide-react";
import type { Lesson, Student } from "@/lib/domain";

interface ProgressThreadProps {
  student: Student;
  lessons: Lesson[];
  compact?: boolean;
  currentLessonId?: string;
}

export function ProgressThread({
  student,
  lessons,
  compact = false,
  currentLessonId,
}: ProgressThreadProps) {
  const {
    previous: completed,
    current: upcoming,
    next: afterUpcoming,
  } = progressContext(lessons, student.id, currentLessonId);
  const completedParticipant = completed?.participants.find(
    (entry) => entry.studentId === student.id,
  );
  const scores = completedParticipant?.results.flatMap(
    (result) => result.score ?? [],
  );
  const average = scores?.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : undefined;

  return (
    <div
      className={`progress-thread${compact ? " progress-thread--compact" : ""}`}
    >
      <ThreadNode
        kind="done"
        label="Ostatnio"
        title={completed?.topic || "Brak zakończonej lekcji"}
        detail={
          average
            ? `Ocena ${average}/10`
            : completed
              ? "Wynik bez oceny"
              : "Historia zacznie się po pierwszej lekcji"
        }
      />
      <ThreadNode
        kind="now"
        label="Teraz"
        title={upcoming?.topic || "Plan czeka na uzupełnienie"}
        detail={
          upcoming
            ? `${upcoming.planItems.length} ${upcoming.planItems.length === 1 ? "punkt planu" : "punkty planu"}`
            : "Zaplanuj kolejny krok"
        }
      />
      <ThreadNode
        kind="next"
        label="Następnie"
        title={afterUpcoming?.topic || "Kolejny temat pojawi się tutaj"}
      />
    </div>
  );
}

function ThreadNode({
  kind,
  label,
  title,
  detail,
}: {
  kind: "done" | "now" | "next";
  label: string;
  title: string;
  detail?: string;
}) {
  const Icon = kind === "done" ? Check : kind === "now" ? Diamond : Circle;
  return (
    <div className={`thread-node thread-node--${kind}`}>
      <span className="thread-symbol">
        <Icon size={12} aria-hidden="true" />
      </span>
      <div>
        <small>{label}</small>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}
