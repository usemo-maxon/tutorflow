begin;
select plan(17);
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('10000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000000','authenticated','authenticated','profile-plans@example.test','','{}','{"full_name":"Plan Test"}',now(),now());
insert into public.tutor_public_profiles(tutor_id,workspace_id,enabled,slug,public_name,published_data,draft_data)
select '10000000-0000-0000-0000-000000000091',id,true,'plan-test','Plan Test',
'{"publicName":"Plan Test","theme":"modern","certificates":[{"id":"a","visible":true},{"id":"b","visible":true}],"video":{"source":"upload","storagePath":"10000000-0000-0000-0000-000000000091/video/10000000-0000-0000-0000-000000000092.mp4"}}',
'{"publicName":"Plan Test","theme":"modern"}'
from public.workspaces where owner_user_id='10000000-0000-0000-0000-000000000091';
insert into public.booking_event_types(id,workspace_id,tutor_id,name,duration_minutes,format,display_order)
select ('10000000-0000-0000-0000-00000000009'||n)::uuid,id,'10000000-0000-0000-0000-000000000091','Offer '||n,60,'online',n
from public.workspaces cross join generate_series(3,5) n where owner_user_id='10000000-0000-0000-0000-000000000091';
select is((select jsonb_array_length(event_types) from public.get_published_tutor_profile('plan-test')),3,'trial publishes all offers');
update public.subscriptions set status='active',tier='free',read_only=false where teacher_id='10000000-0000-0000-0000-000000000091';
set local role anon;
select is((select jsonb_array_length(event_types) from public.get_published_tutor_profile('plan-test')),2,'Free exposes only two offers');
select is((select jsonb_array_length(profile_data->'certificates') from public.get_published_tutor_profile('plan-test')),1,'Free exposes one certificate');
select is((select profile_data->>'theme' from public.get_published_tutor_profile('plan-test')),'professional','Free gets the default theme');
select ok((select not profile_data ? 'video' from public.get_published_tutor_profile('plan-test')),'Free hides hosted video');
select is((select count(*)::integer from public.get_public_tutor_availability('plan-test','10000000-0000-0000-0000-000000000095',current_date,current_date)),0,'over-limit offer cannot expose availability');
reset role;
select throws_ok($$insert into public.bookings(workspace_id,tutor_id,event_type_id,starts_at,ends_at,timezone,source)
select workspace_id,tutor_id,'10000000-0000-0000-0000-000000000095',now()+interval '2 days',now()+interval '2 days 1 hour','Europe/Warsaw','public_booking'
from public.tutor_public_profiles where slug='plan-test'$$,'22023','PUBLIC_BOOKING_OFFER_NOT_FOUND','booking insert cannot bypass over-limit offer eligibility');
select is((select jsonb_array_length(published_data->'certificates') from public.tutor_public_profiles where slug='plan-test'),2,'downgrade does not delete certificates');
select is((select count(*)::integer from public.booking_event_types where tutor_id='10000000-0000-0000-0000-000000000091'),3,'downgrade does not delete offers');
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000091","role":"authenticated"}';
select lives_ok($$update public.tutor_public_profiles set draft_data=draft_data||'{"headline":"Updated"}' where slug='plan-test'$$,'Free can edit ordinary fields while retaining old premium theme');
select throws_ok($$update public.tutor_public_profiles set draft_data=draft_data||'{"theme":"friendly"}' where slug='plan-test'$$,'42501','PLAN_REQUIRED:advancedProfilePersonalization','direct JSON cannot bypass theme guard');
select throws_ok($$update public.tutor_public_profiles set published_data=published_data||'{"certificates":[{"id":"a","visible":true},{"id":"new","visible":true}]}' where slug='plan-test'$$,'42501','PLAN_LIMIT_REACHED:published_certificates','direct JSON cannot enable a new excess certificate');
select lives_ok($$update public.tutor_public_profiles set published_data=published_data||'{"headline":"Updated"}' where slug='plan-test'$$,'grandfathered content remains editable');
select throws_ok($$insert into public.booking_event_types(workspace_id,tutor_id,name,duration_minutes,format) select workspace_id,tutor_id,'Extra',60,'online' from public.tutor_public_profiles where slug='plan-test'$$,'42501','PLAN_LIMIT_REACHED:published_offers','direct insert cannot exceed offer cap');
select lives_ok($$insert into public.booking_event_types(workspace_id,tutor_id,name,duration_minutes,format,is_public) select workspace_id,tutor_id,'Draft',60,'online',false from public.tutor_public_profiles where slug='plan-test'$$,'hidden offers can still be saved');
reset role;
set local request.jwt.claims='{}';
update public.subscriptions set tier='pro',status='active' where teacher_id='10000000-0000-0000-0000-000000000091';
select is((select jsonb_array_length(event_types) from public.get_published_tutor_profile('plan-test')),3,'upgrade restores all original offers');
select is((select profile_data->>'theme' from public.get_published_tutor_profile('plan-test')),'modern','upgrade restores original customization');
select * from finish();
rollback;
