begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'privacy-a@example.test', '', '{}', '{"full_name":"Privacy A"}', now(), now()),
  ('10000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'privacy-b@example.test', '', '{}', '{"full_name":"Privacy B"}', now(), now());

insert into public.tutor_public_profiles(tutor_id, workspace_id, enabled, slug, public_name, published_data, draft_data)
select '10000000-0000-0000-0000-000000000081', id, true, 'privacy-test', 'Privacy A',
  '{"publicName":"Privacy A","headline":"Public headline","subjects":["Math"],"internalSecret":"PRIVATE",
    "certificates":[
      {"id":"hidden","title":"PRIVATE CERTIFICATE","visible":false,"storagePath":"10000000-0000-0000-0000-000000000081/certificate/10000000-0000-0000-0000-000000000083.pdf"},
      {"id":"own","title":"Public certificate","visible":true,"storagePath":"10000000-0000-0000-0000-000000000081/certificate/10000000-0000-0000-0000-000000000084.pdf","fileUrl":"https://untrusted.test/file","privateNote":"PRIVATE"},
      {"id":"foreign","visible":true,"storagePath":"10000000-0000-0000-0000-000000000082/certificate/10000000-0000-0000-0000-000000000085.pdf"}],
    "video":{"source":"upload","storagePath":"10000000-0000-0000-0000-000000000082/video/10000000-0000-0000-0000-000000000086.mp4"},
    "faq":[{"id":"private-faq","question":"PRIVATE QUESTION","answer":"PRIVATE ANSWER","visible":false},{"id":"public-faq","question":"Public?","answer":"Yes","visible":true}],
    "sections":[]}'::jsonb,
  '{"publicName":"PRIVATE DRAFT"}'::jsonb
from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000081';

set local role anon;
select is((select profile_data->>'publicName' from public.get_published_tutor_profile('privacy-test')), 'Privacy A', 'anonymous caller sees published identity');
select ok((select profile_data::text not like '%PRIVATE%' from public.get_published_tutor_profile('privacy-test')), 'private draft, hidden records and unknown properties never enter anonymous JSON');
select is((select jsonb_array_length(profile_data->'certificates') from public.get_published_tutor_profile('privacy-test')), 2, 'hidden certificate is removed before client serialization');
select is((select profile_data#>>'{certificates,0,storagePath}' from public.get_published_tutor_profile('privacy-test')), '10000000-0000-0000-0000-000000000081/certificate/10000000-0000-0000-0000-000000000084.pdf', 'owner media path is retained for server signing');
select ok((select not (profile_data#>'{certificates,1}') ? 'storagePath' from public.get_published_tutor_profile('privacy-test')), 'foreign certificate cannot reach privileged signer');
select ok((select not profile_data ? 'video' from public.get_published_tutor_profile('privacy-test')), 'foreign video cannot reach privileged signer');
select ok((select not (profile_data#>'{certificates,0}') ? 'fileUrl' from public.get_published_tutor_profile('privacy-test')), 'client-provided signed URL is never forwarded');
select is((select jsonb_array_length(profile_data->'faq') from public.get_published_tutor_profile('privacy-test')), 1, 'private FAQ does not reach the client');
reset role;

select is((select jsonb_array_length(published_data->'certificates') from public.tutor_public_profiles where slug='privacy-test'), 3, 'redaction retains original tutor data');
update public.tutor_public_profiles set published_data = published_data || '{"sections":[{"id":"certificates","visible":false},{"id":"faq","visible":false}],"video":{"source":"youtube","videoId":"dQw4w9WgXcQ","posterPath":"10000000-0000-0000-0000-000000000082/poster/10000000-0000-0000-0000-000000000087.jpg"}}'::jsonb where slug='privacy-test';
set local role anon;
select ok((select not profile_data ? 'certificates' and not profile_data ? 'faq' from public.get_published_tutor_profile('privacy-test')), 'hidden sections remove their contents entirely');
select is((select profile_data#>>'{video,videoId}' from public.get_published_tutor_profile('privacy-test')), 'dQw4w9WgXcQ', 'safe external video survives redaction');
select ok((select not (profile_data->'video') ? 'posterPath' from public.get_published_tutor_profile('privacy-test')), 'foreign poster is removed');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000082","role":"authenticated"}';
select is((select count(*)::integer from public.tutor_public_profiles where slug='privacy-test'), 0, 'another tutor cannot read the private snapshots');
reset role;
update public.subscriptions set read_only=true, status='past_due' where teacher_id='10000000-0000-0000-0000-000000000081';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000081","role":"authenticated"}';
with changed as (update public.tutor_public_profiles set draft_data='{}' where slug='privacy-test' returning tutor_id)
select is(count(*)::integer, 0, 'direct database update obeys read-only lifecycle') from changed;
select is((select count(*)::integer from public.tutor_public_profiles where slug='privacy-test'), 1, 'read-only owner can still read and retain data');
reset role;
update public.tutor_public_profiles set enabled=false where slug='privacy-test';
set local role anon;
select is((select count(*)::integer from public.get_published_tutor_profile('privacy-test')), 0, 'unpublishing removes anonymous access');
reset role;
select * from finish();
rollback;
