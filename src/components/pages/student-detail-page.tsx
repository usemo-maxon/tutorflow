"use client";

import {
  Archive,
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  CreatePackageDialog,
  RecordPaymentDialog,
} from "@/components/finance-dialogs";
import {
  useAppData,
  useAppMutation,
  useFinancialOverview,
  useStudentMemory,
} from "@/hooks/use-app-data";
import type { Money, StudentContact } from "@/lib/domain";
import { copy } from "@/lib/copy";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  AttendanceSection,
  ContinuitySection,
  MemoryErrorState,
  MemoryLoadingState,
  NextLessonSection,
  RecentLessonsSection,
} from "../student-memory-sections";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { ContactComposer } from "../contact-composer";
import { ProgressThread } from "../progress-thread";
import { StudentGroupDialog } from "../student-group-dialog";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";
import { LessonStatusBadge } from "../ui/status-badge";

const tabs = [
  ["overview", "Przegląd"],
  ["lessons", "Lekcje"],
  ["progress", "Postęp"],
  ["payments", "Płatności"],
  ["materials", "Materiały"],
] as const;

export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const session = useSessionTeacher();
  const { data, isPending } = useAppData(
    session.id,
    undefined,
    "student-detail",
  );
  const student = data?.students.find(
    (candidate) => candidate.id === studentId,
  );
  const memoryQuery = useStudentMemory(session.id, studentId, Boolean(student));
  const financeQuery = useFinancialOverview(
    session.id,
    studentId,
    Boolean(student),
  );
  const mutation = useAppMutation(session.id);
  const { openLessonComposer, openStudentComposer, showToast, showError } =
    useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [contactEditor, setContactEditor] = useState<
    StudentContact | null | undefined
  >(undefined);
  const [removeContact, setRemoveContact] = useState<StudentContact | null>(
    null,
  );
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  if (isPending || !data) return <PageLoading />;
  if (!student)
    return (
      <div className="not-found">
        <h1>Nie znaleziono ucznia</h1>
        <p>Uczeń mógł zostać usunięty albo nie należy do tego konta.</p>
        <Link className="button button--secondary" href="/app/uczniowie">
          Wróć do listy
        </Link>
      </div>
    );
  const safeStudent = student;
  const related = data.lessons.filter((lesson) =>
    lesson.participantIds.includes(student.id),
  );
  const completed = related
    .filter((lesson) => lesson.status === "completed")
    .reverse();
  const activeTab = tabs.some(([key]) => key === searchParams.get("tab"))
    ? searchParams.get("tab")!
    : "overview";
  async function toggleArchive() {
    const next = safeStudent.status === "active" ? "archived" : "active";
    try {
      await mutation.mutateAsync({
        type: "setStudentStatus",
        studentId: safeStudent.id,
        status: next,
      });
      showToast({
        message:
          next === "archived"
            ? copy.toasts.studentArchived
            : copy.toasts.studentRestored,
      });
      setArchiveOpen(false);
    } catch (error) {
      showError(error);
    }
  }
  async function removeContactRelation() {
    if (!removeContact) return;
    try {
      await mutation.mutateAsync({
        type: "removeStudentContact",
        relationId: removeContact.id,
      });
      setRemoveContact(null);
      showToast({ message: "Kontakt został odłączony od ucznia." });
    } catch (error) {
      showError(error);
    }
  }
  function selectTab(tab: string) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    router.replace(`/app/uczniowie/${safeStudent.id}?${params}`, {
      scroll: false,
    });
  }
  function scheduleLesson() {
    openLessonComposer({ studentIds: [safeStudent.id] });
  }
  return (
    <div className="student-detail page-enter">
      <Link className="back-link" href="/app/uczniowie">
        <ArrowLeft size={17} />
        Wszyscy uczniowie
      </Link>
      <header className="student-hero">
        <div className="student-hero-main">
          <span className="avatar avatar--large">
            {student.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <span className={`status-dot status-dot--${student.status}`}>
              {student.status === "active"
                ? "Aktywny uczeń"
                : "Archiwalny uczeń"}
            </span>
            <h1>{student.name}</h1>
            <p>
              {[student.subject, student.level].filter(Boolean).join(" · ") ||
                "Profil do uzupełnienia"}
            </p>
            <div className="student-goal">
              <span>Cel</span>
              <strong>
                {student.goal || "Nie określono jeszcze celu nauki."}
              </strong>
            </div>
          </div>
        </div>
        <div className="student-hero-actions">
          {student.status === "active" && (
            <button
              className="button button--primary"
              disabled={data.teacher.subscription.readOnly}
              onClick={scheduleLesson}
            >
              <CalendarDays size={18} />
              {copy.actions.planLesson}
            </button>
          )}
          <button
            className="button button--secondary"
            disabled={data.teacher.subscription.readOnly}
            onClick={() => openStudentComposer(student)}
          >
            <Pencil size={17} />
            Edytuj ucznia
          </button>
          <details className="context-actions">
            <summary aria-label="Więcej działań ucznia">Więcej</summary>
            <button
              className="button button--quiet"
              disabled={
                mutation.isPending || data.teacher.subscription.readOnly
              }
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                setArchiveOpen(true);
              }}
            >
              {student.status === "active" ? (
                <Archive size={18} />
              ) : (
                <RotateCcw size={18} />
              )}
              {student.status === "active"
                ? copy.actions.archive
                : copy.actions.restore}
            </button>
          </details>
        </div>
      </header>
      <nav className="tabs" aria-label="Sekcje karty ucznia">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={activeTab === key ? "active" : ""}
            onClick={() => selectTab(key)}
            aria-current={activeTab === key ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      {activeTab === "overview" && (
        <div className="student-360-overview">
          {memoryQuery.isPending ? (
            <MemoryLoadingState />
          ) : memoryQuery.isError || !memoryQuery.data ? (
            <MemoryErrorState onRetry={() => void memoryQuery.refetch()} />
          ) : (
            <>
              <NextLessonSection
                memory={memoryQuery.data}
                timezone={data.teacher.timezone}
                canSchedule={
                  student.status === "active" &&
                  !data.teacher.subscription.readOnly
                }
                onSchedule={scheduleLesson}
              />
              <ContinuitySection
                memory={memoryQuery.data}
                timezone={data.teacher.timezone}
                canSchedule={
                  student.status === "active" &&
                  !data.teacher.subscription.readOnly
                }
                onSchedule={scheduleLesson}
              />
              <div className="student-360-columns">
                <RecentLessonsSection
                  memory={memoryQuery.data}
                  timezone={data.teacher.timezone}
                />
                <aside
                  className="student-360-sidebar"
                  aria-label="Kontekst ucznia"
                >
                  <AttendanceSection memory={memoryQuery.data} />
                  <StudentFinanceSummary
                    financeQuery={financeQuery}
                    fallbackBalance={student.balanceDue}
                    fallbackPackageRemaining={student.packageRemainingLessons}
                    onOpen={() => selectTab("payments")}
                  />
                  <section
                    className="student-side-card panel"
                    aria-labelledby="groups-title"
                  >
                    <div className="student-side-card__heading">
                      <Users size={19} aria-hidden="true" />
                      <h2 id="groups-title">Grupy</h2>
                    </div>
                    {student.groupIds.length ? (
                      <div className="membership-links membership-links--compact">
                        {data.groups
                          .filter((group) =>
                            student.groupIds.includes(group.id),
                          )
                          .map((group) => (
                            <Link
                              href={`/app/uczniowie/grupy/${group.id}`}
                              key={group.id}
                            >
                              <span>
                                <strong>{group.name}</strong>
                                <small>
                                  {[group.subject, group.level]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                              </span>
                              <span aria-hidden="true">›</span>
                            </Link>
                          ))}
                      </div>
                    ) : (
                      <p className="memory-section-empty">
                        Uczeń nie należy do żadnej aktywnej grupy.
                      </p>
                    )}
                    {student.status === "active" &&
                      !data.teacher.subscription.readOnly && (
                        <button
                          className="text-link"
                          onClick={() => setGroupDialogOpen(true)}
                        >
                          <Plus size={15} aria-hidden="true" /> Dodaj do grupy
                        </button>
                      )}
                  </section>
                </aside>
              </div>
            </>
          )}

          <section
            className="student-profile-details panel"
            aria-labelledby="student-info-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Dane i ustawienia</p>
                <h2 id="student-info-title">Informacje</h2>
              </div>
              <GraduationCap size={21} aria-hidden="true" />
            </div>
            <dl className="student-info-grid">
              <div>
                <dt>E-mail</dt>
                <dd>
                  <Mail size={15} aria-hidden="true" />
                  {student.email || "Nie podano"}
                </dd>
              </div>
              <div>
                <dt>Telefon</dt>
                <dd>
                  <Phone size={15} aria-hidden="true" />
                  {student.phone || "Nie podano"}
                </dd>
              </div>
              <div>
                <dt>Przedmiot</dt>
                <dd>{student.subject || "Nie podano"}</dd>
              </div>
              <div>
                <dt>Poziom</dt>
                <dd>{student.level || "Nie podano"}</dd>
              </div>
              <div>
                <dt>Czas lekcji</dt>
                <dd>
                  <Clock3 size={15} aria-hidden="true" />
                  {student.defaultDurationMinutes} min
                </dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>
                  {student.defaultFormat === "online"
                    ? "Online"
                    : "Stacjonarnie"}
                </dd>
              </div>
              <div>
                <dt>Cena</dt>
                <dd>{formatMoney(student.defaultPrice)}</dd>
              </div>
              <div>
                <dt>Strefa czasowa</dt>
                <dd>{student.timezone || data.teacher.timezone}</dd>
              </div>
              <div className="student-info-grid__wide">
                <dt>Link lub adres</dt>
                <dd className="breakable">
                  {student.defaultLocation || "Nie podano"}
                </dd>
              </div>
            </dl>
            {student.notes && (
              <div className="student-note">
                <strong>Notatka</strong>
                <p>{student.notes}</p>
              </div>
            )}
          </section>

          <section
            className="student-contacts panel"
            aria-labelledby="contacts-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Rodzice i opiekunowie</p>
                <h2 id="contacts-title">Kontakty</h2>
              </div>
              {!data.teacher.subscription.readOnly && (
                <button
                  className="button button--secondary"
                  onClick={() => setContactEditor(null)}
                >
                  <Plus size={17} /> Dodaj kontakt
                </button>
              )}
            </div>
            {data.contacts.filter((item) => item.studentId === student.id)
              .length ? (
              <div className="contact-list">
                {data.contacts
                  .filter((item) => item.studentId === student.id)
                  .map((contact) => (
                    <article key={contact.id}>
                      <div>
                        <strong>{contact.displayName}</strong>
                        <small>
                          {contact.relationship || "Kontakt"}
                          {contact.isPrimary ? " · Główny" : ""}
                          {contact.isBillingContact ? " · Rozliczenia" : ""}
                        </small>
                        <span>
                          {[contact.email, contact.phone]
                            .filter(Boolean)
                            .join(" · ") || "Brak danych kontaktowych"}
                        </span>
                      </div>
                      {!data.teacher.subscription.readOnly && (
                        <div className="inline-actions">
                          <button
                            className="text-link"
                            onClick={() => setContactEditor(contact)}
                          >
                            Edytuj
                          </button>
                          <button
                            className="text-link text-link--danger"
                            onClick={() => setRemoveContact(contact)}
                          >
                            Odłącz
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
              </div>
            ) : (
              <EmptyState title="Nie dodano jeszcze rodzica, opiekuna ani kontaktu do rozliczeń." />
            )}
          </section>
        </div>
      )}
      {activeTab === "lessons" && (
        <section className="tab-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pełna historia</p>
              <h2>Lekcje</h2>
            </div>
          </div>
          {related.length ? (
            <div className="lesson-rows">
              {[...related].reverse().map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  timezone={data.teacher.timezone}
                />
              ))}
            </div>
          ) : (
            <EmptyState title={copy.empty.lessons} />
          )}
        </section>
      )}
      {activeTab === "progress" && (
        <section className="tab-panel progress-history">
          <ProgressThread student={student} lessons={related} />
          <div className="topic-history">
            <h2>Ocenione tematy</h2>
            {completed.length ? (
              completed.map((lesson) => {
                const results =
                  lesson.participants.find(
                    (part) => part.studentId === student.id,
                  )?.results ?? [];
                const scores = results.flatMap((result) => result.score ?? []);
                const score = scores.length
                  ? Math.round(
                      scores.reduce((a, b) => a + b, 0) / scores.length,
                    )
                  : null;
                return (
                  <Link href={`/app/lekcje/${lesson.id}`} key={lesson.id}>
                    <span>
                      <strong>{lesson.topic || "Lekcja bez tematu"}</strong>
                      <small>
                        {formatDateTime(lesson.startsAt, data.teacher.timezone)}
                      </small>
                    </span>
                    <span className="score-number">
                      {score ? `${score}/10` : "—"}
                    </span>
                  </Link>
                );
              })
            ) : (
              <EmptyState title="Oceny pojawią się po uzupełnieniu wyników lekcji." />
            )}
          </div>
        </section>
      )}
      {activeTab === "payments" && (
        <section className="tab-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Płatności i pakiety</p>
              <h2>Rozliczenia ucznia</h2>
            </div>
            {financeQuery.data && !data.teacher.subscription.readOnly && (
              <div className="finance-header-actions">
                <CreatePackageDialog
                  overview={financeQuery.data}
                  defaultStudentId={student.id}
                />
                <RecordPaymentDialog
                  overview={financeQuery.data}
                  defaultStudentId={student.id}
                />
              </div>
            )}
          </div>
          {financeQuery.isPending ? (
            <PageLoading />
          ) : financeQuery.data ? (
            <div className="student-finance">
              <section
                className="student-balance-card"
                aria-label="Saldo ucznia"
              >
                <span>Do zapłaty</span>
                <strong>
                  {formatMoney({
                    amount: financeQuery.data.summary.outstanding,
                    currency: financeQuery.data.summary.currency,
                  })}
                </strong>
                <small>
                  {financeQuery.data.summary.overdue > 0
                    ? `${formatMoney({ amount: financeQuery.data.summary.overdue, currency: financeQuery.data.summary.currency })} po terminie`
                    : "Brak zaległości po terminie"}
                </small>
              </section>
              <div className="student-finance-grid">
                <section>
                  <h3>Otwarte pozycje</h3>
                  {financeQuery.data.openCharges.length ? (
                    <div className="finance-list" role="list">
                      {financeQuery.data.openCharges.map((charge) => (
                        <article
                          className="finance-list-row finance-list-row--compact"
                          role="listitem"
                          key={charge.id}
                        >
                          <div className="finance-list-main">
                            <strong>{charge.description}</strong>
                            <span>
                              {charge.overdue
                                ? "Po terminie"
                                : charge.dueAt
                                  ? `Termin ${formatDateTime(charge.dueAt, financeQuery.data!.workspace.timezone)}`
                                  : "Bez terminu"}
                            </span>
                          </div>
                          <div className="finance-list-amount">
                            <strong>
                              {formatMoney({
                                amount: charge.outstanding,
                                currency: charge.currency,
                              })}
                            </strong>
                            {charge.allocated > 0 && (
                              <small>częściowo opłacone</small>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Brak otwartych należności" />
                  )}
                </section>
                <section>
                  <h3>Pakiety</h3>
                  {financeQuery.data.packages.length ? (
                    <div className="student-package-list">
                      {financeQuery.data.packages.map((item) => (
                        <article className="package-card" key={item.id}>
                          <div className="package-card-head">
                            <div>
                              <strong>{item.name}</strong>
                              <span>
                                {item.remainingLessons} z {item.totalLessons}{" "}
                                zajęć pozostało
                              </span>
                            </div>
                          </div>
                          <div className="package-progress">
                            <span
                              style={{
                                width: `${Math.min(100, (item.usedLessons / item.totalLessons) * 100)}%`,
                              }}
                            />
                          </div>
                          <p>
                            {formatMoney({
                              amount: item.price,
                              currency: item.currency,
                            })}
                            {item.expiresAt
                              ? ` · ważny do ${new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: financeQuery.data!.workspace.timezone }).format(new Date(item.expiresAt))}`
                              : ""}
                          </p>
                          {item.paymentOutstanding > 0 && (
                            <small className="package-payment-due">
                              Płatność do uregulowania
                            </small>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Brak pakietów" />
                  )}
                </section>
              </div>
              <section>
                <h3>Ostatnie płatności</h3>
                {financeQuery.data.recentPayments.length ? (
                  <div className="finance-list" role="list">
                    {financeQuery.data.recentPayments.map((payment) => (
                      <article
                        className="finance-list-row finance-list-row--compact"
                        role="listitem"
                        key={payment.id}
                      >
                        <div className="finance-list-main">
                          <strong>{payment.note || "Płatność"}</strong>
                          <span>
                            {payment.paidAt
                              ? formatDateTime(
                                  payment.paidAt,
                                  financeQuery.data!.workspace.timezone,
                                )
                              : ""}
                          </span>
                        </div>
                        <div className="finance-list-amount">
                          <strong>
                            {formatMoney({
                              amount: payment.amount,
                              currency: payment.currency,
                            })}
                          </strong>
                          {payment.unallocated > 0 && (
                            <small>
                              {formatMoney({
                                amount: payment.unallocated,
                                currency: payment.currency,
                              })}{" "}
                              nieprzypisane
                            </small>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Brak płatności" />
                )}
              </section>
            </div>
          ) : (
            <EmptyState title="Nie udało się wczytać rozliczeń." />
          )}
        </section>
      )}
      {activeTab === "materials" && (
        <section className="tab-panel">
          <div className="section-heading">
            <h2>Materiały</h2>
          </div>
          <EmptyState
            title="Dodawanie plików nie jest jeszcze dostępne. Plan, pracę domową i notatki znajdziesz w każdej lekcji."
            action={
              <button
                className="button button--secondary"
                onClick={() => selectTab("lessons")}
              >
                Przejdź do lekcji
              </button>
            }
          />
        </section>
      )}
      <ContactComposer
        studentId={student.id}
        contact={contactEditor ?? null}
        open={contactEditor !== undefined}
        onOpenChange={(open) => !open && setContactEditor(undefined)}
      />
      <StudentGroupDialog
        studentId={student.id}
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={
          student.status === "active"
            ? `Archiwizować ${student.name}?`
            : `Przywrócić ${student.name}?`
        }
        description={
          student.status === "active"
            ? "Uczeń zniknie z aktywnych list i selektorów. Historia lekcji, płatności i pakietów zostanie zachowana."
            : "Uczeń wróci do aktywnych list i będzie można planować kolejne lekcje."
        }
        confirmLabel={
          student.status === "active" ? "Archiwizuj ucznia" : "Przywróć ucznia"
        }
        tone={student.status === "active" ? "danger" : "primary"}
        pending={mutation.isPending}
        onConfirm={toggleArchive}
      />
      <ConfirmDialog
        open={Boolean(removeContact)}
        onOpenChange={(open) => !open && setRemoveContact(null)}
        title={`Odłączyć kontakt ${removeContact?.displayName ?? ""}?`}
        description="Kontakt przestanie być widoczny w tym profilu. Dane ucznia i historia lekcji pozostaną bez zmian."
        confirmLabel="Odłącz kontakt"
        pending={mutation.isPending}
        onConfirm={removeContactRelation}
      />
    </div>
  );
}

function StudentFinanceSummary({
  financeQuery,
  fallbackBalance,
  fallbackPackageRemaining,
  onOpen,
}: {
  financeQuery: ReturnType<typeof useFinancialOverview>;
  fallbackBalance: Money;
  fallbackPackageRemaining: number | null;
  onOpen: () => void;
}) {
  const overview = financeQuery.data;
  const outstanding = overview?.summary.outstanding ?? fallbackBalance.amount;
  const currency = overview?.summary.currency ?? fallbackBalance.currency;
  const activePackages = overview?.packages
    .filter((item) => item.status === "active")
    .slice(0, 2);

  return (
    <section
      className="student-side-card panel"
      aria-labelledby="finance-summary-title"
    >
      <div className="student-side-card__heading">
        <CircleDollarSign size={19} aria-hidden="true" />
        <h2 id="finance-summary-title">Rozliczenia</h2>
      </div>
      {financeQuery.isPending ? (
        <div
          className="student-side-skeleton"
          aria-label="Wczytywanie rozliczeń"
          aria-busy="true"
        >
          <div className="skeleton skeleton--wide" />
          <div className="skeleton skeleton--title" />
        </div>
      ) : financeQuery.isError ? (
        <div className="student-side-error" role="status">
          <p>Nie udało się wczytać rozliczeń.</p>
          <button
            className="text-link"
            onClick={() => void financeQuery.refetch()}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : (
        <>
          <div className="finance-summary-amount">
            <span>Do zapłaty</span>
            <strong>
              {outstanding > 0
                ? formatMoney({ amount: outstanding, currency })
                : "Brak zaległości"}
            </strong>
          </div>
          {activePackages?.length ? (
            <div className="finance-package-summary">
              {activePackages.map((item) => (
                <div key={item.id}>
                  <span>{item.name}</span>
                  <strong>
                    {item.remainingLessons} z {item.totalLessons} lekcji
                    pozostało
                  </strong>
                </div>
              ))}
            </div>
          ) : fallbackPackageRemaining !== null ? (
            <p className="student-side-card__hint">
              Pakiet: {fallbackPackageRemaining} lekcji pozostało
            </p>
          ) : (
            <p className="student-side-card__hint">Brak aktywnego pakietu</p>
          )}
          <button className="text-link" onClick={onOpen}>
            Zobacz rozliczenia
          </button>
        </>
      )}
    </section>
  );
}

function LessonRow({
  lesson,
  timezone,
}: {
  lesson: import("@/lib/domain").Lesson;
  timezone: string;
}) {
  return (
    <Link href={`/app/lekcje/${lesson.id}`}>
      <span className="lesson-date">
        <strong>{formatDateTime(lesson.startsAt, timezone)}</strong>
        <small>
          {lesson.durationMinutes} min ·{" "}
          {lesson.format === "online" ? "online" : "stacjonarnie"}
        </small>
      </span>
      <span className="lesson-topic">
        <strong>{lesson.topic || "Temat do ustalenia"}</strong>
        <small>{lesson.planItems.length} punktów planu</small>
      </span>
      <LessonStatusBadge status={lesson.status} />
    </Link>
  );
}
