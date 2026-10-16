# P1.1 — gotowość do prywatnej bety

## Decyzja techniczna

Status po wdrożeniu zmian: **bramka aplikacji i lokalny smoke test zaliczone;
oczekuje na ręczny smoke test wdrożenia produkcyjnego**.

Zakres P1.1 nie dodaje funkcji produktowych ani nowej analityki. Kontakt beta
działa przez przygotowaną wiadomość e-mail, a aktywację można policzyć z już
utrwalonych danych domenowych. Ta faza nie zawiera migracji i nie modyfikuje
bazy produkcyjnej.

## Wyniki automatyczne

- [x] `npm run check` — lint, typy, 457 testów i build produkcyjny
- [x] `git diff --check`
- [x] regresje: uwierzytelnianie i onboarding
- [x] regresje: Student, Calendar i Lesson CRUD
- [x] regresje: przygotowanie, materiały, zakończenie, Outcome, Student Memory i praca domowa
- [x] regresje: publiczna rezerwacja i anulowanie
- [x] regresje: granice Free/Pro i tryb tylko do odczytu
- [x] przegląd izolacji workspace/RLS — P1.1 nie zmienia SQL; istniejący test pgTAP dwóch tutorów pozostaje źródłem weryfikacji wdrożeniowej

Lokalny smoke test na widoku 390 × 844 potwierdził: logowanie nieukończonego
konta wraca do onboardingu, utworzenie Studenta, zaplanowanie dwóch lekcji,
przygotowanie planu, dołączenie materiałów, zapis podsumowania i pracy domowej,
ukończenie lekcji z obecnością i Outcome oraz widoczność poprzedniego kontekstu
w kolejnej lekcji i Student Memory. Nie wystąpiło poziome przewijanie. Sprawdzono
też treść linku feedbackowego oraz publiczną Politykę prywatności.

Powyższe pola należy oznaczyć dopiero po wykonaniu komend. Testy Supabase są
wymagane ponownie tylko wtedy, gdy po P1.1 zmieni się SQL albo polityka RLS.

## Zmiany gotowe do bety

- Globalna akcja **Zgłoś problem / Przekaż opinię** jest dostępna na desktopie
  i w menu mobilnym. Otwiera wiadomość do `support@easy4tutor.pl` z polami:
  obszar, problem lub sugestia oraz opcjonalne kroki odtworzenia.
- Szablon wiadomości prosi, aby nie wpisywać imion uczniów, notatek z lekcji ani
  innych danych osobowych. Aplikacja niczego takiego nie dołącza automatycznie.
- Pierwsza sesja krótko wyjaśnia, czym jest easy4tutor, gdzie znajduje się plan
  dnia oraz jak przejść od przygotowania przez zakończenie lekcji do kolejnego
  kontekstu nauki.
- Nieoczekiwane błędy serwera otrzymują identyfikator korelacji, ale do logów nie
  trafia surowy komunikat, stos ani payload mogący zawierać dane ucznia.

## Kamienie milowe aktywacji

| Kamień milowy | Źródło | Definicja |
| --- | --- | --- |
| konto utworzone | `profiles.created_at` | profil nauczyciela utworzony po rozpoczęciu bety |
| onboarding ukończony | `profiles.onboarding_completed_at` | znacznik ustawiony po serwerowej walidacji wymaganych kroków |
| pierwszy Student utworzony | `students.created_at` | co najmniej jeden Student we własnym workspace |
| pierwsza Lesson zaplanowana | `lessons.created_at` | co najmniej jedna lekcja ze statusem innym niż `cancelled` |
| pierwsza Lesson ukończona | `lessons.completed_at` / `status` | co najmniej jedna lekcja ze statusem `completed` |
| pierwszy Lesson Outcome zapisany | `lesson_student_outcomes.created_at` | co najmniej jeden utrwalony wynik uczestnika |
| druga Lesson przygotowana | `lesson_plan_items`, `lesson_materials`, `lesson_notes` | druga nieanulowana lekcja ma element planu, materiał lub niepusty cel (`objectives`) |

