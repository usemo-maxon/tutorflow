# D3.8 — Materials & Student Memory Integration

## Cel

D3.8 łączy istniejące dane o pamięci ucznia, pracy domowej, materiałach i planie lekcji w jeden kontekst przygotowania. Jest to widok pochodny z rekordów kanonicznych — nie nowy system pamięci i nie mechanizm rekomendacji.

## Źródła danych

Kontekst przygotowania lekcji korzysta wyłącznie z istniejących źródeł:

- `lesson_student_outcomes` przez kanoniczną pamięć ucznia D1,
- `homeworks`, `homework_assignments` i `homework_materials` z D3.7,
- `lesson_materials` i `materials` z D3.1/D3.5,
- `student_material_assignments` oraz `group_material_assignments` z D3.4,
- `lesson_plan_items`, notatkę celu i selektywny mechanizm ponownego użycia z D3.5/D3.6.

Nie dodano tabeli pamięci, kopii materiałów ani nowego magazynu plików.

## Kontekst przygotowania

Workspace lekcji pokazuje sekcję **Kontekst do przygotowania lekcji** przed właściwym Plan Builderem. Dla każdego uczestnika zachowuje osobno:

- ostatnią zakończoną lekcję,
- jawnie zapisany wynik lekcji,
- jawną trudność i notatkę o trudności,
- ostatni jawny następny krok,
- oczekującą lub ukończoną pracę domową,
- cel bieżącej lekcji zapisany w jej planie.

Dla lekcji grupowej przełączniki uczestników nie łączą trudności, postępów ani następnych kroków. Wspólne materiały grupy i materiały z poprzednich lekcji grupy są pokazane jako wspólny kontekst zasobów, a indywidualne briefingi pozostają rozdzielone.

## Pochodzenie materiałów

Każdy materiał w kontekście ma jawne pochodzenie:

- **Bieżąca lekcja** — istniejące powiązanie `lesson_materials`,
- **Uczeń: …** — bezpośrednie przypisanie D3.4,
- **Grupa: …** — przypisanie grupowe D3.4,
- **Poprzednia lekcja · data** — historyczne powiązanie `lesson_materials`.

Ten sam kanoniczny `material.id` jest wyświetlany raz, ale zachowuje wszystkie źródła. Materiały historyczne pochodzą z maksymalnie pięciu ostatnich zakończonych lekcji; lista historyczna i lista dostępna mają dodatkowe limity prezentacyjne.

Sformułowanie „Materiały z poprzednich lekcji” opisuje wyłącznie historyczne przypięcie. Nie oznacza użycia na zajęciach, ukończenia ani opanowania materiału.

## Działania przygotowawcze

Tutor może:

- otworzyć dostępny materiał historyczny lub przypisany,
- przypiąć jego kanoniczny identyfikator do bieżącej lekcji,
- otworzyć źródłową lekcję materiału,
- otworzyć oczekującą pracę domową,
- użyć istniejącego szablonu lekcji,
- uruchomić istniejące selektywne ponowne użycie poprzedniej lekcji.

Przypięcie wykorzystuje istniejącą akcję `attachMaterial`. Nie kopiuje pliku ani rekordu materiału i nie zmienia przypisań ucznia/grupy. Powtórne przypięcie jest idempotentne.

## Materiały archiwalne

Archiwalny materiał pozostaje widoczny, gdy istnieje ważne historyczne powiązanie. Etykieta **Archiwalny** jest zachowana. Otwarcie lub przypięcie do lekcji nie usuwa `archived_at` i nie przywraca materiału do aktywnej biblioteki.

Jeśli historyczne powiązanie nie może już zostać odczytane, widok nie tworzy zastępczego materiału i blokuje akcję przypięcia.

## Student 360

Przegląd ucznia zawiera kompaktową sekcję **Ostatnie materiały i zadania**. Łączy i deduplikuje:

- stałe materiały ucznia,
- bieżące materiały jego aktywnych grup z nazwą grupy,
- materiały przypięte do maksymalnie pięciu ostatnich zakończonych lekcji,
- oczekujące, przesłane do sprawdzenia i sprawdzone prace domowe.

Pełne zarządzanie przypisaniami pozostaje w karcie **Materiały**; Student 360 nie pobiera całej biblioteki materiałów.

## Granice pamięci i wyników nauki

D3.8 nie zapisuje wniosków i nie zmienia danych historycznych. Obowiązują rozłączne znaczenia:

- **Student Outcome** — jawnie zaobserwowany wynik zapisany przy ukończeniu lekcji,
- **Homework** — zadanie i jego rzeczywisty stan workflow,
- **Material** — zasób wielokrotnego użytku,
- **Lesson Plan** — planowana aktywność dydaktyczna.

System nie wnioskuje, że:

- przypisany materiał został przerobiony,
- przypięty materiał został użyty lub ukończony,
- wykonana praca domowa została zrozumiana,
- wykonany punkt planu oznacza opanowanie umiejętności.

Pola trudności, postępu i następnego kroku pochodzą wyłącznie z jawnych `lesson_student_outcomes`. D3.8 nie nadpisuje ich i nie agreguje indywidualnych wyników do wyniku grupy.

## Bezpieczeństwo

- Wszystkie zapytania relacyjne filtrują `workspace_id`.
- Historia ucznia jest pobierana tylko przez jego wpis `lesson_participants`.
- Historia grupy wynika tylko z lekcji tej samej grupy.
- Powiązanie `lesson_materials` ma złożone klucze obce `(lesson_id, workspace_id)` i `(material_id, workspace_id)`, więc nie może połączyć rekordów z innych workspace'ów.
- Dostęp do plików nadal przechodzi przez chroniony endpoint materiału i istniejące polityki Storage/RLS.
- Akcje zapisu używają istniejącej kontroli subskrypcji `read_only`; w widoku tylko do odczytu przyciski przypięcia i przygotowania są wyłączone.
- Widok nie jest używany w publicznych trasach rezerwacji ani publicznych API.

## Wydajność

- Historia przygotowania jest ograniczona do pięciu ostatnich zakończonych lekcji.
- Powiązania planu i materiałów są pobierane partiami przez `in(lesson_id, …)`.
- Student 360 pobiera maksymalnie pięć lekcji, a następnie wszystkie ich powiązania materiałowe w jednym zapytaniu.
- Deduplikacja odbywa się w pamięci po kanonicznym `material.id` bez zapytania na każdy materiał.
- Istniejące klucze cache React Query są współdzielone między skrótem Student 360 i pełną kartą Materiały.

## Migracja

Brak. D3.8 korzysta z istniejących tabel, kluczy obcych, polityk RLS i mechanizmów D3.1–D3.7.

## Funkcje odroczone

Poza zakresem pozostają: rekomendacje AI, generowanie lekcji i programu, embeddings/vector search, automatyczne ocenianie umiejętności lub mastery, portal ucznia, przesyłanie prac przez ucznia, publiczne udostępnianie materiałów i nowy system analityczny.
