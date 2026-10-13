# D3.4 — Materiały uczniów i grup

## Semantyka

Materiał ucznia to trwałe przypisanie kanonicznego rekordu z Biblioteki Materiałów do jednego ucznia. Służy do przechowywania zasobów długoterminowych, takich jak podręcznik, lista słownictwa, syllabus lub przydatny link.

Materiał grupy to trwałe przypisanie tego samego typu do grupy. Jest wspólnym zasobem grupy, a nie kopią przypisaną każdemu członkowi.

Oba konteksty są niezależne od:

- `lesson_materials` — materiałów użytych podczas konkretnej lekcji,
- `lesson_template_materials` — materiałów wielokrotnego użytku dołączonych do szablonu lekcji.

Ten sam rekord `materials` może jednocześnie występować w każdym z tych kontekstów. Plik, link lub treść tekstowa nie są kopiowane.

## Model przypisań i cykl życia

Tabele `student_material_assignments` i `group_material_assignments` są lekkimi relacjami zawierającymi identyfikator obszaru roboczego, identyfikator kontekstu, identyfikator materiału, osobę przypisującą i czas przypisania.

Złożone klucze obce wymagają, by kontekst i materiał należały do tego samego workspace. Klucz główny pary kontekst–materiał zapobiega duplikatom. Usunięcie przypisania usuwa wyłącznie wiersz relacji; rekord `materials` i jego plik pozostają bez zmian. Aktywne przypisanie blokuje twarde usunięcie materiału przez `ON DELETE RESTRICT`.

## Członkostwo w grupie

Student 360 wyświetla materiały osobiste i materiały wynikające z aktualnych członkostw w dwóch osobnych sekcjach. Pochodzenie grupowe jest oznaczone nazwą grupy.

Dołączenie do grupy nie tworzy osobistych przypisań. Odejście z grupy nie przepisuje ani nie usuwa relacji materiału grupowego; materiał przestaje być pokazywany w bieżącym widoku ucznia, ponieważ zapytanie uwzględnia wyłącznie aktywne członkostwa bez `left_at`.

## Archiwizacja

Archiwizacja materiału nie usuwa przypisań. Zarchiwizowany materiał pozostaje widoczny z oznaczeniem „Archiwalny”, może zostać otwarty zgodnie z istniejącymi uprawnieniami i można usunąć jego przypisanie. Picker proponuje aktywne materiały z istniejącej Biblioteki Materiałów.

## Uprawnienia i bezpieczeństwo

Obie tabele mają włączone RLS i jawne granty Data API. Odczyt wymaga aktywnego członkostwa w workspace. Zapis i usuwanie wymagają `private.can_mutate_workspace`, więc konto tylko do odczytu może oglądać oraz otwierać materiały, ale nie może zmieniać przypisań.

Serwer wyprowadza `workspace_id` z uwierzytelnionego profilu tutora i nigdy nie przyjmuje go od klienta. Złożone klucze obce stanowią dodatkową ochronę przed połączeniem Studenta lub Grupy z materiałem innego workspace.

Przypisanie materiału nie zapisuje zdarzenia Student Memory i nie stanowi dowodu wykonania, ćwiczenia ani zrozumienia.

## Wydajność i interfejs

Listy pobierają relacje razem z metadanymi materiału. Widok ucznia pobiera aktywne członkostwa jednym zapytaniem, a następnie wszystkie materiały tych grup jednym zapytaniem; nie wykonuje zapytania na materiał ani członka.

Picker korzysta z istniejącego endpointu Biblioteki Materiałów i jej wyszukiwania oraz filtrów typu, folderu, tagu, przedmiotu i poziomu. Interfejs używa kompaktowych kart, a na małym ekranie picker działa jako dolny panel.

## Funkcje odroczone

Nie zaimplementowano automatycznych sugestii do lekcji, rekomendacji AI, portalu ucznia, publicznych linków, statusu ukończenia, śledzenia postępów, homework workflow, kopiowania Group → Student, Google Drive ani automatycznego dołączania zasobów do przyszłych lekcji.

Lesson Plan Builder pozostaje poza zakresem D3.4.
