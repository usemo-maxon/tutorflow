-- T1.1 Shared Template Hub. Shared publications are immutable, reviewed
-- snapshots. They deliberately do not reference workspaces, students, private
-- teacher notes, outcomes, materials, attachments, or storage objects.

create table public.shared_template_publications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  subject text not null,
  level text not null,
  objective text not null,
  estimated_duration_minutes integer not null,
  source_kind text not null default 'community',
  author_name text not null,
  source_attribution text,
  status text not null default 'draft',
  excluded_private_attachments boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_template_publications_title_length check (length(trim(title)) between 1 and 160),
  constraint shared_template_publications_description_length check (length(description) <= 2000),
  constraint shared_template_publications_subject_length check (length(trim(subject)) between 1 and 80),
  constraint shared_template_publications_level_length check (length(trim(level)) between 1 and 40),
  constraint shared_template_publications_objective_length check (length(trim(objective)) between 1 and 5000),
  constraint shared_template_publications_duration_range check (estimated_duration_minutes between 1 and 480),
  constraint shared_template_publications_source_kind check (source_kind in ('official', 'community')),
  constraint shared_template_publications_status check (status in ('draft', 'approved', 'rejected')),
  constraint shared_template_publications_approved_at check ((status = 'approved') = (published_at is not null))
);

create table public.shared_template_sections (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.shared_template_publications(id) on delete cascade,
  title text not null,
  content text not null default '',
  estimated_minutes integer,
  position integer not null,
  constraint shared_template_sections_title_length check (length(trim(title)) between 1 and 120),
  constraint shared_template_sections_content_length check (length(content) <= 5000),
  constraint shared_template_sections_minutes_range check (estimated_minutes is null or estimated_minutes between 1 and 480),
  constraint shared_template_sections_position_nonnegative check (position >= 0),
  unique (publication_id, position)
);

create index shared_template_publications_catalog_idx
  on public.shared_template_publications (subject, level, estimated_duration_minutes, published_at desc)
  where status = 'approved';
create index shared_template_publications_search_trgm_idx
  on public.shared_template_publications using gin ((title || ' ' || description || ' ' || subject || ' ' || level || ' ' || objective) gin_trgm_ops)
  where status = 'approved';
create index shared_template_sections_order_idx on public.shared_template_sections (publication_id, position);

alter table public.lesson_templates
  add column source_publication_id uuid references public.shared_template_publications(id) on delete set null,
  add column source_attribution text;

alter table public.shared_template_publications enable row level security;
alter table public.shared_template_sections enable row level security;

create policy shared_template_publications_browse_approved
  on public.shared_template_publications for select to authenticated
  using (status = 'approved');
create policy shared_template_sections_browse_approved
  on public.shared_template_sections for select to authenticated
  using (exists (
    select 1 from public.shared_template_publications publication
    where publication.id = publication_id and publication.status = 'approved'
  ));

revoke all on table public.shared_template_publications from public, anon, authenticated;
revoke all on table public.shared_template_sections from public, anon, authenticated;
grant select on table public.shared_template_publications to authenticated;
grant select on table public.shared_template_sections to authenticated;

