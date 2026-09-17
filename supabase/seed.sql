-- Deterministic, synthetic Stage 2 demo data. Safe to run repeatedly.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '90000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'anna@example.test', '', '{}',
  '{"full_name":"Anna Kowalska"}', '2026-09-01T08:00:00Z', '2026-09-01T08:00:00Z'
) on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.workspaces where id = '90000000-0000-4000-8000-000000000002'
  ) then
    delete from public.workspaces
    where owner_user_id = '90000000-0000-4000-8000-000000000001';
  end if;
end;
$$;

insert into public.workspaces (id, name, owner_user_id, timezone, currency, locale, created_at)
values (
  '90000000-0000-4000-8000-000000000002', 'Anna Kowalska',
  '90000000-0000-4000-8000-000000000001', 'Europe/Warsaw', 'PLN', 'pl-PL',
  '2026-09-01T08:00:00Z'
) on conflict (id) do update set
  name = excluded.name, timezone = excluded.timezone,
  currency = excluded.currency, locale = excluded.locale;

insert into public.workspace_members (id, workspace_id, user_id, role, status)
values (
  '90000000-0000-4000-8000-000000000003',
  '90000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000001', 'owner', 'active'
) on conflict (workspace_id, user_id) do update set role = 'owner', status = 'active';

insert into public.tutor_profiles (
  id, workspace_id, user_id, display_name, timezone,
  default_currency, default_lesson_duration_minutes
) values (
  '90000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000001',
  'Anna Kowalska', 'Europe/Warsaw', 'PLN', 60
) on conflict (workspace_id, user_id) do update set
  display_name = excluded.display_name, timezone = excluded.timezone;

insert into public.students (
  id, workspace_id, first_name, last_name, display_name, email, status,
  level, subject, default_lesson_duration_minutes,
  default_lesson_price_grosz, currency, default_format, default_location,
  created_at, archived_at
) values
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'Zosia', 'Kowalska', 'Zosia Kowalska', 'zosia@example.test', 'active', 'B1', 'English', 60, 8000, 'PLN', 'online', 'https://meet.example.test/zosia', '2026-09-01T08:00:00Z', null),
  ('91000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', 'Hania', 'Nowak', 'Hania Nowak', 'hania@example.test', 'active', 'A2', 'English', 60, 7500, 'PLN', 'online', 'https://meet.example.test/hania', '2026-09-01T08:00:00Z', null),
  ('91000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', 'Adam', 'Zieliński', 'Adam Zieliński', 'adam@example.test', 'active', 'B2', 'English', 60, 9000, 'PLN', 'online', 'https://meet.example.test/adam', '2026-09-01T08:00:00Z', null),
  ('91000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000002', 'Ola', 'Wiśniewska', 'Ola Wiśniewska', 'ola@example.test', 'archived', 'A1', 'English', 45, 7000, 'PLN', 'online', null, '2026-08-01T08:00:00Z', '2026-09-01T08:00:00Z')
on conflict (id) do update set
  display_name = excluded.display_name, email = excluded.email,
  status = excluded.status, level = excluded.level, subject = excluded.subject,
  default_lesson_price_grosz = excluded.default_lesson_price_grosz,
  archived_at = case when excluded.status = 'archived' then '2026-09-01T08:00:00Z'::timestamptz else null end,
  updated_at = now();

update public.students
set archived_at = '2026-09-01T08:00:00Z'
where id = '91000000-0000-4000-8000-000000000004';

insert into public.contacts (
  id, workspace_id, first_name, last_name, email, phone, type, created_at
) values (
  '91100000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  'Marta', 'Kowalska', 'marta.kowalska@example.test', '+48 600 111 222', 'parent',
  '2026-09-01T08:00:00Z'
) on conflict (id) do update set
  email = excluded.email, phone = excluded.phone, type = excluded.type, updated_at = now();

insert into public.student_contacts (
  id, workspace_id, student_id, contact_id, relationship,
  is_primary, is_billing_contact, created_at
) values (
  '91200000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000001',
  '91100000-0000-4000-8000-000000000001',
  'Mama', true, true, '2026-09-01T08:00:00Z'
) on conflict (student_id, contact_id) do update set
  relationship = excluded.relationship,
  is_primary = excluded.is_primary,
  is_billing_contact = excluded.is_billing_contact;

insert into public.groups (
  id, workspace_id, name, subject, level, status,
  default_duration_minutes, default_price_grosz, currency, created_at
) values (
  '92000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  'English B1 Group', 'English', 'B1', 'active', 60, 6000, 'PLN',
  '2026-09-01T08:00:00Z'
) on conflict (id) do update set name = excluded.name, status = 'active', updated_at = now();

