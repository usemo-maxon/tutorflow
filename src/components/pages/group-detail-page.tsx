"use client";

import {
  Archive,
  ArrowLeft,
  Pencil,
  Plus,
  RotateCcw,
  UserMinus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
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
  const mutation = useAppMutation(teacher.id);
  const { showToast, showError } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [removeStudentId, setRemoveStudentId] = useState<string | null>(null);
  if (isPending || !data) return <PageLoading />;
  const group = data.groups.find((item) => item.id === groupId);
  if (!group)
    return (
      <div className="not-found">
        <h1>Nie znaleziono grupy</h1>
        <p>Grupa nie istnieje albo nie należy do tego konta.</p>
        <Link className="button button--secondary" href="/app/uczniowie/grupy">
          Wróć do grup
        </Link>
      </div>
    );
  const safeGroup = group;
  const activeMembers = group.members.filter(
    (member) => member.status === "active",
  );
  const students = activeMembers.flatMap((member) =>
    data.students.filter((student) => student.id === member.studentId),
  );
  const lessons = data.lessons.filter((lesson) => lesson.groupId === group.id);
  const tab = searchParams.get("tab") === "schedule" ? "schedule" : "students";

  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/app/uczniowie/grupy/${safeGroup.id}?${params}`, {
      scroll: false,
    });
  }

  async function changeStatus() {
    try {
      const next = safeGroup.status === "active" ? "archived" : "active";
      await mutation.mutateAsync({
        type: "setGroupStatus",
        groupId: safeGroup.id,
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
        groupId: safeGroup.id,
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
    <div className="student-detail page-enter">
      <Link className="back-link" href="/app/uczniowie/grupy">
        <ArrowLeft size={17} />
        Wszystkie grupy
      </Link>
      <header className="student-hero">
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
              disabled={data.teacher.subscription.readOnly}
              onClick={() => setAdding(true)}
            >
              <Plus size={18} />
              Dodaj ucznia
            </button>
          )}
          <button
            className="button button--secondary"
            disabled={data.teacher.subscription.readOnly}
            onClick={() => setEditing(true)}
          >
            <Pencil size={17} />
            Edytuj
          </button>
          <button
            className="button button--quiet"
            disabled={data.teacher.subscription.readOnly}
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
      <section className="profile-summary-strip">
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
          <span>Najbliższa lekcja</span>
          <strong>
            {lessons
              .filter((lesson) => lesson.status === "scheduled")
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
              ? formatDateTime(
                  lessons
                    .filter((lesson) => lesson.status === "scheduled")
                    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
                    .startsAt,
                  data.teacher.timezone,
                )
              : "Nie zaplanowano"}
          </strong>
        </div>
      </section>
      <nav className="tabs" aria-label="Sekcje grupy">
        <button
          className={tab === "students" ? "active" : ""}
          aria-current={tab === "students" ? "page" : undefined}
          onClick={() => selectTab("students")}
        >
          Uczniowie
        </button>
        <button
          className={tab === "schedule" ? "active" : ""}
          aria-current={tab === "schedule" ? "page" : undefined}
          onClick={() => selectTab("schedule")}
        >
          Terminy
        </button>
      </nav>
      {tab === "students" ? (
        <section className="tab-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Aktualny skład</p>
              <h2>Uczniowie</h2>
            </div>
            {group.status === "active" && (
              <button
                className="button button--secondary"
                disabled={data.teacher.subscription.readOnly}
                onClick={() => setAdding(true)}
              >
                <Plus size={17} />
                Dodaj uczniów
              </button>
            )}
          </div>
          {students.length ? (
            <div className="member-list">
              {students.map((student) => (
                <article key={student.id}>
                  <Link href={`/app/uczniowie/${student.id}`}>
                    <span className="avatar" aria-hidden="true">
                      {student.name
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span>
                      <strong>{student.name}</strong>
                      <small>
                        {[student.subject, student.level]
                          .filter(Boolean)
                          .join(" · ") || "Profil do uzupełnienia"}
                      </small>
                    </span>
                  </Link>
                  <button
                    className="icon-button"
                    disabled={data.teacher.subscription.readOnly}
                    aria-label={`Usuń z grupy: ${student.name}`}
                    onClick={() => setRemoveStudentId(student.id)}
                  >
                    <UserMinus size={18} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Ta grupa nie ma jeszcze uczniów."
              action={
                group.status === "active" ? (
                  <button
                    className="button button--primary"
                    disabled={data.teacher.subscription.readOnly}
                    onClick={() => setAdding(true)}
                  >
                    Dodaj pierwszego ucznia
                  </button>
                ) : undefined
              }
            />
          )}
        </section>
      ) : (
        <section className="tab-panel">
          <div className="section-heading">
            <h2>Terminy grupy</h2>
          </div>
          {lessons.length ? (
            <div className="lesson-rows">
              {[...lessons]
                .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
                .map((lesson) => (
                  <Link key={lesson.id} href={`/app/lekcje/${lesson.id}`}>
                    <span>
                      <strong>
                        {formatDateTime(lesson.startsAt, data.teacher.timezone)}
                      </strong>
                      <small>{lesson.durationMinutes} min</small>
                    </span>
                    <span>
                      <strong>{lesson.topic || "Lekcja bez tematu"}</strong>
                      <small>
                        {lesson.status === "scheduled"
                          ? "Zaplanowana"
                          : "Historia"}
                      </small>
                    </span>
                  </Link>
                ))}
            </div>
          ) : (
            <EmptyState title="Nie ma jeszcze lekcji przypisanych do tej grupy." />
          )}
        </section>
      )}
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
