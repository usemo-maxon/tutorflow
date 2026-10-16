# Shared Template Hub — T1.1

## Zakres

`/app/materialy/biblioteka` udostępnia wszystkim zalogowanym tutorom katalog
zatwierdzonych scenariuszy lekcji. Biblioteka jest dodatkiem do prywatnych
szablonów D3.3 pod `/app/materialy/szablony`; nie zastępuje ich ani nie zmienia
ich granic workspace.

## Model danych

- `shared_template_publications` przechowuje wyłącznie bezpieczny snapshot:
  tytuł, opis, przedmiot, poziom, cel, czas, źródło i stan akceptacji.
- `shared_template_sections` przechowuje uporządkowane sekcje i instrukcje.
- Snapshot nie ma `workspace_id`, danych uczniów, wyników, prywatnych notatek,
  identyfikatorów materiałów ani ścieżek Storage.
- `source_kind` obsługuje źródła `official` i `community`, ale T1.1 nie zawiera
  interfejsu publikowania przez użytkowników.
- W katalogu są widoczne tylko rekordy ze stanem `approved`.

Prywatny `lesson_templates` zachowuje dotychczasowy model. Dwie opcjonalne
kolumny — `source_publication_id` i `source_attribution` — pozwalają pokazać
pochodzenie kopii bez tworzenia zależności treści od wspólnego źródła.

## Dostęp i bezpieczeństwo

RLS pozwala roli `authenticated` odczytać wyłącznie zatwierdzone publikacje i
ich sekcje. `anon` nie ma uprawnień. `authenticated` nie ma uprawnień INSERT,
UPDATE ani DELETE do tabel współdzielonych, dlatego tutor nie może utworzyć,
zatwierdzić ani oznaczyć publikacji jako oficjalnej. W tym etapie administracja
odbywa się wyłącznie po stronie serwera/migracji z uprawnieniami właściciela.

Katalog nie sprawdza planu płatnego: konto Free i konto tylko do odczytu mogą go
przeglądać. Tryb tylko do odczytu blokuje zapis prywatnej kopii zarówno w
serwisie aplikacji, jak i w funkcji bazodanowej.

## Zapis do prywatnej biblioteki

`save_shared_template_to_library(uuid)` działa jako `SECURITY INVOKER` i:

1. wymaga uwierzytelnionego użytkownika i aktywnego workspace tutora,
2. odrzuca konto tylko do odczytu,
3. pobiera wyłącznie zatwierdzony snapshot,
4. tworzy nowy, prywatny `lesson_templates` z bieżącym właścicielem,
5. kopiuje sekcje do `lesson_template_sections`,
6. zachowuje tekstową atrybucję źródła,
7. nie kopiuje materiałów ani załączników.

Operacja jest atomowa. Po zapisie tutor może edytować i stosować szablon przez
istniejące D3.3. Późniejsza zmiana publikacji nie modyfikuje zapisanej kopii.

## UX biblioteki

Biblioteka ma wyszukiwanie w metadanych i treści sekcji oraz filtry przedmiotu,
poziomu i maksymalnego czasu. Karty odróżniają źródło oficjalne i
społecznościowe. Podgląd pokazuje wszystkie pola istotne przed zapisem,
kompletną kolejność sekcji, autora i jawny komunikat o wyłączeniu prywatnych
plików. Są osobne stany ładowania, pustego wyniku i błędu z ponowieniem.

## Oficjalna kolekcja startowa

Migracja dodaje 12 oryginalnych szablonów języka angielskiego dla poziomów
A1–B2, w tym praktykę konwersacji. Każdy ma cel i cztery merytoryczne sekcje z
instrukcjami i czasem. Kolekcja nie wykorzystuje treści z podręczników.

## Weryfikacja

- Testy TypeScript sprawdzają wyszukiwanie oraz łączenie filtrów.
- Testy tras sprawdzają uwierzytelniony odczyt, odrzucenie anonimowego odczytu,
  walidowany zapis i ochronę przed żądaniem cross-site.
- `supabase/tests/shared_template_hub_t1_1.sql` sprawdza dostęp do katalogu,
  widoczność wyłącznie zatwierdzonych rekordów, brak prywatnych pól,
  autoryzację statusu official, izolację workspace, niezależne klonowanie,
  atrybucję, wykluczenie załączników i reguły read-only.

## Odroczone

Publikowanie przez użytkowników, moderacja społeczności, publiczna dystrybucja
plików, oceny, komentarze, obserwowanie autorów, monetyzacja, płatności
marketplace i generowanie AI pozostają poza T1.1.
