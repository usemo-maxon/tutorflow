begin;
select plan(27);

select has_table('public', 'lesson_reuse_imports', 'reuse receipts exist');
select has_function(
  'public', 'apply_previous_lesson_preparation',
  array['uuid', 'uuid', 'uuid[]', 'uuid[]', 'boolean', 'uuid'],
  'atomic previous lesson reuse function exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a3600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reuse-a@example.test', '', '{}', '{"full_name":"Reuse A"}', now(), now()),
  ('a3600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reuse-b@example.test', '', '{}', '{"full_name":"Reuse B"}', now(), now());

select set_config('test.reuse_workspace_a', (select workspace_id::text from public.tutor_profiles where user_id = 'a3600000-0000-4000-8000-000000000001'), true);
select set_config('test.reuse_workspace_b', (select workspace_id::text from public.tutor_profiles where user_id = 'a3600000-0000-4000-8000-000000000002'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a3600000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values
  ('b3600000-0000-4000-8000-000000000001', current_setting('test.reuse_workspace_a')::uuid, 'Anna', 'Anna', 'active', 60, 'PLN', 'online'),
  ('b3600000-0000-4000-8000-000000000002', current_setting('test.reuse_workspace_a')::uuid, 'Ola', 'Ola', 'active', 60, 'PLN', 'online');
insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values ('c3600000-0000-4000-8000-000000000001', current_setting('test.reuse_workspace_a')::uuid, 'B1 Team', 'active', 60, 'PLN');

insert into public.lessons (
  id, workspace_id, tutor_id, student_id, group_id, title, starts_at, ends_at,
  timezone, status, completed_at, cancelled_at, format, price_grosz, currency, billing_type
)
values
  ('d3600000-0000-4000-8000-000000000001', current_setting('test.reuse_workspace_a')::uuid, 'a3600000-0000-4000-8000-000000000001', 'b3600000-0000-4000-8000-000000000001', null, 'Present Perfect', now() - interval '14 days', now() - interval '14 days' + interval '1 hour', 'Europe/Warsaw', 'completed', now() - interval '14 days', null, 'online', 1000, 'PLN', 'per_lesson'),
  ('d3600000-0000-4000-8000-000000000002', current_setting('test.reuse_workspace_a')::uuid, 'a3600000-0000-4000-8000-000000000001', 'b3600000-0000-4000-8000-000000000001', null, 'Today', now() + interval '1 day', now() + interval '1 day 1 hour', 'Europe/Warsaw', 'scheduled', null, null, 'online', 1000, 'PLN', 'per_lesson'),
  ('d3600000-0000-4000-8000-000000000003', current_setting('test.reuse_workspace_a')::uuid, 'a3600000-0000-4000-8000-000000000001', 'b3600000-0000-4000-8000-000000000002', null, 'Unrelated', now() - interval '7 days', now() - interval '7 days' + interval '1 hour', 'Europe/Warsaw', 'completed', now() - interval '7 days', null, 'online', 1000, 'PLN', 'per_lesson'),
  ('d3600000-0000-4000-8000-000000000004', current_setting('test.reuse_workspace_a')::uuid, 'a3600000-0000-4000-8000-000000000001', 'b3600000-0000-4000-8000-000000000001', null, 'Future', now() + interval '2 days', now() + interval '2 days 1 hour', 'Europe/Warsaw', 'completed', now(), null, 'online', 1000, 'PLN', 'per_lesson'),
  ('d3600000-0000-4000-8000-000000000005', current_setting('test.reuse_workspace_a')::uuid, 'a3600000-0000-4000-8000-000000000001', null, 'c3600000-0000-4000-8000-000000000001', 'Group source', now() - interval '10 days', now() - interval '10 days' + interval '1 hour', 'Europe/Warsaw', 'completed', now() - interval '10 days', null, 'online', 1000, 'PLN', 'per_student'),
  ('d3600000-0000-4000-8000-000000000006', current_setting('test.reuse_workspace_a')::uuid, 'a3600000-0000-4000-8000-000000000001', null, 'c3600000-0000-4000-8000-000000000001', 'Group target', now() + interval '1 day', now() + interval '1 day 1 hour', 'Europe/Warsaw', 'scheduled', null, null, 'online', 1000, 'PLN', 'per_student');

insert into public.lesson_plan_items (
  id, workspace_id, lesson_id, position, content, title, instructions, estimated_minutes, completed
)
values
  ('e3600000-0000-4000-8000-000000000001', current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 0, 'Warm-up', 'Warm-up', 'Two questions', 5, true),
  ('e3600000-0000-4000-8000-000000000002', current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 1, 'Speaking', 'Speaking', 'Pair work', 20, true),
  ('e3600000-0000-4000-8000-000000000003', current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000002', 0, 'Existing', 'Existing', 'Keep me', 10, false),
  ('e3600000-0000-4000-8000-000000000004', current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000005', 0, 'Shared group task', 'Shared group task', 'Shared only', 15, true);

insert into public.lesson_notes (workspace_id, lesson_id, author_user_id, content, visibility, note_type)
values
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 'a3600000-0000-4000-8000-000000000001', 'Previous objective', 'private', 'objectives'),
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 'a3600000-0000-4000-8000-000000000001', 'Private historical note', 'private', 'general'),
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000002', 'a3600000-0000-4000-8000-000000000001', 'Today objective', 'private', 'objectives');

insert into public.materials (id, workspace_id, owner_user_id, title, type, external_url, archived_at)
values
  ('f3600000-0000-4000-8000-000000000001', current_setting('test.reuse_workspace_a')::uuid, 'a3600000-0000-4000-8000-000000000001', 'Canonical PDF', 'link', 'https://example.test/pdf', null),
  ('f3600000-0000-4000-8000-000000000002', current_setting('test.reuse_workspace_a')::uuid, 'a3600000-0000-4000-8000-000000000001', 'Archived questions', 'link', 'https://example.test/questions', now());
insert into public.lesson_materials (workspace_id, lesson_id, material_id)
values
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 'f3600000-0000-4000-8000-000000000001'),
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 'f3600000-0000-4000-8000-000000000002'),
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000002', 'f3600000-0000-4000-8000-000000000001');

insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 'b3600000-0000-4000-8000-000000000001'),
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000005', 'b3600000-0000-4000-8000-000000000001'),
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000005', 'b3600000-0000-4000-8000-000000000002'),
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000006', 'b3600000-0000-4000-8000-000000000001'),
  (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000006', 'b3600000-0000-4000-8000-000000000002');
insert into public.attendances (workspace_id, lesson_id, student_id, status, marked_at)
values (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 'b3600000-0000-4000-8000-000000000001', 'present', now());
insert into public.homeworks (workspace_id, lesson_id, student_id, title, description, status)
values (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 'b3600000-0000-4000-8000-000000000001', 'Old homework', 'Done', 'completed');
insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, progress_summary, next_step)
values (current_setting('test.reuse_workspace_a')::uuid, 'd3600000-0000-4000-8000-000000000001', 'b3600000-0000-4000-8000-000000000001', 'Historical result', 'Historical next step');

select lives_ok($$
  select public.apply_previous_lesson_preparation(
    'd3600000-0000-4000-8000-000000000002',
    'd3600000-0000-4000-8000-000000000001',
    array['e3600000-0000-4000-8000-000000000001'::uuid, 'e3600000-0000-4000-8000-000000000002'::uuid],
    array['f3600000-0000-4000-8000-000000000001'::uuid, 'f3600000-0000-4000-8000-000000000002'::uuid, 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid],
    true,
    '03600000-0000-4000-8000-000000000001'
  )
$$, 'same-student completed lesson preparation can be reused');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000002'), 3, 'selected sections append to the existing plan');
select is((select title from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000002' order by position desc limit 1), 'Speaking', 'source section order is retained');
select is((select instructions from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000002' and title = 'Warm-up'), 'Two questions', 'reusable section instructions are copied');
select is((select sum(estimated_minutes)::integer from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000002'), 35, 'estimated durations are copied');
select ok(not exists(select 1 from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000002' and completed), 'copied completion state is reset');
select is((select content from public.lesson_notes where lesson_id = 'd3600000-0000-4000-8000-000000000002' and note_type = 'objectives'), E'Today objective\n\nPrevious objective', 'today objective is preserved and the selected draft is appended');
select is((select count(*)::integer from public.lesson_notes where lesson_id = 'd3600000-0000-4000-8000-000000000002' and note_type = 'general'), 0, 'private post-lesson notes are not copied');
select is((select count(*)::integer from public.lesson_materials where lesson_id = 'd3600000-0000-4000-8000-000000000002'), 2, 'canonical materials are deduplicated and archived accessible material is retained');
select ok(exists(select 1 from public.lesson_materials where lesson_id = 'd3600000-0000-4000-8000-000000000002' and material_id = 'f3600000-0000-4000-8000-000000000002'), 'archived material reuses the canonical reference');
select is((select count(*)::integer from public.attendances where lesson_id = 'd3600000-0000-4000-8000-000000000002'), 0, 'attendance is not copied');
select is((select count(*)::integer from public.homeworks where lesson_id = 'd3600000-0000-4000-8000-000000000002'), 0, 'completed homework is not copied');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = 'd3600000-0000-4000-8000-000000000002'), 0, 'historical outcomes and next steps are not copied');

select lives_ok($$
  select public.apply_previous_lesson_preparation(
    'd3600000-0000-4000-8000-000000000002', 'd3600000-0000-4000-8000-000000000001',
    array['e3600000-0000-4000-8000-000000000001'::uuid], array[]::uuid[], false,
    '03600000-0000-4000-8000-000000000001'
  )
$$, 'retry with the same import key succeeds safely');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000002'), 3, 'retry does not append duplicate sections');
select lives_ok($$
  select public.apply_previous_lesson_preparation(
    'd3600000-0000-4000-8000-000000000002', 'd3600000-0000-4000-8000-000000000001',
    array['e3600000-0000-4000-8000-000000000001'::uuid], array[]::uuid[], false,
    '03600000-0000-4000-8000-000000000002'
  )
$$, 'a new import key makes intentional additional reuse explicit');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000002'), 4, 'intentional second import appends again');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000001' and completed), 2, 'source edits and state remain independent');

select throws_ok($$select public.apply_previous_lesson_preparation('d3600000-0000-4000-8000-000000000002', 'd3600000-0000-4000-8000-000000000003', array[]::uuid[], array[]::uuid[], false, '03600000-0000-4000-8000-000000000003')$$, 'P0002', null, 'unrelated student source is rejected');
select throws_ok($$select public.apply_previous_lesson_preparation('d3600000-0000-4000-8000-000000000002', 'd3600000-0000-4000-8000-000000000004', array[]::uuid[], array[]::uuid[], false, '03600000-0000-4000-8000-000000000004')$$, 'P0002', null, 'future source is rejected');

select lives_ok($$
  select public.apply_previous_lesson_preparation(
    'd3600000-0000-4000-8000-000000000006', 'd3600000-0000-4000-8000-000000000005',
    array['e3600000-0000-4000-8000-000000000004'::uuid], array[]::uuid[], false,
    '03600000-0000-4000-8000-000000000005'
  )
$$, 'same-group shared plan can be reused');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = 'd3600000-0000-4000-8000-000000000006'), 1, 'group target receives only the shared plan');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = 'd3600000-0000-4000-8000-000000000006'), 0, 'group participant outcomes remain private and uncopied');

