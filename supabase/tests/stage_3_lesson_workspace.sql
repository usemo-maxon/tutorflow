begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('41000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage3-a@example.test', '', '{}', '{"full_name":"Tutor Stage 3 A"}', now(), now()),
  ('41000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage3-b@example.test', '', '{}', '{"full_name":"Tutor Stage 3 B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values
  ('42000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), 'Zosia', 'Zosia Stage 3', 'active', 60, 'PLN', 'online'),
  ('42000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), 'Hania', 'Hania Stage 3', 'active', 60, 'PLN', 'online');

insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values ('43000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), 'Grupa Stage 3', 'active', 60, 'PLN');

insert into public.lessons (id, workspace_id, tutor_id, student_id, group_id, title, starts_at, ends_at, timezone, status, format, currency, billing_type, cancelled_at)
values
  ('44000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', null, 'Pakietowa', '2031-01-10T16:00:00Z', '2031-01-10T17:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'package', null),
  ('44000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000002', null, 'Odwołana', '2031-01-11T16:00:00Z', '2031-01-11T17:00:00Z', 'Europe/Warsaw', 'cancelled', 'online', 'PLN', 'per_lesson', now()),
  ('44000000-0000-4000-8000-000000000003', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '41000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000002', null, 'Nieobecność', '2031-01-12T16:00:00Z', '2031-01-12T17:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_lesson', null),
  ('44000000-0000-4000-8000-000000000004', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '41000000-0000-4000-8000-000000000001', null, '43000000-0000-4000-8000-000000000001', 'Grupowa', '2031-01-13T16:00:00Z', '2031-01-13T17:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_student', null);

insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values
  ((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001'),
  ((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000002'),
  ((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000002'),
  ((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000004', '42000000-0000-4000-8000-000000000001'),
  ((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000004', '42000000-0000-4000-8000-000000000002');

insert into public.attendances (workspace_id, lesson_id, student_id, status)
select workspace_id, lesson_id, student_id, 'unknown'::public.attendance_status
from public.lesson_participants
where lesson_id in ('44000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000003','44000000-0000-4000-8000-000000000004');

insert into public.packages (id, workspace_id, student_id, name, total_lessons, price_grosz, currency, status)
values ('45000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '42000000-0000-4000-8000-000000000001', 'Pakiet testowy', 2, 16000, 'PLN', 'active');

select throws_ok($$
  select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000001', 'complete:44000000-0000-4000-8000-000000000001')
$$, '23514', null, 'completion requires resolved attendance');

update public.attendances set status = 'present', marked_at = now() where lesson_id = '44000000-0000-4000-8000-000000000001';
select lives_ok($$
  select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000001', 'complete:44000000-0000-4000-8000-000000000001')
$$, 'individual package lesson completes');
select is((select status::text from public.lessons where id = '44000000-0000-4000-8000-000000000001'), 'completed', 'completed status is persisted');
select ok((select completed_at is not null from public.lessons where id = '44000000-0000-4000-8000-000000000001'), 'completed_at is populated');
select is((select count(*)::integer from public.package_usages where lesson_id = '44000000-0000-4000-8000-000000000001' and kind = 'consumption'), 1, 'completion consumes one package unit');
select lives_ok($$
  select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000001', 'complete:retry:44000000-0000-4000-8000-000000000001')
$$, 'repeated completion is idempotent');
select is((select count(*)::integer from public.package_usages where lesson_id = '44000000-0000-4000-8000-000000000001' and kind = 'consumption'), 1, 'repeated completion does not double-consume');
select is((select remaining_lessons::integer from public.package_balances where package_id = '45000000-0000-4000-8000-000000000001'), 1, 'package balance refreshes after completion');

select throws_ok($$
  select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000002', 'complete:44000000-0000-4000-8000-000000000002')
$$, 'P0001', null, 'cancelled lesson cannot complete');

select lives_ok($$
  select public.mark_lesson_no_show((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000003', 'no-show:44000000-0000-4000-8000-000000000003')
$$, 'no-show transition succeeds');
select is((select status::text from public.lessons where id = '44000000-0000-4000-8000-000000000003'), 'no_show', 'no-show status is historical');
select is((select status::text from public.attendances where lesson_id = '44000000-0000-4000-8000-000000000003'), 'absent', 'no-show marks the participant absent');
select is((select count(*)::integer from public.package_usages where lesson_id = '44000000-0000-4000-8000-000000000003'), 0, 'no-show consumes no package unit');

update public.attendances set status = 'present', marked_at = now() where lesson_id = '44000000-0000-4000-8000-000000000004';
select lives_ok($$
  select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000004', 'complete:44000000-0000-4000-8000-000000000004')
$$, 'group lesson completes when every snapshotted participant is resolved');
select is((select count(*)::integer from public.attendances where lesson_id = '44000000-0000-4000-8000-000000000004' and status = 'present'), 2, 'group attendance remains per participant');

insert into public.homeworks (id, workspace_id, lesson_id, group_id, title, description, status)
values ('46000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000004', '43000000-0000-4000-8000-000000000001', 'Debata', 'Przygotuj dwa argumenty.', 'assigned');
select is((select group_id from public.homeworks where id = '46000000-0000-4000-8000-000000000001'), '43000000-0000-4000-8000-000000000001'::uuid, 'group homework remains one group-scoped record');
update public.homeworks set description = 'Przygotuj trzy argumenty.' where id = '46000000-0000-4000-8000-000000000001';
select is((select description from public.homeworks where id = '46000000-0000-4000-8000-000000000001'), 'Przygotuj trzy argumenty.', 'homework can be updated relationally');
delete from public.homeworks where id = '46000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.homeworks where id = '46000000-0000-4000-8000-000000000001'), 0, 'homework can be removed');

insert into public.homeworks (id, workspace_id, lesson_id, student_id, title, description, status)
values ('46000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000002', 'Powtórka', 'Pięć zdań.', 'assigned');

insert into public.materials (id, workspace_id, owner_user_id, title, description, type, external_url)
values ('47000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '41000000-0000-4000-8000-000000000001', 'Materiał wielokrotnego użytku', 'Test Stage 3', 'link', 'https://example.test/stage-3');
insert into public.lesson_materials (workspace_id, lesson_id, material_id)
values
  ((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000001'),
  ((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000003', '47000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.lesson_materials where material_id = '47000000-0000-4000-8000-000000000001'), 2, 'one reusable material can be attached to multiple lessons');
delete from public.lesson_materials where material_id = '47000000-0000-4000-8000-000000000001' and lesson_id = '44000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.lesson_materials where material_id = '47000000-0000-4000-8000-000000000001'), 1, 'detaching a material preserves the reusable material and other relation');

insert into public.lesson_notes (workspace_id, lesson_id, author_user_id, content, visibility, note_type)
values ((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'Prywatna treść', 'private', 'general');
select is((select visibility::text from public.lesson_notes where lesson_id = '44000000-0000-4000-8000-000000000001' and note_type = 'general'), 'private', 'tutor note remains explicitly private');

set local request.jwt.claims = '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.lesson_notes), 0, 'other workspace cannot read lesson notes');
select is((select count(*)::integer from public.homeworks), 0, 'other workspace cannot read lesson homework');
select is((select count(*)::integer from public.materials), 0, 'other workspace cannot read lesson materials');
select is((select count(*)::integer from public.attendances), 0, 'other workspace cannot read lesson attendance');
select throws_ok($$
  select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '41000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000004', 'cross-tenant:complete')
$$, '42501', null, 'other workspace cannot complete a lesson');

select * from finish();
rollback;
