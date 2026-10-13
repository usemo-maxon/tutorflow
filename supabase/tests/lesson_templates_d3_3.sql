begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'templates-a@example.test', '', '{}', '{"full_name":"Templates A"}', now(), now()),
  ('81000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'templates-b@example.test', '', '{}', '{"full_name":"Templates B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, display_name)
values ('82000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), 'Ada', 'Ada');
insert into public.groups (id, workspace_id, name)
values ('83000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), 'B1 speaking');
insert into public.lessons (id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone)
values ('84000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), '81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Existing topic', '2031-02-01T10:00:00Z', '2031-02-01T11:00:00Z', 'Europe/Warsaw');
insert into public.lessons (id, workspace_id, tutor_id, group_id, title, starts_at, ends_at, timezone)
values ('84000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), '81000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'Group topic', '2031-02-02T10:00:00Z', '2031-02-02T11:00:00Z', 'Europe/Warsaw');
insert into public.materials (id, workspace_id, owner_user_id, title, type, external_url)
values ('85000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), '81000000-0000-4000-8000-000000000001', 'Speaking questions', 'link', 'https://example.test/questions');
insert into public.material_tags (id, workspace_id, name)
values ('86000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), 'Grammar');

select lives_ok($$
  insert into public.lesson_templates (id, workspace_id, owner_user_id, title, description, subject, level, objective, teacher_notes, estimated_duration_minutes)
  values ('87000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), '81000000-0000-4000-8000-000000000001', 'Present Perfect — B1', 'Conversation revision', 'English', 'B1', 'Template objective', 'Prepare examples', 60)
$$, 'template can be created');
select lives_ok($$
  select public.replace_lesson_template_content(
    '87000000-0000-4000-8000-000000000001',
    '[{"id":"88000000-0000-4000-8000-000000000001","title":"Warm-up","content":"Ask two questions","estimatedMinutes":10},{"id":"88000000-0000-4000-8000-000000000002","title":"Speaking","content":"Life experiences","estimatedMinutes":25}]'::jsonb,
    array['85000000-0000-4000-8000-000000000001']::uuid[],
    array['86000000-0000-4000-8000-000000000001']::uuid[])
$$, 'ordered sections, material, and shared tag can be attached');
select is((select string_agg(title, ',' order by position) from public.lesson_template_sections), 'Warm-up,Speaking', 'section order is persisted');
select is((select count(*)::integer from public.lesson_template_materials), 1, 'canonical material is referenced once');
select is((select count(*)::integer from public.lesson_template_tag_assignments), 1, 'D3.2 tag is reused');

select lives_ok($$
  select public.replace_lesson_template_content(
    '87000000-0000-4000-8000-000000000001',
    '[{"id":"88000000-0000-4000-8000-000000000002","title":"Speaking","content":"Life experiences","estimatedMinutes":25},{"id":"88000000-0000-4000-8000-000000000001","title":"Warm-up","content":"Ask two questions","estimatedMinutes":10}]'::jsonb,
    array['85000000-0000-4000-8000-000000000001']::uuid[], array['86000000-0000-4000-8000-000000000001']::uuid[])
$$, 'sections can be reordered');
select is((select title from public.lesson_template_sections order by position limit 1), 'Speaking', 'new section order is authoritative');

insert into public.lesson_plan_items (workspace_id, lesson_id, position, content)
values ((select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), '84000000-0000-4000-8000-000000000001', 0, 'Existing plan');
insert into public.lesson_notes (workspace_id, lesson_id, author_user_id, content, visibility, note_type)
values
  ((select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), '84000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'Existing objective', 'private', 'objectives'),
  ((select workspace_id from public.tutor_profiles where user_id = '81000000-0000-4000-8000-000000000001'), '84000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'Existing note', 'private', 'general');
select lives_ok($$select public.apply_lesson_template('84000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001')$$, 'template applies to an individual lesson');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = '84000000-0000-4000-8000-000000000001'), 3, 'existing plan is preserved and sections are appended');
select is((select content from public.lesson_notes where lesson_id = '84000000-0000-4000-8000-000000000001' and note_type = 'objectives'), E'Existing objective\n\nTemplate objective', 'existing objective is not overwritten');
select is((select content from public.lesson_notes where lesson_id = '84000000-0000-4000-8000-000000000001' and note_type = 'general'), E'Existing note\n\nPrepare examples', 'teacher preparation is appended privately');
select is((select count(*)::integer from public.lesson_materials where lesson_id = '84000000-0000-4000-8000-000000000001'), 1, 'material relationship is copied to lesson');
select lives_ok($$select public.apply_lesson_template('84000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000001')$$, 'same template applies to a group lesson');
select is((select count(*)::integer from public.lesson_plan_items where lesson_id = '84000000-0000-4000-8000-000000000002'), 2, 'group lesson receives one shared plan');

update public.lesson_templates set objective = 'Changed later' where id = '87000000-0000-4000-8000-000000000001';
select is((select content from public.lesson_notes where lesson_id = '84000000-0000-4000-8000-000000000001' and note_type = 'objectives'), E'Existing objective\n\nTemplate objective', 'later template edits do not mutate applied lesson');
update public.materials set archived_at = now() where id = '85000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.lesson_template_materials where material_id = '85000000-0000-4000-8000-000000000001'), 1, 'archived material remains referenced by template');
select is((select count(*)::integer from public.lesson_materials where material_id = '85000000-0000-4000-8000-000000000001'), 2, 'archived material remains attached to applied lessons');

insert into public.lesson_templates (id, workspace_id, owner_user_id, title, objective)
select '87000000-0000-4000-8000-000000000002', workspace_id, owner_user_id, title || ' — kopia', objective from public.lesson_templates where id = '87000000-0000-4000-8000-000000000001';
select lives_ok($$select public.replace_lesson_template_content('87000000-0000-4000-8000-000000000002', '[{"title":"Speaking","content":"Independent"}]'::jsonb, '{}', '{}')$$, 'duplicate receives independent content');
update public.lesson_template_sections set title = 'Changed copy' where template_id = '87000000-0000-4000-8000-000000000002';
select is((select title from public.lesson_template_sections where template_id = '87000000-0000-4000-8000-000000000001' order by position limit 1), 'Speaking', 'editing duplicate does not change source');
update public.lesson_templates set archived_at = now() where id = '87000000-0000-4000-8000-000000000001';
select ok((select archived_at is not null from public.lesson_templates where id = '87000000-0000-4000-8000-000000000001'), 'template archives without deletion');

set local request.jwt.claims = '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.lesson_templates), 0, 'other workspace cannot browse templates');
select is((select count(*)::integer from public.lesson_template_sections), 0, 'other workspace cannot browse template sections');
select throws_ok($$select public.apply_lesson_template('84000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000002')$$, '42501', null, 'other workspace cannot apply a template');

set local role postgres;
update public.subscriptions set read_only = true where teacher_id = '81000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.lesson_templates), 2, 'read-only account can browse templates');
update public.lesson_templates set title = 'Blocked' where id = '87000000-0000-4000-8000-000000000002';
select is((select title from public.lesson_templates where id = '87000000-0000-4000-8000-000000000002'), 'Present Perfect — B1 — kopia', 'read-only account cannot edit templates');
select throws_ok($$select public.apply_lesson_template('84000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000002')$$, '42501', null, 'read-only account cannot apply templates');

select * from finish();
rollback;
