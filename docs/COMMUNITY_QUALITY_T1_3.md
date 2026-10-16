# Community Quality & Discovery — T1.3

## Zakres

T1.3 rozszerza istniejący Template Hub i moderację T1.2. Nie dodaje profili
twórców, ocen, komentarzy ani marketplace. Katalog pozostaje zbiorem
zatwierdzonych, odseparowanych snapshotów lekcji.

## Ulubione

`shared_template_favorites` przechowuje prywatną zakładkę użytkownika do
publikacji. RPC `set_shared_template_favorite` pozwala dodać lub usunąć wpis
wyłącznie zalogowanemu użytkownikowi i tylko dla aktywnej publikacji.
Ulubienie nie tworzy `LessonTemplate`. RLS zwraca zakładkę tylko jej
właścicielowi i tylko tak długo, jak publikacja ma status `approved`.

## Popularność i adopcje

Popularność pochodzi wyłącznie z udanego `save_shared_template_to_library`.
Po utworzeniu prywatnej kopii wewnętrzna funkcja zapisuje pierwszą adopcję pary
`publication_id + user_id`. Klucz główny tej pary blokuje zawyżanie wyniku przez
ponowione żądania lub kolejne kopie tego samego użytkownika. Publiczny,
bezpieczny licznik `adoption_count` nie ujawnia tożsamości tutorów.

Prywatne kopie pozostają niezależne. Wycofanie publikacji blokuje następne
adopcje, ale nie usuwa istniejących `LessonTemplate` ani lekcji.

## Polecane i odkrywanie

Administrator platformy może oznaczyć zatwierdzoną publikację jako polecaną i
ustawić jej kolejność. Polecenie nie zmienia `source_kind`: szablon społeczności
nie staje się oficjalnym szablonem Easy4Tutor.

Biblioteka udostępnia widoki:

- Polecane — ręcznie wybrane aktywne publikacje,
- Popularne — publikacje z co najmniej jedną rzeczywistą adopcją,
- Najnowsze — według `published_at`,
- Zapisane — prywatne ulubione bieżącego użytkownika.

Filtry przedmiotu, poziomu, czasu i wyszukiwania działają we wszystkich
widokach. Puste sekcje nie są uzupełniane sztucznymi wynikami.

## Zgłaszanie treści

`shared_template_reports` zawiera publikację, identyfikator reportera, powód,
opcjonalne wyjaśnienie, status, czas oraz metadane decyzji moderatora. Powody są
zamkniętym enumem, a wyjaśnienie ma maksymalnie 1000 znaków.

Jedna osoba może mieć tylko jedno otwarte zgłoszenie danej publikacji. Limity
wynoszą 5 zgłoszeń na godzinę i 15 na dobę. Liczba zgłoszeń nigdy automatycznie
nie wycofuje treści — każda decyzja wymaga administratora.

## Moderacja

Obszar T1.2 zawiera kolejkę „Zgłoszenia”. Administrator może obejrzeć pełny
publiczny snapshot, powód i opis, a następnie:

- oddalić zgłoszenie,
- wycofać publikację,
- zapisać wymaganą, krótką notatkę wewnętrzną.

Wycofanie usuwa publikację z katalogu, wyszukiwania, polecanych, popularnych i
dostępnych ulubionych. Otwarta seria zgłoszeń tej publikacji zostaje zamknięta.

## Prywatność i autoryzacja

Rola administratora platformy pochodzi wyłącznie z `platform_admins`; właściciel
lub administrator workspace nie otrzymuje jej automatycznie. RLS chroni każdą
nową tabelę. Tabele adopcji nie są dostępne dla klientów, a raporty są czytelne
tylko dla administratorów platformy. API moderacji nie zwraca tożsamości
reportera.

Publiczne DTO nie zawierają e-maili autora, identyfikatorów workspace, danych
uczniów i grup, notatek nauczyciela ani prywatnych ścieżek plików. Widoczna
pozostaje wyłącznie bezpieczna atrybucja autora z T1.2.

## Migracja i testy

Migracja `20261013133536_community_quality_t1_3.sql` dodaje pola odkrywania,
trzy tabele z RLS oraz wąskie RPC. Test
`supabase/tests/community_quality_t1_3.sql` obejmuje ulubione, rozłączne
adopcje, sortowanie, curation admin-only, walidację i rate limiting zgłoszeń,
moderację, wycofanie, zachowanie prywatnych kopii i izolację danych.