Prywatne, agregujące zapytanie dla operatora bety znajduje się poniżej. Nie
tworzy tabeli, eventów ani publicznego endpointu i zwraca wyłącznie liczby.
Przed pierwszym zaproszeniem ustaw prawidłowy `beta_started_at`.

```sql
with params as (
  select timestamptz '2026-10-13 00:00:00+02' as beta_started_at
), ranked_lessons as (
  select
    w.owner_user_id as teacher_id,
    l.workspace_id,
    l.id as lesson_id,
    l.status,
    l.completed_at,
    row_number() over (
      partition by w.owner_user_id
      order by l.starts_at, l.created_at, l.id
    ) as lesson_number
  from public.lessons l
  join public.workspaces w on w.id = l.workspace_id
  where l.status <> 'cancelled'
), tutor_milestones as (
  select
    p.id as teacher_id,
    true as account_created,
    p.onboarding_completed_at is not null as onboarding_completed,
    exists (
      select 1 from public.students s
      join public.workspaces w on w.id = s.workspace_id
      where w.owner_user_id = p.id
    ) as first_student_created,
    exists (
      select 1 from ranked_lessons l where l.teacher_id = p.id
    ) as first_lesson_scheduled,
    exists (
      select 1 from ranked_lessons l
      where l.teacher_id = p.id and l.status = 'completed'
    ) as first_lesson_completed,
    exists (
      select 1 from public.lesson_student_outcomes o
      join public.workspaces w on w.id = o.workspace_id
      where w.owner_user_id = p.id
    ) as first_lesson_outcome_recorded,
    exists (
      select 1
      from ranked_lessons l
      where l.teacher_id = p.id
        and l.lesson_number = 2
        and (
          exists (
            select 1 from public.lesson_plan_items i
            where i.workspace_id = l.workspace_id
              and i.lesson_id = l.lesson_id
          )
          or exists (
            select 1 from public.lesson_materials m
            where m.workspace_id = l.workspace_id
              and m.lesson_id = l.lesson_id
          )
          or exists (
            select 1 from public.lesson_notes n
            where n.workspace_id = l.workspace_id
              and n.lesson_id = l.lesson_id
              and n.note_type = 'objectives'
              and length(trim(n.content)) > 0
          )
        )
    ) as second_lesson_prepared
  from public.profiles p, params
  where p.role = 'teacher'
    and p.created_at >= params.beta_started_at
)
select
  count(*) filter (where account_created) as account_created,
  count(*) filter (where onboarding_completed) as onboarding_completed,
  count(*) filter (where first_student_created) as first_student_created,
  count(*) filter (where first_lesson_scheduled) as first_lesson_scheduled,
  count(*) filter (where first_lesson_completed) as first_lesson_completed,
  count(*) filter (where first_lesson_outcome_recorded) as first_lesson_outcome_recorded,
  count(*) filter (where second_lesson_prepared) as second_lesson_prepared
from tutor_milestones;
```

## Ręczny checklist operatora bety

### Konto i główny przepływ

- [ ] Utwórz jednorazowe konto tutora przez produkcyjną rejestrację i potwierdź e-mail.
- [ ] Zaloguj się ponownie i ukończ onboarding bez pomocy osoby technicznej.
- [ ] Dodaj testowego ucznia, edytuj go i sprawdź jego kartę.
- [ ] Zaplanuj pierwszą lekcję; znajdź ją w **Dzisiaj** i w **Kalendarzu**.
- [ ] Otwórz lekcję, dodaj cel/plan oraz co najmniej jeden materiał.
- [ ] Zakończ lekcję, oznacz frekwencję, zapisz Outcome i zadaj pracę domową.
- [ ] Zaplanuj oraz przygotuj drugą lekcję; sprawdź poprzedni kontekst nauki i Student Memory.

### Mobile i przypadki publiczne

- [ ] Wykonaj główny przepływ na telefonie (minimum 390 px): bez poziomego przewijania, zasłoniętych akcji i pułapek fokusu.
- [ ] Otwórz publiczny profil, wybierz termin i utwórz testową rezerwację.
- [ ] Otwórz link zarządzania rezerwacją i anuluj ją; potwierdź zwolnienie terminu.
- [ ] Sprawdź czy Free blokuje dopiero czwarty aktywny profil ucznia oraz funkcje Pro, a trial/Pro je udostępnia.

