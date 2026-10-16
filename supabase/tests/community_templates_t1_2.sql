begin;
select plan(35);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('2a000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'community-author@example.test', '', '{}', '{"full_name":"Community Author"}', now(), now()),
  ('2a000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'community-other@example.test', '', '{}', '{"full_name":"Community Other"}', now(), now()),
  ('2a000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'workspace-admin@example.test', '', '{}', '{"full_name":"Workspace Admin"}', now(), now()),
  ('2a000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform-admin@example.test', '', '{}', '{"full_name":"Platform Admin"}', now(), now());

insert into public.platform_admins (user_id)
values ('2a000000-0000-4000-8000-000000000004');

insert into public.workspace_members (workspace_id, user_id, role, status)
select profile.workspace_id, '2a000000-0000-4000-8000-000000000003', 'admin', 'active'
from public.tutor_profiles profile
where profile.user_id = '2a000000-0000-4000-8000-000000000001'
on conflict (workspace_id, user_id) do update set role = 'admin', status = 'active';

set local role authenticated;
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.lesson_templates (
  id, workspace_id, owner_user_id, title, description, subject, level,
  objective, teacher_notes, estimated_duration_minutes
)
select '2b000000-0000-4000-8000-000000000001', workspace_id,
  '2a000000-0000-4000-8000-000000000001', 'Private original',
  'Private description', 'English', 'B1', 'Private objective',
  'Never publish this note', 60
from public.tutor_profiles where user_id = '2a000000-0000-4000-8000-000000000001';

insert into public.lesson_template_sections (workspace_id, template_id, title, content, estimated_minutes, position)
select workspace_id, '2b000000-0000-4000-8000-000000000001', 'Warm-up', 'Reusable questions', 10, 0
from public.tutor_profiles where user_id = '2a000000-0000-4000-8000-000000000001';

insert into public.materials (id, workspace_id, owner_user_id, title, type, storage_path, original_filename, mime_type, file_size_bytes, file_url)
select '2c000000-0000-4000-8000-000000000001', workspace_id,
  '2a000000-0000-4000-8000-000000000001', 'Private PDF', 'file',
  workspace_id::text || '/private.pdf', 'private.pdf', 'application/pdf', 128,
  'https://example.test/private.pdf'
from public.tutor_profiles where user_id = '2a000000-0000-4000-8000-000000000001';
insert into public.lesson_template_materials (workspace_id, template_id, material_id)
select workspace_id, '2b000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000001'
from public.tutor_profiles where user_id = '2a000000-0000-4000-8000-000000000001';

select lives_ok($$
  select public.submit_community_template(
    '2b000000-0000-4000-8000-000000000001',
    '{"title":"Public snapshot","description":"Safe description","subject":"English","level":"B1","objective":"Reusable objective","estimatedDurationMinutes":60,"authorName":"Tutor Pseudonym","sections":[{"title":"Warm-up","content":"Reusable questions","estimatedMinutes":10}]}'::jsonb,
    true,
    'T1.2-LEGAL-REVIEW-REQUIRED'
  )
$$, 'owner can submit own private template');

select is((select count(*)::integer from public.community_template_submissions), 1, 'author sees their submission metadata');
select is((select status from public.shared_template_publications where title = 'Public snapshot'), 'pending_review', 'new submission awaits review');
select is((select source_kind from public.shared_template_publications where title = 'Public snapshot'), 'community', 'submission cannot forge official source');
select ok((select excluded_private_attachments from public.shared_template_publications where title = 'Public snapshot'), 'snapshot records that private attachments were excluded');
select is((select count(*)::integer from public.shared_template_sections where title = 'Warm-up'), 1, 'snapshot contains reusable sections only');
select hasnt_column('public', 'shared_template_publications', 'workspace_id', 'public snapshot has no workspace identifier');
select hasnt_column('public', 'shared_template_publications', 'teacher_notes', 'public snapshot has no private tutor notes');
select hasnt_column('public', 'shared_template_publications', 'material_id', 'public snapshot has no private material reference');
select throws_ok($$
  select public.submit_community_template(
    '2b000000-0000-4000-8000-000000000001',
    '{"title":"Unsafe","description":"","subject":"English","level":"B1","objective":"file:///private.pdf","estimatedDurationMinutes":60,"authorName":"Tutor","sections":[{"title":"One","content":"Safe"}]}'::jsonb,
    true,
    'T1.2-LEGAL-REVIEW-REQUIRED'
  )
$$, '22023', null, 'private file references are rejected by the database');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.shared_template_publications where title = 'Public snapshot'), 0, 'pending submission is invisible to other tutors');
select is((select count(*)::integer from public.lesson_templates where id = '2b000000-0000-4000-8000-000000000001'), 0, 'private source remains isolated from another workspace');
select throws_ok($$
  select public.submit_community_template(
    '2b000000-0000-4000-8000-000000000001',
    '{"title":"Stolen","description":"","subject":"English","level":"B1","objective":"No","estimatedDurationMinutes":60,"authorName":"Other","sections":[{"title":"One","content":"No"}]}'::jsonb,
    true,
    'T1.2-LEGAL-REVIEW-REQUIRED'
  )
$$, '42501', null, 'submitting another workspace template is forbidden');
select throws_ok($$
  select public.moderate_community_template(
    (select id from public.shared_template_publications where title = 'Public snapshot'),
    'approve', null
  )
$$, '42501', null, 'unauthorized approval is rejected');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$
  select public.moderate_community_template(
    (select id from public.shared_template_publications where title = 'Public snapshot'),
    'approve', null
  )
$$, '42501', null, 'workspace owner is not automatically a platform administrator');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000004","role":"authenticated"}';
select ok(public.current_user_is_platform_admin(), 'server-controlled platform role identifies administrator');
select is((select count(*)::integer from public.shared_template_publications where title = 'Public snapshot'), 1, 'administrator can preview pending snapshot');
select lives_ok($$
  select public.moderate_community_template(
    (select id from public.shared_template_publications where title = 'Public snapshot'),
    'approve', null
  )
$$, 'platform administrator can approve submission');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.shared_template_publications where title = 'Public snapshot' and status = 'approved'), 1, 'approved community snapshot appears in shared catalog');
select lives_ok($$
  select public.save_shared_template_to_library(
    (select id from public.shared_template_publications where title = 'Public snapshot')
  )
$$, 'another tutor saves an independent copy');
select is((select source_attribution from public.lesson_templates where title = 'Public snapshot'), 'Autor: Tutor Pseudonym', 'saved copy preserves safe attribution');
select is((select count(*)::integer from public.lesson_template_materials where template_id = (select id from public.lesson_templates where title = 'Public snapshot')), 0, 'saved copy contains no private attachments');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.lesson_templates set title = 'Private edited later', objective = 'Changed private objective'
where id = '2b000000-0000-4000-8000-000000000001';
select is((select title from public.shared_template_publications where title = 'Public snapshot'), 'Public snapshot', 'approved snapshot is independent of later private edits');
select lives_ok($$
  select public.submit_community_template(
    '2b000000-0000-4000-8000-000000000001',
    '{"title":"Corrected snapshot","description":"Second review","subject":"English","level":"B1","objective":"Corrected objective","estimatedDurationMinutes":60,"authorName":"Tutor Pseudonym","sections":[{"title":"Warm-up","content":"Corrected questions","estimatedMinutes":10}]}'::jsonb,
    true,
    'T1.2-LEGAL-REVIEW-REQUIRED'
  )
$$, 'author can resubmit a new independent snapshot');
select is(
  (select count(distinct publication_id)::integer from public.community_template_submissions),
  2,
  'resubmission does not overwrite the earlier publication'
);

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok($$
  select public.moderate_community_template(
    (select id from public.shared_template_publications where title = 'Corrected snapshot'),
    'reject', 'Usuń fragment wymagający licencji.'
  )
$$, 'administrator can reject with feedback');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select status from public.shared_template_publications where title = 'Corrected snapshot'), 'rejected', 'author sees rejected status');
select is((select moderation_feedback from public.community_template_submissions where publication_id = (select id from public.shared_template_publications where title = 'Corrected snapshot')), 'Usuń fragment wymagający licencji.', 'author sees rejection explanation');
select lives_ok($$
  select public.withdraw_community_template(
    (select id from public.shared_template_publications where title = 'Public snapshot')
  )
$$, 'author can withdraw own approved publication');
select is((select status from public.shared_template_publications where title = 'Public snapshot'), 'withdrawn', 'withdrawal preserves publication history');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.shared_template_publications where title in ('Public snapshot', 'Corrected snapshot')), 0, 'withdrawn and rejected snapshots are absent from shared catalog');
select is((select count(*)::integer from public.lesson_templates where title = 'Public snapshot'), 1, 'saved private copy survives source withdrawal');
select throws_ok($$
  select public.save_shared_template_to_library(
    (select publication_id from public.community_template_submissions limit 1)
  )
$$, 'P0002', null, 'withdrawn publication prevents new copies');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok($$
  select public.submit_community_template(
    '2b000000-0000-4000-8000-000000000001',
    '{"title":"Workspace admin snapshot","description":"Authorized","subject":"English","level":"B1","objective":"Authorized objective","estimatedDurationMinutes":60,"authorName":"Workspace Team","sections":[{"title":"One","content":"Reusable"}]}'::jsonb,
    true,
    'T1.2-LEGAL-REVIEW-REQUIRED'
  )
$$, 'appropriately authorized workspace administrator may submit');

select throws_ok($$
  update public.shared_template_publications
  set source_kind = 'official'
  where title = 'Workspace admin snapshot'
$$, '42501', null, 'official status cannot be forged');

reset role;
select * from finish();
rollback;
