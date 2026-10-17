begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('1a000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shared-a@example.test', '', '{}', '{"full_name":"Shared A"}', now(), now()),
  ('1a000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shared-b@example.test', '', '{}', '{"full_name":"Shared B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::integer from public.shared_template_publications), 12, 'authenticated tutor can browse all approved starter templates');
select is((select count(*)::integer from public.shared_template_publications where source_kind = 'official'), 12, 'starter collection is official');
select is((select count(*)::integer from public.shared_template_sections), 48, 'starter templates contain substantive structured sections');
select is((select count(*)::integer from public.shared_template_publications where level like '%A1%'), 3, 'catalog includes beginner lessons');
select is((select count(*)::integer from public.shared_template_publications where level like '%B2%'), 4, 'catalog includes upper-intermediate lessons');
select hasnt_column('public', 'shared_template_publications', 'workspace_id', 'shared snapshot has no private workspace reference');
select hasnt_column('public', 'shared_template_publications', 'teacher_notes', 'shared snapshot has no private teacher notes');
select hasnt_column('public', 'shared_template_publications', 'material_id', 'shared snapshot has no material reference');

select throws_ok($$
  insert into public.shared_template_publications (title, subject, level, objective, estimated_duration_minutes, source_kind, author_name)
  values ('Forged official', 'English', 'A1', 'Unsafe', 30, 'official', 'Tutor')
$$, '42501', null, 'normal tutor cannot create an official publication');
select throws_ok($$
  update public.shared_template_publications set source_kind = 'official' where id = '11000000-0000-4000-8000-000000000001'
$$, '42501', null, 'normal tutor cannot assign official status');

select lives_ok($$select public.save_shared_template_to_library('11000000-0000-4000-8000-000000000006')$$, 'writable tutor can save an approved template');
select is((select count(*)::integer from public.lesson_templates), 1, 'clone creates one private LessonTemplate');
select is((select count(*)::integer from public.lesson_template_sections), 4, 'clone copies reusable lesson structure');
select is((select source_attribution from public.lesson_templates limit 1), 'Oficjalny szablon Easy4Tutor', 'clone preserves optional source attribution');
select is((select count(*)::integer from public.lesson_template_materials), 0, 'clone never copies private material attachments');
select is(
  public.save_shared_template_to_library('11000000-0000-4000-8000-000000000006', '1b000000-0000-4000-8000-000000000001'),
  '1b000000-0000-4000-8000-000000000001'::uuid,
  'caller-provided copy id creates a deliberate independent copy'
);
select is(
  public.save_shared_template_to_library('11000000-0000-4000-8000-000000000006', '1b000000-0000-4000-8000-000000000001'),
  '1b000000-0000-4000-8000-000000000001'::uuid,
  'retry with the same copy id returns the existing copy'
);
select is((select count(*)::integer from public.lesson_templates), 2, 'retry does not create a duplicate private template');

reset role;
update public.shared_template_publications set title = 'Changed shared source' where id = '11000000-0000-4000-8000-000000000006';
insert into public.shared_template_publications (id, title, description, subject, level, objective, estimated_duration_minutes, source_kind, author_name, status)
values ('11000000-0000-4000-8000-000000000099', 'Draft template', '', 'Język angielski', 'A1', 'Draft', 30, 'community', 'Reviewer', 'draft');
update public.shared_template_publications set excluded_private_attachments = true where id = '11000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select title from public.lesson_templates limit 1), 'Present Perfect — doświadczenia', 'later shared edits do not mutate saved copies');
select is((select count(*)::integer from public.shared_template_publications), 12, 'draft publications remain hidden from tutors');
select throws_ok($$select public.save_shared_template_to_library('11000000-0000-4000-8000-000000000099')$$, 'P0002', null, 'draft publication cannot be cloned');
select ok((select excluded_private_attachments from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), 'safe preview exposes the attachment exclusion indicator');

set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.shared_template_publications), 12, 'another tutor can browse the same approved catalog');
select is((select count(*)::integer from public.lesson_templates), 0, 'private saved template is isolated from another workspace');

reset role;
update public.subscriptions set read_only = true where teacher_id = '1a000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.shared_template_publications), 12, 'read-only account can still browse the shared catalog');
select throws_ok($$select public.save_shared_template_to_library('11000000-0000-4000-8000-000000000001')$$, '42501', null, 'read-only account cannot clone a template');

reset role;
select * from finish();
rollback;
