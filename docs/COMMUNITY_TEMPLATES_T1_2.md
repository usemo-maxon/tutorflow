# Community Template Publishing — T1.2

## Zakres

T1.2 rozszerza prywatne szablony D3.3 i wspólną bibliotekę T1.1. Nie tworzy
drugiego systemu szablonów. Tutor otwiera prywatny `Lesson Template`, wybiera
**Udostępnij społeczności**, edytuje publiczny snapshot, sprawdza jego dokładny
podgląd i wysyła go do moderacji.

Konta Free mogą zgłaszać szablony. Obowiązują istniejące zasady trybu tylko do
odczytu, ale nie ma nowej blokady Pro.

## Cykl publikacji

Każde zgłoszenie jest oddzielnym rekordem i przechodzi przez stany:

- `pending_review` — **Oczekuje na weryfikację**;
- `approved` — **Opublikowany**;
- `rejected` — **Odrzucony**;
- `withdrawn` — **Wycofany**.

Tylko `approved` trafia do katalogu i może być kopiowany. Odrzucenie zachowuje
opcjonalne wyjaśnienie moderatora. Ponowne wysłanie tworzy nowy snapshot oraz
nową historię moderacji; nie nadpisuje poprzedniego zgłoszenia.

## Bezpieczny snapshot

Publiczna zawartość pozostaje w tabelach T1.1:
`shared_template_publications` i `shared_template_sections`. Snapshot obejmuje
tylko jawnie pokazane pola: tytuł, opis, przedmiot, poziom, czas, cele, sekcje
lekcji i publiczną nazwę autora.

Identyfikatory źródłowego szablonu, workspace i użytkownika, potwierdzenie praw,
feedback moderatora oraz historia wycofania są przechowywane oddzielnie w
`community_template_submissions`. RLS udostępnia te dane wyłącznie autorowi i
administratorowi platformy.

Snapshot nie zawiera:

- materiałów, plików ani ścieżek Storage;
- danych uczniów lub grup;
- Lesson Outcomes, prac domowych ani feedbacku ucznia;
- prywatnych notatek tutora;
- identyfikatora workspace;
- e-maila, wewnętrznego ID lub prywatnych danych kontaktowych autora.

Warstwa TypeScript i funkcja bazodanowa usuwają znaki sterujące oraz odrzucają
odwołania do prywatnych plików, Storage, `blob:`, `data:`, `file:` i
`javascript:`. UI renderuje treść jako zwykły tekst, bez wstrzykiwania HTML.

Zmiana prywatnego oryginału nie modyfikuje zaakceptowanego snapshotu. Aktualna
wersja wymaga nowego zgłoszenia i nowej moderacji.

## Uprawnienia i moderacja

Zgłoszenie może utworzyć właściciel szablonu albo aktywny członek tego samego
workspace z rolą `owner` lub `admin`, o ile workspace jest zapisywalny.
Autoryzacja jest ponownie sprawdzana w funkcji bazodanowej; sam identyfikator z
klienta nie wystarcza.

`/app/admin/szablony` korzysta z osobnej tabeli `platform_admins`. Rola właściciela
workspace nie nadaje uprawnień platformowych. Tabela nie ma grantów dla
`authenticated`, a sprawdzanie roli i zmiany statusu działają po stronie
serwera/bazy. Nie używamy adresów e-mail, `user_metadata` ani edytowalnych pól
profilu jako autoryzacji.

Administrator może podejrzeć dokładny snapshot, zatwierdzić, odrzucić z
wyjaśnieniem lub wycofać opublikowaną treść. Zwykły tutor nie ma bezpośrednich
grantów INSERT/UPDATE/DELETE do tabel publikacji i nie może nadać statusu
`official`.

## Atrybucja i kopiowanie

Autor wybiera publiczną nazwę lub pseudonim. Katalog pokazuje
`Autor: [publiczna nazwa]`; nie ujawnia e-maila ani ID konta. Kopiowanie przez
**Zapisz do moich szablonów** zachowuje tekstową atrybucję, ale tworzy prywatny,
edytowalny `lesson_templates` i niezależne sekcje. Nie powstaje dostęp do
workspace autora ani prywatnych załączników.

Szablony platformowe nadal mają wyróżnik **Oficjalny szablon Easy4Tutor**.
Społecznościowe mają wyróżnik **Od społeczności**. Tylko zaufany proces
platformowy może tworzyć źródło `official`.

## Wycofanie

Autor może wycofać własną zaakceptowaną publikację. Administrator może ją
wycofać z powodów bezpieczeństwa lub moderacji. Wycofanie:

- usuwa snapshot z katalogu;
- blokuje zapisywanie nowych kopii;
- zachowuje rekord i historię moderacji;
- nie usuwa prywatnych kopii zapisanych wcześniej;
- nie zmienia istniejących lekcji.

## Ochrona przed nadużyciami

Funkcja zgłoszenia ogranicza użytkownika do 5 zgłoszeń na godzinę i 20 na dobę.
Walidacja długości, liczby sekcji, czasu i bezpiecznej treści działa zarówno w
API, jak i w bazie. RLS chroni niewidoczne zgłoszenia oraz izolację workspace.
Funkcje uprzywilejowane mają pusty `search_path`, jawne kontrole `auth.uid()` i
ograniczone granty wykonania.

## Potwierdzenie praw

Wysłanie wymaga osobnego checkboxa potwierdzającego prawa do udostępnienia oraz
zgodę na publikację. UI odsyła do istniejącego Regulaminu, a baza zapisuje czas
i wersję potwierdzenia. Wersja `T1.2-LEGAL-REVIEW-REQUIRED` celowo oznacza, że
szczegółowa klauzula publikowania społecznościowego musi zostać zatwierdzona
przez przegląd prawny przed produkcyjnym uruchomieniem; implementacja nie
wymyśla nowej treści prawnej.

## Mobile

Formularz, podgląd, statusy, feedback i potwierdzenie wycofania przechodzą na
pełnoszerokie dolne arkusze przy małych ekranach. Pola i sekcje składają się do
jednej kolumny, akcje zajmują pełną szerokość. Kolejka moderatora także używa
jednej kolumny przy 390 × 844.

## Testy

`supabase/tests/community_templates_t1_2.sql` obejmuje własne i cudze szablony,
RLS, niewidoczność pending/rejected, akceptację, odmowę bez uprawnień, feedback,
ponowne zgłoszenie, niezależność snapshotu, wykluczenie materiałów, atrybucję,
wycofanie i trwałość kopii. Testy TypeScript obejmują walidację potwierdzenia,
sanityzację i etykiety cyklu życia.

## Odroczone

Oceny, komentarze, obserwowanie autorów, rankingi, monetyzacja, płatne szablony,
marketplace, publiczne profile, publiczna dystrybucja plików, moderacja AI,
automatyczna publikacja i zaawansowana analityka twórców pozostają poza T1.2.