### Kontakt, prawo i wdrożenie

- [ ] Użyj **Zgłoś problem / Przekaż opinię** na desktopie i telefonie; potwierdź adres `support@easy4tutor.pl` i treść szablonu.
- [ ] Otwórz `/polityka-prywatnosci`, `/regulamin`, `/dane-uslugodawcy` i ustawienia prywatności.
- [ ] Porównaj historię migracji produkcji z katalogiem `supabase/migrations`; nie resetuj ani nie modyfikuj danych produkcyjnych.
- [ ] Potwierdź osobne zmienne Preview/Production, brak `TUTORFLOW_DATA_DIR` w Production oraz brak sekretów z prefiksem `NEXT_PUBLIC_`.
- [ ] Potwierdź `/api/health`, logi Vercel/Supabase, alerty 5xx i możliwość odnalezienia błędu po `correlationId`.
- [ ] Wykonaj próbę izolacji dwoma kontami: konto B nie może odczytać ani zmienić ucznia, lekcji, materiału ani Outcome konta A.
- [ ] Uruchom powyższe zapytanie aktywacyjne w prywatnym SQL Editor i zapisuj wyłącznie zagregowane liczby.

## Zabezpieczenia produkcyjne — wynik przeglądu

- `.env.local` jest ignorowany; śledzony jest wyłącznie `.env.example` z nazwami i wartościami zastępczymi.
- Klucz Supabase publishable oraz URL są publiczne zgodnie z przeznaczeniem. `SUPABASE_SECRET_KEY`, klucze Google/PayU/Resend/Telegram, `CRON_SECRET` i klucz szyfrowania pozostają po stronie serwera.
- Warstwa serwera ustala `teacherId` z sesji, a operacje domenowe i RLS ograniczają rekordy do workspace. Test RLS obejmuje próbę dostępu drugiego tutora.
- Załączniki są przechowywane w prywatnym bucketcie; polityki Storage używają ścieżki workspace.
- Publiczne statystyki rezerwacji są zagregowane i nie identyfikują klientów; P1.1 nie dodaje publicznej analityki użytkowników.
- W P1.1 nie dodano migracji. Stan migracji na wdrożeniu oraz backup/PITR wymagają ręcznego potwierdzenia operatora.

## Priorytety i pozostałe kwestie

### P0 — Blocker

Brak znanych po zakończeniu automatycznej bramki i ręcznego testu izolacji.

### P1 — Serious

Brak znanych po zakończeniu automatycznej bramki i ręcznego smoke testu wdrożenia.

Naprawione w P1.1:

- nieukończone konto po ponownym logowaniu e-mail lub Google trafia do onboardingu zamiast na pusty ekran **Dzisiaj**;
- praca domowa z bieżącej lekcji nie jest już podpisywana i linkowana jako kontekst „poprzedniej lekcji”;
- logi błędów krytycznych nie zapisują surowej treści wyjątku, stosu ani payloadu z danymi ucznia.

### P2 — Improvement (nie rozszerzać P1.1)

- Pole wymaganego imienia w `StudentComposer` pokazuje błąd, ale może jeszcze
  lepiej powiązać input z komunikatem przez `aria-describedby`.
- Lokalny adapter plikowy pokazuje ogólny komunikat dla błędnych danych
  logowania; produkcyjna ścieżka Supabase ma właściwy bezpieczny komunikat.
- Rzeczywiste dostarczenie wiadomości rezerwacyjnych oraz Google/Telegram/PayU
  zależy od konfiguracji dostawców i pozostaje kontrolą po wdrożeniu.

## Warunek zaproszenia 5–10 tutorów

Zaproszenia można wysłać dopiero, gdy wszystkie pozycje w **Wyniki
automatyczne** oraz krytyczne pozycje ręczne (konto, pełny przepływ, mobile,
rezerwacja, kontakt, prawo, health i izolacja dwóch kont) są oznaczone jako
zaliczone. Do tego momentu odpowiedź na „gotowe?” brzmi **NIE**.