create or replace function public.save_shared_template_to_library(target_publication_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_workspace_id uuid;
  publication public.shared_template_publications%rowtype;
  new_template_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.workspace_id into target_workspace_id
  from public.tutor_profiles profile
  where profile.user_id = current_user_id;

  if target_workspace_id is null then
    raise exception 'tutor workspace unavailable' using errcode = '42501';
  end if;

  if coalesce((
    select subscription.read_only
    from public.subscriptions subscription
    where subscription.teacher_id = current_user_id
  ), true) then
    raise exception 'read-only account cannot save templates' using errcode = '42501';
  end if;

  select * into publication
  from public.shared_template_publications
  where id = target_publication_id and status = 'approved';

  if not found then
    raise exception 'shared template is unavailable' using errcode = 'P0002';
  end if;

  insert into public.lesson_templates (
    id, workspace_id, owner_user_id, title, description, subject, level,
    objective, estimated_duration_minutes, source_publication_id,
    source_attribution
  ) values (
    new_template_id, target_workspace_id, current_user_id, publication.title,
    publication.description, publication.subject, publication.level,
    publication.objective, publication.estimated_duration_minutes,
    publication.id,
    coalesce(publication.source_attribution, publication.author_name)
  );

  insert into public.lesson_template_sections (
    workspace_id, template_id, title, content, estimated_minutes, position
  )
  select target_workspace_id, new_template_id, section.title, section.content,
    section.estimated_minutes, section.position
  from public.shared_template_sections section
  where section.publication_id = publication.id
  order by section.position;

  return new_template_id;
end;
$$;

revoke all on function public.save_shared_template_to_library(uuid) from public;
grant execute on function public.save_shared_template_to_library(uuid) to authenticated;

-- Official starter collection. Content is original and contains no textbook
-- excerpts or private file references.
insert into public.shared_template_publications
  (id, title, description, subject, level, objective, estimated_duration_minutes, source_kind, author_name, source_attribution, status, published_at)
values
  ('11000000-0000-4000-8000-000000000001', 'Hello! Pierwsze rozmowy po angielsku', 'Bezpieczny start z powitaniami, przedstawianiem się i krótką wymianą informacji.', 'Język angielski', 'A1', 'Uczeń potrafi przywitać się, przedstawić i zadać trzy podstawowe pytania rozmówcy.', 45, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000002', 'My day — codzienne czynności', 'Lekcja o rutynie dnia z czasem Present Simple i praktycznym mówieniem.', 'Język angielski', 'A1', 'Uczeń opisuje swój typowy dzień w 6–8 zdaniach i poprawnie używa określeń czasu.', 60, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000003', 'At the café — zamawianie', 'Scenki sytuacyjne rozwijające słownictwo kulinarne i uprzejme prośby.', 'Język angielski', 'A1/A2', 'Uczeń składa proste zamówienie, dopytuje o produkt i reaguje na pytania obsługi.', 50, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000004', 'Weekend stories — Past Simple', 'Od osi czasu do swobodnej opowieści o minionym weekendzie.', 'Język angielski', 'A2', 'Uczeń opowiada o zakończonych wydarzeniach i zadaje pytania w Past Simple.', 60, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000005', 'Travel problem solver', 'Praktyczne reagowanie na opóźnienia, zgubiony bagaż i zmianę planu.', 'Język angielski', 'A2', 'Uczeń wyjaśnia prosty problem w podróży, prosi o pomoc i rozumie proponowane rozwiązanie.', 60, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000006', 'Present Perfect — doświadczenia', 'Kontrast doświadczeń życiowych i konkretnych wydarzeń z osią czasu.', 'Język angielski', 'B1', 'Uczeń pyta o doświadczenia, udziela rozwiniętych odpowiedzi i rozróżnia Present Perfect od Past Simple.', 60, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000007', 'Agree, disagree, explain', 'Rozmowa opiniotwórcza z językiem do zgadzania się, sprzeciwu i uzasadniania.', 'Język angielski', 'B1', 'Uczeń wyraża opinię, uprzejmie reaguje na inne stanowisko i popiera zdanie przykładem.', 55, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000008', 'Job interview rehearsal', 'Próba rozmowy rekrutacyjnej z informacją zwrotną i drugą, poprawioną rundą.', 'Język angielski', 'B1/B2', 'Uczeń udziela konkretnych odpowiedzi o doświadczeniu, mocnych stronach i celach zawodowych.', 60, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000009', 'Conditionals in real decisions', 'Okresy warunkowe osadzone w decyzjach, poradach i przewidywaniu skutków.', 'Język angielski', 'B2', 'Uczeń dobiera pierwszy, drugi lub trzeci okres warunkowy do intencji wypowiedzi.', 60, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000010', 'Newsroom: summarise and respond', 'Praca z krótkim, samodzielnie dobranym newsem: streszczenie, wiarygodność i dyskusja.', 'Język angielski', 'B2', 'Uczeń streszcza informację własnymi słowami, oddziela fakt od opinii i formułuje reakcję.', 60, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000011', 'Conversation café — pytania pogłębiające', 'Lekka lekcja konwersacyjna skupiona na naturalnym podtrzymywaniu rozmowy.', 'Język angielski', 'A2/B1', 'Uczeń aktywnie słucha, zadaje pytania pogłębiające i płynnie zmienia temat.', 45, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now()),
  ('11000000-0000-4000-8000-000000000012', 'Mini debate — technology and life', 'Ustrukturyzowana debata o wpływie technologii na codzienne życie.', 'Język angielski', 'B1/B2', 'Uczeń buduje argument, odpowiada na kontrargument i podsumowuje wspólne wnioski.', 60, 'official', 'Zespół Easy4Tutor', 'Oficjalny szablon Easy4Tutor', 'approved', now());

insert into public.shared_template_sections (publication_id, title, content, estimated_minutes, position)
values
  ('11000000-0000-4000-8000-000000000001','Powitanie w ruchu','Tutor modeluje: Hello, I’m… / Nice to meet you. Uczeń powtarza, a następnie wybiera własną formę powitania odpowiednią do sytuacji.',7,0),
  ('11000000-0000-4000-8000-000000000001','Karty informacji','Przećwicz pytania What’s your name?, Where are you from?, What do you like? Najpierw uzupełnij przykładowy profil, potem zamień role.',13,1),
  ('11000000-0000-4000-8000-000000000001','Trzy krótkie rozmowy','Odegraj trzy 90-sekundowe spotkania: kurs, sąsiedztwo i wydarzenie online. Po każdej rundzie uczeń dodaje jedno nowe pytanie.',18,2),
  ('11000000-0000-4000-8000-000000000001','Bilet wyjścia','Uczeń bez podpowiedzi przedstawia się i prowadzi czterozdaniową wymianę. Zapisz jedną mocną stronę i jeden cel.',7,3),
  ('11000000-0000-4000-8000-000000000002','Zegar dnia','Nazwij sześć pór dnia i dopasuj do nich typowe czynności. Tutor wydobywa znane czasowniki zamiast podawać gotową listę.',10,0),
  ('11000000-0000-4000-8000-000000000002','Budowanie zdań','Ułóż zdania z I usually…, I sometimes…, I never… Dodaj godzinę lub określenie after/before.',15,1),
  ('11000000-0000-4000-8000-000000000002','Wywiad o rutynie','Uczeń odpowiada na pytania o poranek, pracę lub szkołę i wieczór. Tutor dopytuje What time? oraz How often?',20,2),
  ('11000000-0000-4000-8000-000000000002','60-sekundowa historia dnia','Uczeń opisuje cały dzień bez notatek. Potem sam poprawia dwa zdania na podstawie krótkiej informacji zwrotnej.',15,3),
  ('11000000-0000-4000-8000-000000000003','Menu z wyobraźni','Wspólnie stwórzcie małe menu: trzy napoje, trzy dania i dwie ceny. Przećwicz wymowę oraz liczby.',10,0),
  ('11000000-0000-4000-8000-000000000003','Język obsługi i gościa','Modeluj Can I have…?, I’d like…, Anything else?, That’s all, thank you. Zaznacz uprzejmą intonację.',12,1),
  ('11000000-0000-4000-8000-000000000003','Scenki z komplikacją','Zamień role w dwóch zamówieniach. Dodaj brak produktu albo pytanie o składnik; uczeń ma znaleźć prostą alternatywę.',20,2),
  ('11000000-0000-4000-8000-000000000003','Rachunek i podsumowanie','Uczeń prosi o rachunek, sprawdza cenę i podaje trzy zwroty, których użyje w prawdziwej sytuacji.',8,3),
  ('11000000-0000-4000-8000-000000000004','Migawki z weekendu','Uczeń wybiera trzy momenty weekendu i nadaje im tytuły. Ustal czasowniki regularne i nieregularne potrzebne do opowieści.',10,0),
  ('11000000-0000-4000-8000-000000000004','Oś wydarzeń','Ułóż momenty chronologicznie i rozwiń je przy pomocy first, then, after that, finally. Zwróć uwagę na formy przeszłe.',15,1),
  ('11000000-0000-4000-8000-000000000004','Reporter i świadek','Tutor zadaje pytania Where did you…?, Who were you with?, What happened next? Następnie role się zmieniają.',20,2),
  ('11000000-0000-4000-8000-000000000004','Opowieść i autokorekta','Uczeń opowiada całość przez dwie minuty. Po odsłuchaniu własnego podsumowania poprawia trzy wskazane miejsca.',15,3),
  ('11000000-0000-4000-8000-000000000005','Szybki niezbędnik podróżny','Aktywuj zwroty: My flight is delayed, I can’t find…, Could you help me?, What are my options?',10,0),
  ('11000000-0000-4000-8000-000000000005','Trzy punkty obsługi','Odegraj kolejno lotnisko, hotel i dworzec. W każdej scenie uczeń opisuje problem, podaje istotny szczegół i prosi o rozwiązanie.',25,1),
  ('11000000-0000-4000-8000-000000000005','Zmiana planu','Przedstaw dwie alternatywy z ograniczeniami czasu i ceny. Uczeń porównuje je i uzasadnia wybór.',15,2),
  ('11000000-0000-4000-8000-000000000005','Checklista samodzielności','Uczeń odtwarza najtrudniejszą scenę bez podpowiedzi oraz zapisuje pięć zwrotów awaryjnych.',10,3),
  ('11000000-0000-4000-8000-000000000006','Have you ever…?','Rozgrzewka z sześcioma pytaniami o doświadczenia. Odpowiedź musi zawierać krótkie Yes/No oraz jeden szczegół.',10,0),
  ('11000000-0000-4000-8000-000000000006','Doświadczenie a wydarzenie','Na przykładach ucznia zaznacz: brak konkretnego czasu = Present Perfect; określony moment = Past Simple. Uczeń uzasadnia wybór formy.',15,1),
  ('11000000-0000-4000-8000-000000000006','Łańcuch pytań','Po każdej odpowiedzi z Present Perfect partner dopytuje w Past Simple: When?, Where?, What happened?',25,2),
  ('11000000-0000-4000-8000-000000000006','Mikropodsumowanie','Uczeń opisuje dwa doświadczenia i jedno wydarzenie, używając obu czasów. Tutor sprawdza znaczenie, nie tylko formę.',10,3),
  ('11000000-0000-4000-8000-000000000007','Linia opinii','Przedstaw trzy neutralne tezy. Uczeń określa stopień zgody i kończy zdanie I think… because…',10,0),
  ('11000000-0000-4000-8000-000000000007','Bank reakcji','Porównaj That’s true, however…, I see your point, but…, I completely agree because… Przećwicz intonację, która nie brzmi konfrontacyjnie.',12,1),
  ('11000000-0000-4000-8000-000000000007','Rozmowa z dowodem','Dla dwóch tez uczeń podaje opinię, powód i konkretny przykład. Tutor odpowiada kontrargumentem, a uczeń reaguje.',23,2),
  ('11000000-0000-4000-8000-000000000007','Zmiana perspektywy','Uczeń przedstawia przez minutę pogląd przeciwny do własnego, a potem wskazuje najsilniejszy argument obu stron.',10,3),
  ('11000000-0000-4000-8000-000000000008','Mapa odpowiedzi STAR','Wybierz jedno doświadczenie i rozpisz Situation, Task, Action, Result w krótkich hasłach. Usuń ogólniki.',12,0),
  ('11000000-0000-4000-8000-000000000008','Pytania kluczowe','Przećwicz Tell me about yourself, a challenge, a strength i a goal. Każda odpowiedź ma mieć konkretny przykład.',18,1),
  ('11000000-0000-4000-8000-000000000008','Symulacja rozmowy','Przeprowadź 12-minutową rozmowę bez przerywania. Tutor notuje język, klarowność i trafność odpowiedzi.',15,2),
  ('11000000-0000-4000-8000-000000000008','Feedback i druga próba','Wybierz dwie odpowiedzi do poprawy. Uczeń skraca wstęp, dodaje rezultat i odpowiada ponownie.',15,3),
  ('11000000-0000-4000-8000-000000000009','Skutek czy wyobrażenie?','Posortuj sześć sytuacji na realne, hipotetyczne i przeszłe niemożliwe. Uczeń wyjaśnia znaczenie każdej kategorii.',10,0),
  ('11000000-0000-4000-8000-000000000009','Forma służy intencji','Zbuduj po dwa przykłady first, second i third conditional. Po każdej formie nazwij intencję: przewidywanie, rada, żal.',18,1),
  ('11000000-0000-4000-8000-000000000009','Pokój decyzji','Rozważ zmianę pracy, wyjazd i nietrafioną decyzję. Uczeń odpowiada, a tutor zmienia jeden warunek w scenariuszu.',22,2),
  ('11000000-0000-4000-8000-000000000009','Napraw zdanie','Tutor podaje cztery zdania z błędem formy lub znaczenia. Uczeń poprawia i krótko uzasadnia.',10,3),
  ('11000000-0000-4000-8000-000000000010','Nagłówek bez artykułu','Pracuj z samym nagłówkiem krótkiej aktualnej wiadomości wybranej przez tutora. Uczeń przewiduje treść i formułuje pytania.',8,0),
  ('11000000-0000-4000-8000-000000000010','Czytanie i notatki 5W','Po przeczytaniu legalnie dostępnego krótkiego tekstu uczeń notuje who, what, where, when, why bez kopiowania pełnych zdań.',15,1),
  ('11000000-0000-4000-8000-000000000010','Streszczenie własnymi słowami','Uczeń przekazuje wiadomość w 60 sekund. Następnie oznacza, które elementy są faktami, opiniami lub niepewnymi wnioskami.',17,2),
  ('11000000-0000-4000-8000-000000000010','Reakcja i wiarygodność','Omów źródło, brakujące informacje i możliwe skutki. Uczeń kończy własnym stanowiskiem popartym dwoma powodami.',20,3),
  ('11000000-0000-4000-8000-000000000011','Temat z kubka','Wylosuj lekki temat: weekend, jedzenie, miejsce, hobby lub małe osiągnięcie. Pierwsza odpowiedź trwa 30 sekund.',7,0),
  ('11000000-0000-4000-8000-000000000011','Drabina pytań','Ćwicz trzy poziomy: pytanie faktograficzne, pytanie o szczegół i pytanie o opinię. Partner nie zmienia tematu zbyt wcześnie.',12,1),
  ('11000000-0000-4000-8000-000000000011','Rozmowy czterominutowe','Przeprowadź trzy rundy. W każdej uczeń ma użyć reakcji naturalnej, pytania pogłębiającego i płynnego nawiązania do nowego wątku.',18,2),
  ('11000000-0000-4000-8000-000000000011','Mapa dobrej rozmowy','Uczeń wskazuje moment, w którym rozmowa płynęła najlepiej, oraz wybiera dwa zwroty do ponownego użycia.',8,3),
  ('11000000-0000-4000-8000-000000000012','Teza i stanowisko','Wybierz jedną tezę o technologii, np. ograniczeniu telefonu w szkole lub pracy zdalnej. Uczeń precyzuje własne stanowisko.',8,0),
  ('11000000-0000-4000-8000-000000000012','Budowa argumentu','Przygotuj dwa argumenty według schematu claim–reason–example. Dodaj język kontrastu i ostrożnego formułowania sądów.',15,1),
  ('11000000-0000-4000-8000-000000000012','Debata z rundami','Runda 1: argumenty otwierające. Runda 2: pytania. Runda 3: odpowiedź na najsilniejszy kontrargument. Pilnuj czasu wypowiedzi.',25,2),
  ('11000000-0000-4000-8000-000000000012','Wspólny wniosek','Obie strony tworzą trzy zdania: gdzie się zgadzają, co pozostaje sporne i jakie rozwiązanie kompromisowe jest możliwe.',12,3);
