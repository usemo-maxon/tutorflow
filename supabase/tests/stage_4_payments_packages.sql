begin;
select plan(67);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage4-a@example.test', '', '{}', '{"full_name":"Tutor Stage 4 A"}', now(), now()),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage4-b@example.test', '', '{}', '{"full_name":"Tutor Stage 4 B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, default_lesson_price_grosz, currency, default_format)
values
  ('52000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), 'Zosia', 'Zosia Stage 4', 'active', 60, 8000, 'PLN', 'online'),
  ('52000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), 'Hania', 'Hania Stage 4', 'active', 60, 9000, 'PLN', 'online');

insert into public.lessons (id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone, status, format, price_grosz, currency, billing_type, cancelled_at)
values
  ('53000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Lekcja historyczna', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'Europe/Warsaw', 'scheduled', 'online', 8000, 'PLN', 'per_lesson', null),
  ('53000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Odwołana', now() - interval '1 day', now() - interval '23 hours', 'Europe/Warsaw', 'cancelled', 'online', 8000, 'PLN', 'per_lesson', now()),
  ('53000000-0000-4000-8000-000000000003', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Z pakietu', now() - interval '1 day', now() - interval '23 hours', 'Europe/Warsaw', 'scheduled', 'online', 9000, 'PLN', 'package', null);

insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values
  ((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001'),
  ((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001'),
  ((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000002');
insert into public.attendances (workspace_id, lesson_id, student_id, status, marked_at)
select workspace_id, lesson_id, student_id, 'present'::public.attendance_status, now()
from public.lesson_participants where lesson_id in ('53000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000003');
insert into public.packages (id, workspace_id, student_id, name, total_lessons, price_grosz, currency, status, purchased_at)
values ('54000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000002', 'Pakiet źródłowy', 4, 32000, 'PLN', 'active', now() - interval '10 days');

select lives_ok($$select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000001', 'stage4:complete:lesson')$$, 'per-lesson completion succeeds');
select is((select count(*)::integer from public.charges where lesson_id = '53000000-0000-4000-8000-000000000001'), 1, 'completion creates exactly one charge');
select is((select amount_grosz::bigint from public.charges where lesson_id = '53000000-0000-4000-8000-000000000001'), 8000::bigint, 'charge uses lesson price snapshot');
select lives_ok($$select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000001', 'stage4:complete:retry')$$, 'completion retry succeeds');
select is((select count(*)::integer from public.charges where lesson_id = '53000000-0000-4000-8000-000000000001'), 1, 'completion retry does not duplicate charge');
update public.students set default_lesson_price_grosz = 10000 where id = '52000000-0000-4000-8000-000000000001';
select is((select amount_grosz::bigint from public.charges where lesson_id = '53000000-0000-4000-8000-000000000001'), 8000::bigint, 'student price change does not rewrite historical charge');
select is((select count(*)::integer from public.charges where lesson_id = '53000000-0000-4000-8000-000000000002'), 0, 'cancelled lesson has no automatic charge');

select lives_ok($$select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000003', 'stage4:complete:package')$$, 'package lesson completion succeeds');
select is((select count(*)::integer from public.package_usages where lesson_id = '53000000-0000-4000-8000-000000000003' and kind = 'consumption'), 1, 'package lesson consumes one ledger unit');
select is((select count(*)::integer from public.charges where lesson_id = '53000000-0000-4000-8000-000000000003'), 0, 'package lesson is not double billed');

insert into public.packages (id, workspace_id, student_id, name, total_lessons, price_grosz, currency, status, purchased_at, expires_at)
values
  ('54000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000002', 'Wygasły', 1, 9000, 'PLN', 'active', now() - interval '20 days', now() - interval '1 day'),
  ('54000000-0000-4000-8000-000000000003', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000002', 'Późniejszy', 1, 9000, 'PLN', 'active', now(), now() + interval '30 days'),
  ('54000000-0000-4000-8000-000000000004', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000002', 'Najwcześniej wygasa', 1, 9000, 'PLN', 'active', now(), now() + interval '5 days');
insert into public.lessons (id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone, status, format, price_grosz, currency, billing_type)
values ('53000000-0000-4000-8000-000000000004', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Wybór pakietu', now() - interval '2 hours', now() - interval '1 hour', 'Europe/Warsaw', 'scheduled', 'online', 9000, 'PLN', 'package');
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values ((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000002');
insert into public.attendances (workspace_id, lesson_id, student_id, status, marked_at)
values ((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000002', 'present', now());
select lives_ok($$select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000004', 'stage4:complete:earliest-expiry')$$, 'completion with multiple packages succeeds');
select is((select package_id from public.package_usages where lesson_id = '53000000-0000-4000-8000-000000000004'), '54000000-0000-4000-8000-000000000004'::uuid, 'earliest eligible expiry is selected deterministically');
select is((select count(*)::integer from public.package_usages where lesson_id = '53000000-0000-4000-8000-000000000004' and package_id = '54000000-0000-4000-8000-000000000002'), 0, 'expired package is never consumed');

select lives_ok($$select public.create_student_package((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'Pakiet 5 zajęć', 5, 5000, 'PLN', now(), now() + interval '90 days', 'stage4:package:create')$$, 'package purchase is created transactionally');
select is((select count(*)::integer from public.charges where package_id = (select id from public.packages where idempotency_key = 'stage4:package:create')), 1, 'paid package price has one receivable');
select lives_ok($$select public.create_student_package((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'Pakiet 5 zajęć', 5, 5000, 'PLN', (select purchased_at from public.packages where idempotency_key = 'stage4:package:create'), (select expires_at from public.packages where idempotency_key = 'stage4:package:create'), 'stage4:package:create')$$, 'same package payload replay returns the original result');
select throws_ok($$select public.create_student_package((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'Inna treść', 5, 5000, 'PLN', (select purchased_at from public.packages where idempotency_key = 'stage4:package:create'), (select expires_at from public.packages where idempotency_key = 'stage4:package:create'), 'stage4:package:create')$$, '23514', null, 'conflicting package idempotency replay is rejected');
select lives_ok($$select public.create_student_package((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'Pakiet bezpłatny', 2, 0, 'PLN', now(), null, 'stage4:package:free')$$, 'zero-price package is created');
select is((select count(*)::integer from public.charges where package_id = (select id from public.packages where idempotency_key = 'stage4:package:free')), 0, 'zero-price package creates no zero-value charge');
select throws_ok($$select public.create_student_package((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'Złe daty', 2, 0, 'PLN', now(), now() - interval '1 day', 'stage4:package:dates')$$, '23514', null, 'package expiry cannot precede purchase');

select lives_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 2000, 'PLN', now(), 'bank_transfer', 'Część', jsonb_build_array(jsonb_build_object('chargeId', (select id from public.charges where package_id = (select id from public.packages where idempotency_key = 'stage4:package:create')), 'amountGrosz', 2000)), 'stage4:payment:partial')$$, 'partial payment and allocation succeed');
select is((select outstanding_grosz::bigint from public.charge_balances where package_id = (select id from public.packages where idempotency_key = 'stage4:package:create')), 3000::bigint, 'partial payment leaves exact balance');
select is((select status::text from public.charges where package_id = (select id from public.packages where idempotency_key = 'stage4:package:create')), 'partial', 'partial charge status is explicit');

select lives_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 10000, 'PLN', now(), 'cash', 'Nadpłata', jsonb_build_array(jsonb_build_object('chargeId', (select id from public.charges where package_id = (select id from public.packages where idempotency_key = 'stage4:package:create')), 'amountGrosz', 3000)), 'stage4:payment:overpay')$$, 'overpayment preserves unallocated amount');
select is((select outstanding_grosz::bigint from public.charge_balances where package_id = (select id from public.packages where idempotency_key = 'stage4:package:create')), 0::bigint, 'second payment settles charge');
select is((select unallocated_grosz::bigint from public.payment_balances where payment_id = (select id from public.payments where idempotency_key = 'stage4:payment:overpay')), 7000::bigint, 'excess payment remains unallocated');
select lives_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 10000, 'PLN', (select paid_at from public.payments where idempotency_key = 'stage4:payment:overpay'), 'cash', 'Nadpłata', jsonb_build_array(jsonb_build_object('chargeId', (select id from public.charges where package_id = (select id from public.packages where idempotency_key = 'stage4:package:create')), 'amountGrosz', 3000)), 'stage4:payment:overpay')$$, 'payment retry is idempotent');
select is((select count(*)::integer from public.payments where idempotency_key = 'stage4:payment:overpay'), 1, 'payment retry does not duplicate money receipt');
select throws_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 9999, 'PLN', (select paid_at from public.payments where idempotency_key = 'stage4:payment:overpay'), 'cash', 'Nadpłata', '[]'::jsonb, 'stage4:payment:overpay')$$, '23514', null, 'conflicting payment idempotency replay is rejected');

select throws_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 100, 'EUR', now(), 'cash', '', jsonb_build_array(jsonb_build_object('chargeId', (select id from public.charges where lesson_id = '53000000-0000-4000-8000-000000000001'), 'amountGrosz', 100)), 'stage4:payment:currency')$$, '23514', null, 'currency mismatch is rejected');
select is((select count(*)::integer from public.payments where idempotency_key = 'stage4:payment:currency'), 0, 'currency mismatch rolls back payment creation');
select throws_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 1, 'PLN', now(), 'cash', '', jsonb_build_array(jsonb_build_object('chargeId', (select id from public.charges where package_id = (select id from public.packages where idempotency_key = 'stage4:package:create')), 'amountGrosz', 1)), 'stage4:payment:oversettle')$$, '23514', null, 'settled charge cannot be over-allocated');

insert into public.charges (id, workspace_id, student_id, type, description, amount_grosz, currency, due_at)
values
  ('55000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'manual', 'Wiele A', 1000, 'PLN', now() + interval '1 day'),
  ('55000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'manual', 'Wiele B', 1000, 'PLN', now() + interval '2 days');
select lives_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 1500, 'PLN', now(), 'bank_transfer', 'Wiele należności', jsonb_build_array(jsonb_build_object('chargeId', '55000000-0000-4000-8000-000000000001', 'amountGrosz', 1000), jsonb_build_object('chargeId', '55000000-0000-4000-8000-000000000002', 'amountGrosz', 500)), 'stage4:payment:multiple')$$, 'one payment can settle multiple charges transactionally');
select is((select count(*)::integer from public.payment_allocations where payment_id = (select id from public.payments where idempotency_key = 'stage4:payment:multiple')), 2, 'multiple allocations are preserved');
select is((select outstanding_grosz::bigint from public.charge_balances where charge_id = '55000000-0000-4000-8000-000000000001'), 0::bigint, 'first charge is fully settled');
select is((select outstanding_grosz::bigint from public.charge_balances where charge_id = '55000000-0000-4000-8000-000000000002'), 500::bigint, 'second charge remains partially open');
select throws_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 100, 'PLN', now(), 'cash', '', jsonb_build_array(jsonb_build_object('chargeId', '55000000-0000-4000-8000-000000000002', 'amountGrosz', 101)), 'stage4:payment:overallocate')$$, '23514', null, 'allocation cannot exceed payment remaining amount');
select is((select count(*)::integer from public.payments where idempotency_key = 'stage4:payment:overallocate'), 0, 'over-allocation rolls back payment creation');

insert into public.charges (id, workspace_id, student_id, type, description, amount_grosz, currency, due_at)
values ('55000000-0000-4000-8000-000000000003', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'manual', 'Bez terminu', 1000, 'PLN', null);
select is((select is_overdue from public.charge_balances where description = 'Bez terminu'), false, 'no due date is unpaid but not overdue');
insert into public.charges (id, workspace_id, student_id, type, description, amount_grosz, currency, due_at)
values
  ('55000000-0000-4000-8000-000000000004', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'manual', 'Po terminie', 1000, 'PLN', now() - interval '1 second'),
  ('55000000-0000-4000-8000-000000000005', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'manual', 'Dzisiaj', 1000, 'PLN', date_trunc('day', now()) + interval '23 hours 59 minutes');
select is((select is_overdue from public.charge_balances where description = 'Po terminie'), true, 'positive outstanding amount after due date is overdue');
select is((select is_overdue from public.charge_balances where description = 'Dzisiaj'), false, 'charge due later today is unpaid but not overdue');
select lives_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 400, 'PLN', now(), 'cash', '', jsonb_build_array(jsonb_build_object('chargeId', '55000000-0000-4000-8000-000000000004', 'amountGrosz', 400)), 'stage4:payment:overdue-partial')$$, 'overdue charge accepts a partial payment');
select is((select outstanding_grosz::bigint from public.charge_balances where charge_id = '55000000-0000-4000-8000-000000000004'), 600::bigint, 'partially paid overdue charge keeps exact balance');
select is((select is_overdue from public.charge_balances where charge_id = '55000000-0000-4000-8000-000000000004'), true, 'partially paid overdue charge remains overdue');
select lives_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 600, 'PLN', now(), 'cash', '', jsonb_build_array(jsonb_build_object('chargeId', '55000000-0000-4000-8000-000000000004', 'amountGrosz', 600)), 'stage4:payment:overdue-settle')$$, 'remaining overdue balance can be settled');
select is((select outstanding_grosz::bigint from public.charge_balances where charge_id = '55000000-0000-4000-8000-000000000004'), 0::bigint, 'settled overdue charge has zero balance');
select is((select is_overdue from public.charge_balances where charge_id = '55000000-0000-4000-8000-000000000004'), false, 'settled overdue charge leaves overdue state');

insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values
  ('52000000-0000-4000-8000-000000000003', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), 'Ola', 'Ola Stage 4', 'active', 60, 'PLN', 'online'),
  ('52000000-0000-4000-8000-000000000004', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), 'Iga', 'Iga Stage 4', 'active', 60, 'PLN', 'online');

insert into public.packages (id, workspace_id, student_id, name, total_lessons, price_grosz, currency, status, purchased_at, expires_at)
values ('54000000-0000-4000-8000-000000000005', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000003', 'Tylko wygasły', 1, 0, 'PLN', 'active', now() - interval '2 days', now() - interval '1 day');
insert into public.lessons (id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone, status, format, price_grosz, currency, billing_type)
values ('53000000-0000-4000-8000-000000000005', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000003', 'Bez pakietu', now(), now() + interval '1 hour', 'Europe/Warsaw', 'scheduled', 'online', 0, 'PLN', 'package');
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values ((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000003');
insert into public.attendances (workspace_id, lesson_id, student_id, status, marked_at)
values ((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000003', 'present', now());
select throws_ok($$select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000005', 'stage4:package:missing')$$, '23514', null, 'package lesson without an eligible package is rejected');
select is((select status::text from public.lessons where id = '53000000-0000-4000-8000-000000000005'), 'scheduled', 'failed package completion leaves lesson uncompleted');
select is((select count(*)::integer from public.package_usages where lesson_id = '53000000-0000-4000-8000-000000000005'), 0, 'failed package completion leaves no usage');
select throws_ok($$select public.complete_lesson_with_package((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000003', '54000000-0000-4000-8000-000000000005', 'stage4:expired:direct')$$, '23514', null, 'direct RPC cannot consume an expired package');

insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values ('56000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), 'Grupa finanse', 'active', 60, 'PLN');
insert into public.lessons (id, workspace_id, tutor_id, group_id, title, starts_at, ends_at, timezone, status, format, price_grosz, currency, billing_type)
values
  ('53000000-0000-4000-8000-000000000006', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '51000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Pakiet grupowy', now(), now() + interval '1 hour', 'Europe/Warsaw', 'scheduled', 'online', 0, 'PLN', 'package'),
  ('53000000-0000-4000-8000-000000000007', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '51000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Za uczestnika', now() + interval '2 hours', now() + interval '3 hours', 'Europe/Warsaw', 'scheduled', 'online', 2500, 'PLN', 'per_student');
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
select (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), lesson_id, student_id
from (values
  ('53000000-0000-4000-8000-000000000006'::uuid, '52000000-0000-4000-8000-000000000001'::uuid),
  ('53000000-0000-4000-8000-000000000006'::uuid, '52000000-0000-4000-8000-000000000002'::uuid),
  ('53000000-0000-4000-8000-000000000007'::uuid, '52000000-0000-4000-8000-000000000001'::uuid),
  ('53000000-0000-4000-8000-000000000007'::uuid, '52000000-0000-4000-8000-000000000002'::uuid)
) fixture(lesson_id, student_id);
insert into public.attendances (workspace_id, lesson_id, student_id, status, marked_at)
select workspace_id, lesson_id, student_id, 'present'::public.attendance_status, now()
from public.lesson_participants where lesson_id in ('53000000-0000-4000-8000-000000000006','53000000-0000-4000-8000-000000000007');
select throws_ok($$select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000006', 'stage4:package:group')$$, '23514', null, 'group package lesson is explicitly unsupported');
select is((select status::text from public.lessons where id = '53000000-0000-4000-8000-000000000006'), 'scheduled', 'unsupported group package lesson remains uncompleted');

insert into public.packages (id, workspace_id, student_id, name, total_lessons, price_grosz, currency, status, purchased_at)
values ('54000000-0000-4000-8000-000000000006', (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000003', 'Ostatnia jednostka', 1, 0, 'PLN', 'active', now());
select lives_ok($$select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000005', 'stage4:package:final-unit')$$, 'final package unit is consumed');
select is((select status::text from public.packages where id = '54000000-0000-4000-8000-000000000006'), 'exhausted', 'package status becomes exhausted at zero remaining units');
select is((select remaining_lessons::integer from public.package_balances where package_id = '54000000-0000-4000-8000-000000000006'), 0, 'package balance never becomes negative');
select lives_ok($$select public.complete_lesson_workspace((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '53000000-0000-4000-8000-000000000007', 'stage4:per-student:group')$$, 'per-student group lesson completes');
select is((select count(*)::integer from public.charges where lesson_id = '53000000-0000-4000-8000-000000000007'), 2, 'per-student billing charges historical participants once each');

update public.students set status = 'archived', archived_at = now() where id = '52000000-0000-4000-8000-000000000001';
select lives_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 100, 'PLN', now(), 'cash', 'Spłata po archiwizacji', '[]'::jsonb, 'stage4:archived:payment')$$, 'archived student can settle historical finances');
select throws_ok($$select public.create_student_package((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 'Nowy po archiwizacji', 2, 0, 'PLN', now(), null, 'stage4:archived:package')$$, '23514', null, 'archived student cannot receive a new package');

insert into public.charges (workspace_id, student_id, type, description, amount_grosz, currency)
select (select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000004', 'manual', 'Limit ' || series, 1, 'PLN'
from generate_series(1, 101) series;
select is((select outstanding_grosz from public.finance_summary((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), 'PLN', date_trunc('month', now()), '52000000-0000-4000-8000-000000000004')), 101::bigint, 'summary aggregates beyond the 100-row UI list limit');

set local request.jwt.claims = '{"sub":"51000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.charges), 0, 'other workspace cannot read charges');
select is((select count(*)::integer from public.payments), 0, 'other workspace cannot read payments');
select is((select count(*)::integer from public.packages), 0, 'other workspace cannot read packages');
select is((select count(*)::integer from public.package_usages), 0, 'other workspace cannot read package usage');
select is((select count(*)::integer from public.payment_allocations), 0, 'other workspace cannot read allocations');
select throws_ok($$select public.record_student_payment((select workspace_id from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'), '52000000-0000-4000-8000-000000000001', 100, 'PLN', now(), 'cash', '', '[]'::jsonb, 'stage4:cross:workspace')$$, '42501', null, 'other workspace cannot record payment');

select * from finish();
rollback;