insert into public.group_members (id, workspace_id, group_id, student_id, joined_at, status)
values
  ('92100000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '2026-09-01T08:00:00Z', 'active'),
  ('92100000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', '2026-09-01T08:00:00Z', 'active'),
  ('92100000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', '2026-09-01T08:00:00Z', 'active')
on conflict (group_id, student_id) do update set status = 'active', left_at = null;

insert into public.recurring_lesson_series (
  id, workspace_id, tutor_id, group_id, frequency, recurrence_interval,
  days_of_week, starts_on, ends_on, start_time, duration_minutes,
  timezone, status, effective_from, created_at
) values (
  '93000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001', 'weekly', 1, array[2]::smallint[],
  '2026-09-22', null, '17:00', 60, 'Europe/Warsaw', 'active',
  '2026-09-22', '2026-09-01T08:00:00Z'
) on conflict (id) do update set status = 'active', updated_at = now();

insert into public.lessons (
  id, workspace_id, tutor_id, student_id, group_id, title, subject,
  starts_at, ends_at, timezone, status, format, location, price_grosz,
  currency, billing_type, meeting_url, creation_mode, recurring_series_id,
  recurrence_original_starts_at, sync_status, created_at, completed_at, cancelled_at
) values
  ('94000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', null, 'Past Simple — storytelling', 'English', '2026-09-10T15:00:00Z', '2026-09-10T16:00:00Z', 'Europe/Warsaw', 'completed', 'online', null, 8000, 'PLN', 'package', 'https://meet.example.test/zosia', 'single', null, null, 'disabled', '2026-09-01T08:00:00Z', '2026-09-10T16:05:00Z', null),
  ('94000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', null, 'At the restaurant', 'English', '2026-09-18T14:00:00Z', '2026-09-18T15:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', null, 7500, 'PLN', 'per_lesson', 'https://meet.example.test/hania', 'single', null, null, 'disabled', '2026-09-01T08:00:00Z', null, null),
  ('94000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', null, '92000000-0000-4000-8000-000000000001', 'English B1 — speaking', 'English', '2026-09-22T15:00:00Z', '2026-09-22T16:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', null, 6000, 'PLN', 'per_student', 'https://meet.example.test/group', 'recurring', '93000000-0000-4000-8000-000000000001', '2026-09-22T15:00:00Z', 'disabled', '2026-09-01T08:00:00Z', null, null),
  ('94000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', null, '92000000-0000-4000-8000-000000000001', 'English B1 — speaking', 'English', '2026-09-29T15:00:00Z', '2026-09-29T16:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', null, 6000, 'PLN', 'per_student', 'https://meet.example.test/group', 'recurring', '93000000-0000-4000-8000-000000000001', '2026-09-29T15:00:00Z', 'disabled', '2026-09-01T08:00:00Z', null, null),
  ('94000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', null, 'Conditionals review', 'English', '2026-09-12T10:00:00Z', '2026-09-12T11:00:00Z', 'Europe/Warsaw', 'cancelled', 'online', null, 9000, 'PLN', 'per_lesson', 'https://meet.example.test/adam', 'single', null, null, 'disabled', '2026-09-01T08:00:00Z', null, '2026-09-11T12:00:00Z'),
  ('94000000-0000-4000-8000-000000000006', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', null, 'Present Perfect — experiences', 'English', '2026-09-16T12:00:00Z', '2026-09-16T13:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', null, 8000, 'PLN', 'package', 'https://meet.example.test/zosia', 'single', null, null, 'disabled', '2026-09-01T08:00:00Z', null, null),
  ('94000000-0000-4000-8000-000000000007', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', null, 'Travel vocabulary', 'English', '2026-09-16T13:30:00Z', '2026-09-16T14:30:00Z', 'Europe/Warsaw', 'scheduled', 'online', null, 7500, 'PLN', 'per_lesson', 'https://meet.example.test/hania', 'single', null, null, 'disabled', '2026-09-01T08:00:00Z', null, null),
  ('94000000-0000-4000-8000-000000000008', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', null, '92000000-0000-4000-8000-000000000001', 'English B1 — speaking', 'English', '2026-09-16T16:00:00Z', '2026-09-16T17:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', null, 6000, 'PLN', 'per_student', 'https://meet.example.test/group', 'single', null, null, 'disabled', '2026-09-01T08:00:00Z', null, null),
  ('94000000-0000-4000-8000-000000000009', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', null, 'Conditionals — practice', 'English', '2026-09-17T15:00:00Z', '2026-09-17T16:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', null, 9000, 'PLN', 'per_lesson', 'https://meet.example.test/adam', 'single', null, null, 'disabled', '2026-09-01T08:00:00Z', null, null),
  ('94000000-0000-4000-8000-000000000010', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', null, 'Daily routines', 'English', '2026-09-15T14:00:00Z', '2026-09-15T15:00:00Z', 'Europe/Warsaw', 'needs_completion', 'online', null, 7500, 'PLN', 'per_lesson', 'https://meet.example.test/hania', 'single', null, null, 'disabled', '2026-09-01T08:00:00Z', null, null)
on conflict (id) do update set title = excluded.title, starts_at = excluded.starts_at,
  ends_at = excluded.ends_at, status = excluded.status,
  completed_at = excluded.completed_at, cancelled_at = excluded.cancelled_at,
  updated_at = now();

insert into public.lesson_participants (id, workspace_id, lesson_id, student_id, payment_status)
values
  ('95000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'paid'),
  ('95000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'unpaid'),
  ('95000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'unpaid'),
  ('95000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000002', 'unpaid'),
  ('95000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003', 'unpaid'),
  ('95000000-0000-4000-8000-000000000006', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001', 'unpaid'),
  ('95000000-0000-4000-8000-000000000007', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000002', 'unpaid'),
  ('95000000-0000-4000-8000-000000000008', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000003', 'unpaid'),
  ('95000000-0000-4000-8000-000000000009', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000003', 'cancelled'),
  ('95000000-0000-4000-8000-000000000010', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000001', 'unpaid'),
  ('95000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000007', '91000000-0000-4000-8000-000000000002', 'unpaid'),
  ('95000000-0000-4000-8000-000000000012', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000008', '91000000-0000-4000-8000-000000000001', 'unpaid'),
  ('95000000-0000-4000-8000-000000000013', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000008', '91000000-0000-4000-8000-000000000002', 'unpaid'),
  ('95000000-0000-4000-8000-000000000014', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000008', '91000000-0000-4000-8000-000000000003', 'unpaid'),
  ('95000000-0000-4000-8000-000000000015', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000009', '91000000-0000-4000-8000-000000000003', 'unpaid'),
  ('95000000-0000-4000-8000-000000000016', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000002', 'unpaid')
on conflict (lesson_id, student_id) do update set payment_status = excluded.payment_status;

insert into public.attendances (id, workspace_id, lesson_id, student_id, status, marked_at)
values
  ('95100000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'present', '2026-09-10T16:00:00Z'),
  ('95100000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'unknown', null),
  ('95100000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000002', 'unknown', null),
  ('95100000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003', 'unknown', null)
on conflict (lesson_id, student_id) do update set status = excluded.status, marked_at = excluded.marked_at;

insert into public.lesson_notes (id, workspace_id, lesson_id, author_user_id, content, visibility, note_type)
values (
  '96000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  'Zosia dobrze opanowała końcówki -ed.', 'private', 'general'
) on conflict (lesson_id, author_user_id, note_type) do update set content = excluded.content;

insert into public.lesson_notes (id, workspace_id, lesson_id, author_user_id, content, visibility, note_type)
values
  ('96000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000006', '90000000-0000-4000-8000-000000000001', 'Rozróżnić Present Perfect i Past Simple oraz użyć obu czasów w rozmowie.', 'private', 'objectives'),
  ('96000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'Przećwiczyliśmy opowiadanie o przeszłości. Warto powtórzyć czasowniki nieregularne.', 'student_visible', 'student_summary')
on conflict (lesson_id, author_user_id, note_type) do update set content = excluded.content, visibility = excluded.visibility;

insert into public.lesson_plan_items (id, workspace_id, lesson_id, position, content)
values
  ('96200000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000006', 0, 'Rozgrzewka: ostatnie doświadczenia'),
  ('96200000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000006', 1, 'Porównanie obu czasów na przykładach'),
  ('96200000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000006', 2, 'Ćwiczenie w rozmowie')
on conflict (id) do update set position = excluded.position, content = excluded.content;

insert into public.materials (id, workspace_id, owner_user_id, title, description, type, external_url)
values ('96300000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'Present Perfect — ćwiczenia', 'Interaktywna powtórka przed rozmową.', 'link', 'https://example.test/materials/present-perfect')
on conflict (id) do update set title = excluded.title, description = excluded.description, external_url = excluded.external_url;

insert into public.lesson_materials (id, workspace_id, lesson_id, material_id)
values ('96400000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000006', '96300000-0000-4000-8000-000000000001')
on conflict (lesson_id, material_id) do nothing;

insert into public.homeworks (id, workspace_id, lesson_id, student_id, title, description, status, due_at)
values (
  '96100000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Past Simple practice', 'Napisz pięć zdań o ostatnim weekendzie.',
  'assigned', '2026-09-17T15:00:00Z'
) on conflict (lesson_id) do update set title = excluded.title, description = excluded.description;

insert into public.payments (
  id, workspace_id, student_id, amount_grosz, currency, status,
  payment_method, provider, provider_transaction_id, paid_at, created_at
) values
  ('97000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 16000, 'PLN', 'paid', 'bank_transfer', null, null, '2026-09-01T09:00:00Z', '2026-09-01T09:00:00Z'),
  ('97000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 7500, 'PLN', 'pending', 'cash', null, null, null, '2026-09-15T09:00:00Z'),
  ('97000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 2500, 'PLN', 'paid', 'bank_transfer', null, null, '2026-09-12T09:00:00Z', '2026-09-12T09:00:00Z')
on conflict (id) do update set status = excluded.status, paid_at = excluded.paid_at;

insert into public.packages (
  id, workspace_id, student_id, name, total_lessons, price_grosz,
  currency, status, purchased_at, expires_at
) values (
  '98000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000001',
  'Pakiet 2 lekcji', 2, 16000, 'PLN', 'active',
  '2026-09-01T09:00:00Z', '2027-03-01T09:00:00Z'
) on conflict (id) do update set total_lessons = 2, price_grosz = 16000, status = 'active';

insert into public.charges (
  id, workspace_id, student_id, package_id, type, description, amount_grosz,
  currency, status, due_at, created_at, settled_at
) values (
  '98300000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  'package', 'Pakiet 2 lekcji', 16000, 'PLN', 'settled',
  '2026-09-08T09:00:00Z', '2026-09-01T09:00:00Z', '2026-09-01T09:00:00Z'
) on conflict (id) do update set status = excluded.status, settled_at = excluded.settled_at;

insert into public.charges (
  id, workspace_id, student_id, type, description, amount_grosz,
  currency, status, due_at, created_at
) values (
  '98300000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000002',
  'manual', 'Lekcja 8 września', 7500, 'PLN', 'partial',
  '2026-09-15T18:00:00Z', '2026-09-08T15:00:00Z'
) on conflict (id) do update set status = excluded.status, due_at = excluded.due_at;

insert into public.payment_allocations (
  id, workspace_id, payment_id, charge_id, package_id, amount_grosz
) values
  ('98100000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000001', 16000),
  ('98100000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000003', '98300000-0000-4000-8000-000000000002', null, 2500)
on conflict (id) do update set amount_grosz = excluded.amount_grosz;

insert into public.package_usages (
  id, workspace_id, package_id, lesson_id, kind, units, idempotency_key, created_at
) values (
  '98200000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '98000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  'consumption', 1, 'seed-complete-zosia-20260910', '2026-09-10T16:05:00Z'
) on conflict (workspace_id, idempotency_key) do nothing;

insert into public.availability_rules (
  id, workspace_id, tutor_id, kind, label, day_of_week,
  start_time, end_time, timezone, all_day, is_available
) values
  ('99000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'recurring', 'Dostępność', 1, '14:00', '20:00', 'Europe/Warsaw', false, true),
  ('99000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'recurring', 'Dostępność', 2, '14:00', '20:00', 'Europe/Warsaw', false, true),
  ('99000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'recurring', 'Dostępność', 4, '14:00', '20:00', 'Europe/Warsaw', false, true)
on conflict (id) do update set
  start_time = excluded.start_time, end_time = excluded.end_time,
  is_available = excluded.is_available, updated_at = now();

insert into public.availability_exceptions (
  id, workspace_id, tutor_id, exception_date, kind,
  start_time, end_time, timezone, reason
) values (
  '99100000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000001',
  '2026-09-17', 'unavailable', null, null, 'Europe/Warsaw', 'Sprawy prywatne'
) on conflict (id) do update set kind = excluded.kind, reason = excluded.reason, updated_at = now();

insert into public.calendar_blocks (
  id, workspace_id, tutor_id, title, starts_at, ends_at, timezone, created_at
) values (
  '99200000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000001',
  'Lekarz', '2026-09-21T08:00:00Z', '2026-09-21T09:00:00Z',
  'Europe/Warsaw', '2026-09-01T08:00:00Z'
) on conflict (id) do update set
  title = excluded.title, starts_at = excluded.starts_at,
  ends_at = excluded.ends_at, updated_at = now();
