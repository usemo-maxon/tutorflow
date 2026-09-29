"use client";

import {
  Archive,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock3,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  UserMinus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  useAppData,
  useAppMutation,
  useGroupContinuity,
} from "@/hooks/use-app-data";
import type {
  GroupContinuity,
  GroupContinuityMember,
} from "@/lib/group-continuity";
import { difficultyLabel } from "@/lib/lesson-completion";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { GroupComposer } from "../group-composer";
import { GroupMembersDialog } from "../group-members-dialog";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const teacher = useSessionTeacher();
  const { data, isPending } = useAppData(teacher.id);
  const continuity = useGroupContinuity(teacher.id, groupId, Boolean(data));
  const mutation = useAppMutation(teacher.id);
  const { openLessonComposer, showToast, showError } = useAppUi();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [removeStudentId, setRemoveStudentId] = useState<string | null>(null);

  if (isPending || !data) return <PageLoading />;
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) {
    return (
      <div className="not-found">
        <h1>Nie znaleziono grupy</h1>
        <p>Grupa nie istnieje albo nie należy do tego konta.</p>
        <Link className="button button--secondary" href="/app/uczniowie/grupy">
          Wróć do grup
        </Link>
      </div>
    );
  }
  const activeMembers = group.members.filter(
    (member) => member.status === "active" && !member.leftAt,
  );
  const readOnly = data.teacher.subscription.readOnly;

  async function changeStatus() {
    try {
      const next = group!.status === "active" ? "archived" : "active";
      await mutation.mutateAsync({
        type: "setGroupStatus",
        groupId: group!.id,
        status: next,
      });
      setArchiveOpen(false);
      showToast({
        message:
          next === "archived"
            ? "Grupa została zarchiwizowana."
            : "Grupa została przywrócona.",
      });
    } catch (error) {
      showError(error);
    }
  }

  async function removeMember() {
    if (!removeStudentId) return;
    try {
      await mutation.mutateAsync({
        type: "removeGroupMember",
        groupId: group!.id,
        studentId: removeStudentId,
      });
      setRemoveStudentId(null);
      showToast({
        message:
          "Uczeń został usunięty z grupy. Historia członkostwa została zachowana.",
      });
    } catch (error) {
      showError(error);
    }
  }

  const removingStudent = data.students.find(
    (student) => student.id === removeStudentId,
  );
  return (
    <div className="student-detail group-continuity-page page-enter">
      <Link className="back-link" href="/app/uczniowie/grupy">
        <ArrowLeft size={17} />
        Wszystkie grupy
      </Link>

      <header className="student-hero group-continuity-hero">
        <div className="student-hero-main">
          <span className="avatar avatar--large">
            <Users size={28} aria-hidden="true" />
          </span>
          <div>
            <span className={`status-dot status-dot--${group.status}`}>
              {group.status === "active" ? "Aktywna grupa" : "Archiwalna grupa"}
            </span>
            <h1>{group.name}</h1>
            <p>
              {[group.subject, group.level].filter(Boolean).join(" · ") ||
                "Profil do uzupełnienia"}{" "}
              · {activeMembers.length}{" "}
              {activeMembers.length === 1 ? "uczeń" : "uczniów"}
            </p>
          </div>
        </div>
        <div className="student-hero-actions">
          {group.status === "active" && (
            <button
              className="button button--primary"
              disabled={readOnly}
              onClick={() => openLessonComposer({ groupId: group.id })}
            >
              <CalendarDays size={18} />
              Zaplanuj lekcję
            </button>
          )}
          <button
            className="button button--secondary"
            disabled={readOnly}
            onClick={() => setEditing(true)}
          >
            <Pencil size={17} /> Edytuj grupę
          </button>
          <button
            className="button button--quiet"
            disabled={readOnly}
            onClick={() => setArchiveOpen(true)}
          >
            {group.status === "active" ? (
              <Archive size={18} />
            ) : (
              <RotateCcw size={18} />
            )}
            {group.status === "active" ? "Archiwizuj" : "Przywróć"}
          </button>
        </div>
      </header>

      <ContinuityArea
        continuity={continuity.data}
        loading={continuity.isPending}
        failed={continuity.isError}
        timezone={data.teacher.timezone}
        canSchedule={group.status === "active" && !readOnly}
        onRetry={() => continuity.refetch()}
        onSchedule={() => openLessonComposer({ groupId: group.id })}
        onAddMembers={() => setAdding(true)}
        onRemoveMember={readOnly ? undefined : setRemoveStudentId}
      />

      <section
        className="group-details-panel"
        aria-labelledby="group-details-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ustawienia</p>
            <h2 id="group-details-heading">Szczegóły grupy</h2>
          </div>
        </div>
        <div className="profile-summary-strip">
          <div>
            <span>Uczniowie</span>
            <strong>{activeMembers.length}</strong>
          </div>
          <div>
            <span>Domyślny czas</span>
            <strong>{group.defaultDurationMinutes} min</strong>
          </div>
          <div>
            <span>Cena</span>
            <strong>{formatMoney(group.defaultPrice)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>
              {group.status === "active" ? "Aktywna" : "Archiwalna"}
            </strong>
          </div>
        </div>
      </section>

      {editing && (
        <GroupComposer group={group} open onOpenChange={setEditing} />
      )}
      {adding && (
        <GroupMembersDialog group={group} open onOpenChange={setAdding} />
      )}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={
          group.status === "active"
            ? `Archiwizować grupę ${group.name}?`
            : `Przywrócić grupę ${group.name}?`
        }
        description={
          group.status === "active"
            ? "Grupa zniknie z aktywnych list. Historia lekcji i członkostwa zostanie zachowana."
            : "Grupa wróci do aktywnych list i będzie można ponownie dodawać uczniów."
        }
        confirmLabel={
          group.status === "active" ? "Archiwizuj grupę" : "Przywróć grupę"
        }
        tone={group.status === "active" ? "danger" : "primary"}
        pending={mutation.isPending}
        onConfirm={changeStatus}
      />
      <ConfirmDialog
        open={Boolean(removeStudentId)}
        onOpenChange={(open) => !open && setRemoveStudentId(null)}
        title={`Usunąć ${removingStudent?.name ?? "ucznia"} z grupy?`}
        description="Uczeń zniknie z aktualnego składu. Dotychczasowe lekcje i historia członkostwa pozostaną bez zmian."
        confirmLabel="Usuń z grupy"
        pending={mutation.isPending}
        onConfirm={removeMember}
      />
    </div>
  );
}

