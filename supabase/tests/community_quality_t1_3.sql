begin;
select plan(42);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('3a000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quality-one@example.test', '', '{}', '{}', now(), now()),
  ('3a000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quality-two@example.test', '', '{}', '{}', now(), now()),
  ('3a000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quality-admin@example.test', '', '{}', '{}', now(), now());

insert into public.platform_admins (user_id) values ('3a000000-0000-4000-8000-000000000003');
update public.shared_template_publications set published_at = '2026-10-01T10:00:00Z' where id = '11000000-0000-4000-8000-000000000001';
update public.shared_template_publications set published_at = '2099-10-12T10:00:00Z' where id = '11000000-0000-4000-8000-000000000012';

set local role authenticated;
set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(public.set_shared_template_favorite('11000000-0000-4000-8000-000000000001', true), true, 'tutor can add a favorite');
select is((select count(*)::integer from public.lesson_templates where owner_user_id = '3a000000-0000-4000-8000-000000000001'), 0, 'favoriting does not create a private LessonTemplate');
select lives_ok($$select public.set_shared_template_favorite('11000000-0000-4000-8000-000000000001', true)$$, 'adding the same favorite is idempotent');
select is(public.set_shared_template_favorite('11000000-0000-4000-8000-000000000001', false), false, 'tutor can remove a favorite');
select is((select count(*)::integer from public.shared_template_favorites), 0, 'removed favorite is absent');
select throws_ok($$select public.set_shared_template_featured('11000000-0000-4000-8000-000000000001', true, 1)$$, '42501', null, 'normal tutor cannot curate recommendations');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok($$select public.set_shared_template_featured('11000000-0000-4000-8000-000000000001', true, 1)$$, 'platform administrator can recommend an approved template');
select ok((select is_featured from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), 'curated flag is stored');
select is((select featured_order from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), 1, 'curated order is stored');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000001', 'invalid', null)$$, '22023', null, 'report reason is validated');
select lives_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000001', 'copyright', 'Podejrzenie kopiowania')$$, 'tutor can report an approved template');
select is((select count(*)::integer from public.shared_template_reports), 0, 'reporter cannot read report records or reporter identities');
select throws_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000001', 'copyright', null)$$, 'P0001', null, 'duplicate open report is blocked');
select throws_ok($$select public.resolve_shared_template_report((select id from public.shared_template_reports limit 1), 'dismiss', 'Nieuprawniona próba')$$, '42501', null, 'normal tutor cannot moderate reports');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000002', 'other', null)$$, 'first report within limit succeeds');
select lives_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000003', 'other', null)$$, 'second report within limit succeeds');
select lives_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000004', 'other', null)$$, 'third report within limit succeeds');
select lives_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000005', 'other', null)$$, 'fourth report within limit succeeds');
select lives_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000006', 'other', null)$$, 'fifth report within limit succeeds');
select throws_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000007', 'other', null)$$, 'P0001', null, 'hourly report rate limit blocks spam');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::integer from public.shared_template_reports where status = 'open'), 6, 'administrator can review open reports');
select lives_ok($$select public.resolve_shared_template_report((select id from public.shared_template_reports where publication_id = '11000000-0000-4000-8000-000000000001'), 'dismiss', 'Brak naruszenia')$$, 'administrator can dismiss a report');
select is((select status from public.shared_template_reports where publication_id = '11000000-0000-4000-8000-000000000001'), 'dismissed', 'dismissal records report resolution');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.save_shared_template_to_library('11000000-0000-4000-8000-000000000001')$$, 'successful adoption creates private copy');
select is((select adoption_count from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), 1, 'first successful adopter increments popularity');
select lives_ok($$select public.save_shared_template_to_library('11000000-0000-4000-8000-000000000001')$$, 'same tutor may create another independent copy');
select is((select adoption_count from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), 1, 'duplicate adoption does not inflate popularity');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$select public.save_shared_template_to_library('11000000-0000-4000-8000-000000000001')$$, 'distinct tutor adoption succeeds');
select is((select adoption_count from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), 2, 'distinct tutor increments popularity');
select is((select id from public.shared_template_publications where status = 'approved' order by adoption_count desc, published_at desc limit 1), '11000000-0000-4000-8000-000000000001'::uuid, 'popular sorting uses genuine distinct adoption count');
select is((select id from public.shared_template_publications where status = 'approved' order by published_at desc limit 1), '11000000-0000-4000-8000-000000000012'::uuid, 'newest sorting uses approval publication time');
select lives_ok($$select public.set_shared_template_favorite('11000000-0000-4000-8000-000000000001', true)$$, 'tutor can favorite before later withdrawal');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.report_shared_template('11000000-0000-4000-8000-000000000001', 'personal_data', 'Widoczne dane osobowe')$$, 'resolved reporter may submit a new report after prior moderation');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok($$select public.resolve_shared_template_report((select id from public.shared_template_reports where publication_id = '11000000-0000-4000-8000-000000000001' and status = 'open'), 'withdraw', 'Potwierdzone dane osobowe')$$, 'administrator can withdraw an offending publication');
select is((select status from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), 'withdrawn', 'withdrawal changes publication lifecycle');
select isnt((select is_featured from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), true, 'withdrawal automatically removes recommendation');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.shared_template_publications where id = '11000000-0000-4000-8000-000000000001'), 0, 'withdrawn publication disappears from catalog and search');
select is((select count(*)::integer from public.shared_template_favorites where publication_id = '11000000-0000-4000-8000-000000000001'), 0, 'withdrawn publication is unavailable through favorites');
select throws_ok($$select public.save_shared_template_to_library('11000000-0000-4000-8000-000000000001')$$, 'P0002', null, 'withdrawn publication cannot be adopted again');
select is((select count(*)::integer from public.lesson_templates where source_publication_id = '11000000-0000-4000-8000-000000000001'), 2, 'current tutor private copies survive source withdrawal');

set local request.jwt.claims = '{"sub":"3a000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.lesson_templates where source_publication_id = '11000000-0000-4000-8000-000000000001'), 1, 'other workspace private copy remains isolated and preserved');
select throws_ok($$select * from public.shared_template_adoptions$$, '42501', null, 'adoption identities are not exposed to tutors');

reset role;
select * from finish();
rollback;
