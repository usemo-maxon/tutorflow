begin;
select plan(28);

select has_column('public', 'lesson_plan_items', 'title', 'plan item has a title');
select has_column('public', 'lesson_plan_items', 'instructions', 'plan item has instructions');
select has_column('public', 'lesson_plan_items', 'estimated_minutes', 'plan item has minutes');
select has_column('public', 'lesson_plan_items', 'completed', 'plan item can be checked');
select has_function(
  'public', 'replace_lesson_plan',
  array['uuid', 'timestamp with time zone', 'text', 'text', 'jsonb'],
  'atomic lesson plan mutation exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'planner-a@example.test', '', '{}', '{"full_name":"Planner A"}', now(), now()),
  ('91000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'planner-b@example.test', '', '{}', '{"full_name":"Planner B"}', now(), now());

select set_config('test.planner_workspace_a', (select workspace_id::text from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), true);
select set_config('test.planner_workspace_b', (select workspace_id::text from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000002'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values
  ('92000000-0000-4000-8000-000000000001', current_setting('test.planner_workspace_a')::uuid, 'Anna', 'Anna', 'active', 60, 'PLN', 'online'),
  ('92000000-0000-4000-8000-000000000002', current_setting('test.planner_workspace_a')::uuid, 'Ola', 'Ola', 'active', 60, 'PLN', 'online');
insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values ('93000000-0000-4000-8000-000000000001', current_setting('test.planner_workspace_a')::uuid, 'B1 Team', 'active', 60, 'PLN');

insert into public.lessons (
  id, workspace_id, tutor_id, student_id, group_id, title, starts_at, ends_at,
  timezone, status, format, price_grosz, currency, billing_type
)
values
  ('d3500000-0000-4000-8000-000000000001', current_setting('test.planner_workspace_a')::uuid, '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', null, 'Individual', now() - interval '2 hours', now() - interval '1 hour', 'Europe/Warsaw', 'scheduled', 'online', 1000, 'PLN', 'per_lesson'),
  ('d3500000-0000-4000-8000-000000000002', current_setting('test.planner_workspace_a')::uuid, '91000000-0000-4000-8000-000000000001', null, '93000000-0000-4000-8000-000000000001', 'Group', now() + interval '1 day', now() + interval '1 day 1 hour', 'Europe/Warsaw', 'scheduled', 'online', 1000, 'PLN', 'per_student');
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values
  (current_setting('test.planner_workspace_a')::uuid, 'd3500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'),
  (current_setting('test.planner_workspace_a')::uuid, 'd3500000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001'),
  (current_setting('test.planner_workspace_a')::uuid, 'd3500000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002');

select lives_ok($$
  select public.replace_lesson_plan(
    'd3500000-0000-4000-8000-000000000001',
    (select updated_at from public.lessons where id = 'd3500000-0000-4000-8000-000000000001'),
    'Present Perfect', 'Rozmowa o doświadczeniach',
    '[{"id":"95000000-0000-4000-8000-000000000001","title":"Warm-up","instructions":"Two questions","minutes":5,"completed":false},{"id":"95000000-0000-4000-8000-000000000002","title":"Speaking","instructions":"Pair work","minutes":20,"completed":false}]'::jsonb
  )
$$, 'a concrete lesson plan can be created');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = 'd3500000-0000-4000-8000-000000000001'), 2, 'plan has two ordered items');
select is((select content from public.lesson_notes where lesson_id = 'd3500000-0000-4000-8000-000000000001' and note_type = 'objectives'), 'Rozmowa o doświadczeniach', 'today objective is lesson-specific');
select is((select sum(estimated_minutes)::integer from public.lesson_plan_items where lesson_id = 'd3500000-0000-4000-8000-000000000001'), 25, 'planned duration is calculable');

select lives_ok($$
  select public.replace_lesson_plan(
    'd3500000-0000-4000-8000-000000000001',
    (select updated_at from public.lessons where id = 'd3500000-0000-4000-8000-000000000001'),
    'Present Perfect', 'Rozmowa o doświadczeniach',
    '[{"id":"95000000-0000-4000-8000-000000000002","title":"Speaking","instructions":"Pair work","minutes":20,"completed":true},{"id":"95000000-0000-4000-8000-000000000001","title":"Warm-up","instructions":"Two questions","minutes":5,"completed":false}]'::jsonb
  )
$$, 'plan items can be reordered and checked');
select is((select title from public.lesson_plan_items where lesson_id = 'd3500000-0000-4000-8000-000000000001' order by position limit 1), 'Speaking', 'reordered position is authoritative');
select ok((select completed from public.lesson_plan_items where id = '95000000-0000-4000-8000-000000000002'), 'completion state stays on the shared item');

insert into public.materials (id, workspace_id, owner_user_id, title, type, external_url)
values
  ('96000000-0000-4000-8000-000000000001', current_setting('test.planner_workspace_a')::uuid, '91000000-0000-4000-8000-000000000001', 'Student material', 'link', 'https://example.test/student'),
  ('96000000-0000-4000-8000-000000000002', current_setting('test.planner_workspace_a')::uuid, '91000000-0000-4000-8000-000000000001', 'Group material', 'link', 'https://example.test/group'),
  ('96000000-0000-4000-8000-000000000003', current_setting('test.planner_workspace_a')::uuid, '91000000-0000-4000-8000-000000000001', 'Library material', 'link', 'https://example.test/library'),
  ('96000000-0000-4000-8000-000000000004', current_setting('test.planner_workspace_a')::uuid, '91000000-0000-4000-8000-000000000001', 'Template material', 'link', 'https://example.test/template');
insert into public.student_material_assignments (workspace_id, student_id, material_id, assigned_by)
values (current_setting('test.planner_workspace_a')::uuid, '92000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001');
insert into public.group_material_assignments (workspace_id, group_id, material_id, assigned_by)
values (current_setting('test.planner_workspace_a')::uuid, '93000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001');
insert into public.lesson_materials (workspace_id, lesson_id, material_id)
values
  (current_setting('test.planner_workspace_a')::uuid, 'd3500000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001'),
  (current_setting('test.planner_workspace_a')::uuid, 'd3500000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000002'),
  (current_setting('test.planner_workspace_a')::uuid, 'd3500000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000003');
select is((select count(*)::integer from public.lesson_materials), 3, 'student, group and library materials attach canonically');
select is((select count(*)::integer from public.student_material_assignments), 1, 'lesson attachment does not change student assignment');
select is((select count(*)::integer from public.group_material_assignments), 1, 'lesson attachment does not change group assignment');

set local role postgres;
insert into public.materials (id, workspace_id, owner_user_id, title, type, external_url)
values ('96000000-0000-4000-8000-000000000099', current_setting('test.planner_workspace_b')::uuid, '91000000-0000-4000-8000-000000000002', 'Foreign material', 'link', 'https://example.test/foreign');
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$
  insert into public.lesson_materials (workspace_id, lesson_id, material_id)
  values (current_setting('test.planner_workspace_a')::uuid, 'd3500000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000099')
$$, '23503', null, 'foreign workspace material cannot be attached');

insert into public.lesson_templates (id, workspace_id, owner_user_id, title, objective)
values ('97000000-0000-4000-8000-000000000001', current_setting('test.planner_workspace_a')::uuid, '91000000-0000-4000-8000-000000000001', 'Conversation', 'Template objective');
insert into public.lesson_template_sections (workspace_id, template_id, title, content, estimated_minutes, position)
values (current_setting('test.planner_workspace_a')::uuid, '97000000-0000-4000-8000-000000000001', 'Summary', 'Exit ticket', 5, 0);
insert into public.lesson_template_materials (workspace_id, template_id, material_id)
values (current_setting('test.planner_workspace_a')::uuid, '97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000004');
select lives_ok($$select public.apply_lesson_template('d3500000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001')$$, 'template copies into existing lesson');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = 'd3500000-0000-4000-8000-000000000001'), 3, 'template appends without overwriting existing plan');
select is((select content from public.lesson_notes where lesson_id = 'd3500000-0000-4000-8000-000000000001' and note_type = 'objectives'), E'Rozmowa o doświadczeniach\n\nTemplate objective', 'template objective appends without silent overwrite');
select is((select instructions from public.lesson_plan_items where lesson_id = 'd3500000-0000-4000-8000-000000000001' order by position desc limit 1), 'Exit ticket', 'template section retains instructions');
select is((select count(*)::integer from public.lesson_materials where lesson_id = 'd3500000-0000-4000-8000-000000000001'), 3, 'template material copies as a lesson material');