set local role postgres;
update public.subscriptions set read_only = true where teacher_id = 'a3600000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3600000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.apply_previous_lesson_preparation('d3600000-0000-4000-8000-000000000002', 'd3600000-0000-4000-8000-000000000001', array[]::uuid[], array[]::uuid[], false, '03600000-0000-4000-8000-000000000006')$$, '42501', null, 'read-only member cannot reuse preparation');

set local role postgres;
insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values ('b3600000-0000-4000-8000-000000000099', current_setting('test.reuse_workspace_b')::uuid, 'Foreign', 'Foreign', 'active', 60, 'PLN', 'online');
insert into public.lessons (id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone, status, completed_at, format, price_grosz, currency, billing_type)
values ('d3600000-0000-4000-8000-000000000099', current_setting('test.reuse_workspace_b')::uuid, 'a3600000-0000-4000-8000-000000000002', 'b3600000-0000-4000-8000-000000000099', 'Foreign', now() - interval '1 day', now() - interval '23 hours', 'Europe/Warsaw', 'completed', now() - interval '23 hours', 'online', 1000, 'PLN', 'per_lesson');
update public.subscriptions set read_only = false where teacher_id = 'a3600000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3600000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.apply_previous_lesson_preparation('d3600000-0000-4000-8000-000000000002', 'd3600000-0000-4000-8000-000000000099', array[]::uuid[], array[]::uuid[], false, '03600000-0000-4000-8000-000000000007')$$, 'P0002', null, 'other-workspace source is rejected');

select * from finish();
rollback;