function ContinuityArea({
  continuity,
  loading,
  failed,
  timezone,
  canSchedule,
  onRetry,
  onSchedule,
  onAddMembers,
  onRemoveMember,
}: {
  continuity?: GroupContinuity;
  loading: boolean;
  failed: boolean;
  timezone: string;
  canSchedule: boolean;
  onRetry: () => void;
  onSchedule: () => void;
  onAddMembers: () => void;
  onRemoveMember?: (studentId: string) => void;
}) {
  if (loading) {
    return (
      <div
        className="group-continuity-loading"
        aria-label="Wczytywanie kontekstu grupy"
      >
        <div className="group-continuity-skeleton group-continuity-skeleton--wide" />
        <div className="group-continuity-skeleton-grid">
          <div className="group-continuity-skeleton" />
          <div className="group-continuity-skeleton" />
          <div className="group-continuity-skeleton" />
        </div>
      </div>
    );
  }
  if (failed || !continuity) {
    return (
      <section className="group-continuity-error" role="alert">
        <CircleAlert size={22} aria-hidden="true" />
        <div>
          <h2>Nie udało się wczytać kontekstu grupy.</h2>
          <p>Szczegóły i ustawienia grupy pozostają dostępne.</p>
        </div>
        <button className="button button--secondary" onClick={onRetry}>
          <RefreshCw size={16} /> Spróbuj ponownie
        </button>
      </section>
    );
  }

  const homework = continuity.lastLesson?.homework;
  const attentionById = new Map(
    continuity.attention.map((item) => [item.studentId, item.kind]),
  );
  return (
    <>
      <section
        className="group-next-lesson"
        aria-labelledby="next-group-lesson-heading"
      >
        <div className="group-section-title">
          <div>
            <p className="eyebrow">Ciągłość zajęć</p>
            <h2 id="next-group-lesson-heading">Następna lekcja</h2>
          </div>
          <CalendarDays size={22} aria-hidden="true" />
        </div>
        {continuity.nextLesson ? (
          <div className="group-next-lesson__body">
            <div>
              <strong>
                {formatDateTime(continuity.nextLesson.startsAt, timezone)}
              </strong>
              <p className="clamp-two">
                {continuity.nextLesson.topic || "Lekcja bez tematu"}
              </p>
              {continuity.nextLesson.objective && (
                <small className="clamp-two">
                  Cel: {continuity.nextLesson.objective}
                </small>
              )}
            </div>
            <Link
              className="button button--primary"
              href={`/app/lekcje/${continuity.nextLesson.id}`}
            >
              Otwórz lekcję <ChevronRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="group-next-lesson__empty">
            <p>Brak zaplanowanej kolejnej lekcji.</p>
            {canSchedule && (
              <button className="button button--primary" onClick={onSchedule}>
                Zaplanuj lekcję
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="group-now-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Wspólny kontekst</p>
            <h2 id="group-now-heading">Na teraz</h2>
          </div>
        </div>
        <div className="group-now-grid">
          <article className="group-now-card">
            <Clock3 size={20} aria-hidden="true" />
            <span>Ostatnia lekcja</span>
            {continuity.lastLesson ? (
              <>
                <strong>
                  {formatDateTime(continuity.lastLesson.startsAt, timezone)}
                </strong>
                <p className="clamp-two">
                  {continuity.lastLesson.topic || "Lekcja bez tematu"}
                </p>
                {continuity.lastLesson.objective && (
                  <small className="clamp-two">
                    Cel: {continuity.lastLesson.objective}
                  </small>
                )}
              </>
            ) : (
              <p>Nie było jeszcze żadnej lekcji tej grupy.</p>
            )}
          </article>
          <article className="group-now-card">
            <BookOpen size={20} aria-hidden="true" />
            <span>Praca domowa</span>
            {homework ? (
              <>
                <strong className="clamp-two">{homework.title}</strong>
                {homework.description && (
                  <p className="clamp-two">{homework.description}</p>
                )}
              </>
            ) : (
              <p>Brak zapisanej wspólnej pracy domowej.</p>
            )}
          </article>
          <article className="group-now-card group-now-card--coverage">
            <Users size={20} aria-hidden="true" />
            <span>Kontekst uczniów</span>
            <strong>
              {continuity.coverage.withRecentContext} z{" "}
              {continuity.coverage.members}
            </strong>
            <p>
              Kontekst zapisany dla {continuity.coverage.withRecentContext} z{" "}
              {continuity.coverage.members} uczniów.
            </p>
          </article>
        </div>
      </section>

      <section aria-labelledby="group-students-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Aktualny skład</p>
            <h2 id="group-students-heading">Uczniowie</h2>
          </div>
          {canSchedule && (
            <button className="button button--secondary" onClick={onAddMembers}>
              <Plus size={17} /> Dodaj uczniów
            </button>
          )}
        </div>
        {continuity.members.length ? (
          <div className="group-member-continuity-list">
            {continuity.members.map((member) => (
              <MemberCard
                key={member.student.id}
                member={member}
                attention={attentionById.get(member.student.id)}
                onRemove={onRemoveMember}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Ta grupa nie ma jeszcze uczniów."
            action={
              canSchedule ? (
                <button
                  className="button button--primary"
                  onClick={onAddMembers}
                >
                  Dodaj pierwszego ucznia
                </button>
              ) : undefined
            }
          />
        )}
      </section>

      {continuity.attention.length > 0 && (
        <section
          className="group-attention"
          aria-labelledby="group-attention-heading"
        >
          <div className="group-section-title">
            <div>
              <p className="eyebrow">Fakty do przygotowania</p>
              <h2 id="group-attention-heading">Warto uwzględnić</h2>
            </div>
            <CircleAlert size={20} aria-hidden="true" />
          </div>
          <ul>
            {continuity.attention.map((item) => {
              const member = continuity.members.find(
                (candidate) => candidate.student.id === item.studentId,
              )!;
              return (
                <li key={item.studentId}>
                  <Link href={`/app/uczniowie/${member.student.id}`}>
                    <strong>{member.student.name}</strong>
                    <span>
                      {item.kind === "hard"
                        ? "Ostatnia zapisana trudność: Trudno"
                        : item.kind === "mixed"
                          ? "Ostatnia zapisana trudność: Różnie"
                          : "Brak ostatniego kontekstu"}
                    </span>
                    <ChevronRight size={16} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent-group-lessons-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Historia grupy</p>
            <h2 id="recent-group-lessons-heading">Ostatnie lekcje</h2>
          </div>
        </div>
        {continuity.recentLessons.length ? (
          <div className="group-history-list">
            {continuity.recentLessons.map((lesson) => (
              <article key={lesson.id}>
                <div className="group-history-main">
                  <time dateTime={lesson.startsAt}>
                    {formatDateTime(lesson.startsAt, timezone)}
                  </time>
                  <strong className="clamp-two">
                    {lesson.topic || "Lekcja bez tematu"}
                  </strong>
                  {lesson.homework && (
                    <p className="clamp-two">
                      Praca domowa: {lesson.homework.title}
                    </p>
                  )}
                </div>
                <div className="group-history-counts">
                  <span>
                    Obecni:{" "}
                    <strong>
                      {lesson.attendance.present} z{" "}
                      {lesson.attendance.participants}
                    </strong>
                  </span>
                  <span>
                    Podsumowania:{" "}
                    <strong>
                      {lesson.outcomeCoverage.withOutcome} z{" "}
                      {lesson.outcomeCoverage.participants}
                    </strong>
                  </span>
                </div>
                <Link
                  className="button button--secondary"
                  href={`/app/lekcje/${lesson.id}`}
                >
                  Otwórz lekcję
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nie było jeszcze żadnej lekcji tej grupy."
            action={
              canSchedule ? (
                <button className="button button--primary" onClick={onSchedule}>
                  Zaplanuj pierwszą lekcję
                </button>
              ) : undefined
            }
          />
        )}
      </section>
    </>
  );
}

function MemberCard({
  member,
  attention,
  onRemove,
}: {
  member: GroupContinuityMember;
  attention?: GroupContinuity["attention"][number]["kind"];
  onRemove?: (studentId: string) => void;
}) {
  const label = difficultyLabel(member.difficulty?.level);
  return (
    <article className="group-member-continuity-card">
      <Link
        className="group-member-continuity-card__main"
        href={`/app/uczniowie/${member.student.id}`}
      >
        <span className="avatar" aria-hidden="true">
          {initials(member.student.name)}
        </span>
        <span className="group-member-continuity-card__identity">
          <strong>{member.student.name}</strong>
          <small>{member.student.level || "Poziom do uzupełnienia"}</small>
        </span>
        <span className="group-member-continuity-card__context">
          {label && (
            <span
              className={`difficulty-pill difficulty-pill--${member.difficulty?.level}`}
            >
              {label}
            </span>
          )}
          {member.difficulty?.note ? (
            <span className="clamp-two">Problem: {member.difficulty.note}</span>
          ) : member.nextStep ? (
            <span className="clamp-two">Dalej: {member.nextStep.text}</span>
          ) : (
            <span className="group-member-continuity-card__empty">
              {member.isNewToGroup
                ? "Brak wcześniejszej historii w tej grupie"
                : "Brak ostatniego podsumowania"}
            </span>
          )}
          {(member.difficulty?.source === "other_lesson" ||
            member.nextStep?.source === "other_lesson") && (
            <small>Kontekst z ostatniej zapisanej lekcji ucznia</small>
          )}
        </span>
        {attention && (
          <span className="sr-only">Wymaga uwagi przed kolejną lekcją.</span>
        )}
        <ChevronRight
          className="group-member-continuity-card__chevron"
          size={18}
          aria-hidden="true"
        />
      </Link>
      {onRemove && (
        <button
          className="icon-button"
          aria-label={`Usuń z grupy: ${member.student.name}`}
          onClick={() => onRemove(member.student.id)}
        >
          <UserMinus size={18} />
        </button>
      )}
    </article>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}