select lives_ok($$select public.apply_lesson_template('d3500000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001')$$, 'template applies once to the group lesson');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = 'd3500000-0000-4000-8000-000000000002'), 1, 'group lesson has one shared plan');

set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.apply_lesson_template('d3500000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000001')$$, '42501', null, 'other workspace cannot mutate lesson preparation');

set local role postgres;
update public.subscriptions set read_only = true where teacher_id = '91000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok((select count(*) from public.lesson_plan_items where lesson_id = 'd3500000-0000-4000-8000-000000000002') > 0, 'read-only account can view preparation');
select throws_ok($$select public.apply_lesson_template('d3500000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001')$$, '42501', null, 'read-only account cannot mutate preparation');

set local role postgres;
update public.subscriptions set read_only = false where teacher_id = '91000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.attendances (workspace_id, lesson_id, student_id, status, marked_at)
values (current_setting('test.planner_workspace_a')::uuid, 'd3500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'present', now());
select lives_ok($$
  select public.complete_lesson_workspace_v2(
    current_setting('test.planner_workspace_a')::uuid,
    'd3500000-0000-4000-8000-000000000001', 'd3.5:completion',
    (select updated_at from public.lessons where id = 'd3500000-0000-4000-8000-000000000001'),
    '[{"studentId":"92000000-0000-4000-8000-000000000001","progressSummary":"Actual outcome","difficultyLevel":"mixed","nextStep":"Explicit next step"}]'::jsonb
  )
$$, 'D1 completion still records explicit outcomes');
select is((select next_step from public.lesson_student_outcomes where lesson_id = 'd3500000-0000-4000-8000-000000000001'), 'Explicit next step', 'plan completion does not infer Student Memory');

select * from finish();
rollback;
