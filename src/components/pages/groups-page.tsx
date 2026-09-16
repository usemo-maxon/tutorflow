"use client";

import { Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { formatMoney } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { GroupComposer } from "../group-composer";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

export function GroupsPage() {
  const teacher = useSessionTeacher();
  const { data, isPending } = useAppData(teacher.id);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState(false);
  const status =
    searchParams.get("status") === "archived" ? "archived" : "active";
  const groups = useMemo(
    () =>
      (data?.groups ?? []).filter(
        (group) =>
          group.status === status &&
          [group.name, group.subject, group.level]
            .join(" ")
            .toLocaleLowerCase("pl")
            .includes(search.toLocaleLowerCase("pl")),
      ),
    [data, search, status],
  );
  if (isPending || !data) return <PageLoading />;

  function setStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", value);
    router.replace(`/app/uczniowie/grupy?${params}`, { scroll: false });
  }

  return (
    <div className="students-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">Stałe składy</p>
          <h1>Grupy</h1>
          <p className="page-intro">
            Zarządzaj składami i ustawieniami wspólnych lekcji.
          </p>
        </div>
        <button
          className="button button--primary"
          disabled={data.teacher.subscription.readOnly}
          onClick={() => setComposer(true)}
        >
          <Plus size={18} aria-hidden="true" />
          Utwórz grupę
        </button>
      </header>
      <nav className="module-switch" aria-label="Uczniowie i grupy">
        <Link href="/app/uczniowie">Uczniowie</Link>
        <Link
          className="active"
          href="/app/uczniowie/grupy"
          aria-current="page"
        >
          Grupy
        </Link>
      </nav>
      <div className="list-toolbar list-toolbar--crm">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Szukaj grup</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj po nazwie, przedmiocie lub poziomie"
          />
        </label>
        <div className="segmented-control segmented-control--compact">
          <button
            className={status === "active" ? "selected" : ""}
            aria-pressed={status === "active"}
            onClick={() => setStatus("active")}
          >
            Aktywne
          </button>
          <button
            className={status === "archived" ? "selected" : ""}
            aria-pressed={status === "archived"}
            onClick={() => setStatus("archived")}
          >
            Archiwalne
          </button>
        </div>
      </div>
      {groups.length ? (
        <div className="group-grid">
          {groups.map((group) => {
            const activeMembers = group.members.filter(
              (member) => member.status === "active",
            );
            const next = data.lessons
              .filter(
                (lesson) =>
                  lesson.groupId === group.id && lesson.status === "scheduled",
              )
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
            return (
              <Link
                className="group-card"
                href={`/app/uczniowie/grupy/${group.id}`}
                key={group.id}
              >
                <span className="group-card__icon">
                  <Users size={20} aria-hidden="true" />
                </span>
                <span className="group-card__main">
                  <strong>{group.name}</strong>
                  <small>
                    {[group.subject, group.level].filter(Boolean).join(" · ") ||
                      "Profil do uzupełnienia"}
                  </small>
                </span>
                <dl>
                  <div>
                    <dt>Uczniowie</dt>
                    <dd>{activeMembers.length}</dd>
                  </div>
                  <div>
                    <dt>Następna lekcja</dt>
                    <dd>
                      {next
                        ? new Intl.DateTimeFormat("pl-PL", {
                            weekday: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: data.teacher.timezone,
                          }).format(new Date(next.startsAt))
                        : "Nie zaplanowano"}
                    </dd>
                  </div>
                  <div>
                    <dt>Cena</dt>
                    <dd>{formatMoney(group.defaultPrice)}</dd>
                  </div>
                </dl>
                <span className="group-card__arrow" aria-hidden="true">
                  ›
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            search
              ? "Nie znaleziono grup pasujących do wyszukiwania."
              : status === "active"
                ? "Nie masz jeszcze grup. Utwórz pierwszą i dodaj uczniów."
                : "Nie masz archiwalnych grup."
          }
          action={
            !search && status === "active" ? (
              <button
                className="button button--primary"
                onClick={() => setComposer(true)}
              >
                Utwórz pierwszą grupę
              </button>
            ) : undefined
          }
        />
      )}
      {composer && (
        <GroupComposer
          open
          onOpenChange={setComposer}
          onCreated={(id) => router.push(`/app/uczniowie/grupy/${id}`)}
        />
      )}
    </div>
  );
}
