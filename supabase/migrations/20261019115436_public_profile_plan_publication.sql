-- Generated registry snapshot from src/lib/entitlements.ts PROFILE_PLAN_ENTITLEMENTS.
-- A parity test prevents drifting values. Subscription identifiers/prices are unchanged.
create function private.profile_entitlement_registry()
returns jsonb language sql immutable set search_path = '' as $$
  select $registry${"free":{"maxPublishedLessonOffers":2,"maxPublishedCertificates":1,"externalIntroductionVideo":true,"hostedIntroductionVideo":false,"maxHostedVideoBytes":null,"maxHostedVideoDurationSeconds":null,"profileThemes":["professional"],"advancedProfilePersonalization":false,"basicProfileAnalytics":true,"advancedProfileAnalytics":false,"advancedProfileSeo":false},"premium":{"maxPublishedLessonOffers":null,"maxPublishedCertificates":10,"externalIntroductionVideo":true,"hostedIntroductionVideo":true,"maxHostedVideoBytes":78643200,"maxHostedVideoDurationSeconds":90,"profileThemes":["minimal","professional","friendly","modern"],"advancedProfilePersonalization":true,"basicProfileAnalytics":true,"advancedProfileAnalytics":true,"advancedProfileSeo":true}}$registry$::jsonb;
$$;
revoke all on function private.profile_entitlement_registry() from public, anon, authenticated;

-- Internal only: callers are the trusted projection/trigger functions below.
create function private.effective_profile_entitlements(target_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.profile_entitlement_registry()->case when
    private.has_owner_lifetime_access(target_user_id)
    or exists (select 1 from public.subscription_overrides o where o.user_id=target_user_id and o.revoked_at is null and (o.expires_at is null or o.expires_at>now()))
    or exists (select 1 from public.subscriptions s where s.teacher_id=target_user_id and (s.status='trial' or (s.status='active' and s.tier in ('pro','founder'))))
    then 'premium' else 'free' end;
$$;
revoke all on function private.effective_profile_entitlements(uuid) from public, anon, authenticated;

create function private.entitled_public_profile_payload(document jsonb, tutor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb := private.public_profile_payload(document,tutor_id);
  rights jsonb := private.effective_profile_entitlements(tutor_id);
begin
  if result ? 'certificates' then result := result || jsonb_build_object('certificates', coalesce((
    select jsonb_agg(item order by ord) from jsonb_array_elements(private.profile_array(result->'certificates')) with ordinality as items(item,ord)
    where ord <= (rights->>'maxPublishedCertificates')::integer
  ),'[]'::jsonb)); end if;
  if rights->'hostedIntroductionVideo'='false'::jsonb and result#>>'{video,source}'='upload' then result := result-'video'; end if;
  if rights->'advancedProfilePersonalization'='false'::jsonb then
    result := result-'coverUrl'-'sections' || '{"theme":"professional","accentColor":"#137d60","heroLayout":"portrait"}'::jsonb;
    -- Reset presentation, never a tutor's privacy choices.
    result := result || jsonb_build_object('sections', (
      select jsonb_agg(jsonb_build_object('id',id,'title',title,'visible',private.profile_section_visible(document,id)) order by ord)
      from (values (1,'about','O mnie'),(2,'video','Poznajmy się'),(3,'subjects','W czym mogę Ci pomóc'),(4,'approach','Jak uczę'),(5,'experience','Doświadczenie i edukacja'),(6,'certificates','Kwalifikacje'),(7,'offers','Wybierz lekcję'),(8,'faq','Najczęstsze pytania'),(9,'contact','Kontakt')) defaults(ord,id,title)
    ));
  end if;
  return result;
end;
$$;
revoke all on function private.entitled_public_profile_payload(jsonb,uuid) from public, anon, authenticated;

create function private.published_profile_offer_ids(target_tutor_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.booking_event_types e where e.tutor_id=target_tutor_id and e.is_active and e.is_public
  order by e.display_order,e.id
  limit coalesce((private.effective_profile_entitlements(target_tutor_id)->>'maxPublishedLessonOffers')::integer,500);
$$;
revoke all on function private.published_profile_offer_ids(uuid) from public, anon, authenticated;

create or replace function public.get_published_tutor_profile(p_slug text)
returns table (slug text, profile_data jsonb, published_at timestamptz, event_types jsonb)
language sql stable security definer set search_path = '' as $$
  select p.slug, private.entitled_public_profile_payload(p.published_data,p.tutor_id),p.published_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'description',e.description,
      'durationMinutes',e.duration_minutes,'priceGrosz',e.price_grosz,'currency',e.currency,'format',e.format)
      order by e.display_order,e.id)
      from public.booking_event_types e where e.id in (select private.published_profile_offer_ids(p.tutor_id))), '[]'::jsonb)
  from public.tutor_public_profiles p
  join public.tutor_profiles t on t.id=p.tutor_id
  join public.workspace_members m on m.workspace_id=p.workspace_id and m.user_id=t.user_id
  where p.enabled and p.published_data is not null and m.status='active'
    and (lower(p.slug)=lower(trim(p_slug)) or exists (select 1 from public.tutor_public_profile_redirects r where r.tutor_id=p.tutor_id and lower(r.old_slug)=lower(trim(p_slug))))
  limit 1;
$$;

-- Check direct table mutations as well as the publish RPC. The profile row is
-- the serialized certificate publication unit; JSON writes cannot race the cap.
create function private.enforce_profile_publication_entitlements()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rights jsonb := private.effective_profile_entitlements(new.tutor_id);
  next_doc jsonb; prior_doc jsonb; old_published jsonb;
  field_name text; fallback jsonb; doc_key text; visible_count integer; prior_count integer;
begin
  if auth.uid() is not null and auth.uid()<>new.tutor_id then raise exception 'UNAUTHORIZED_OPERATION' using errcode='42501'; end if;
  if tg_op='UPDATE' then old_published:=old.published_data; end if;
  foreach doc_key in array array['draft_data','published_data'] loop
    if doc_key='draft_data' then next_doc:=new.draft_data; if tg_op='UPDATE' then prior_doc:=old.draft_data; end if;
    else next_doc:=new.published_data; prior_doc:=old_published; end if;
    if next_doc is null or next_doc is not distinct from prior_doc then continue; end if;
    if jsonb_typeof(next_doc)<>'object' or octet_length(next_doc::text)>262144 then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
    if rights->'advancedProfilePersonalization'='false'::jsonb then
      foreach field_name in array array['theme','accentColor','heroLayout','coverUrl'] loop
        fallback:=case field_name when 'theme' then '"professional"'::jsonb when 'accentColor' then '"#137d60"'::jsonb when 'heroLayout' then '"portrait"'::jsonb else 'null'::jsonb end;
        if coalesce(next_doc->field_name,fallback) is distinct from coalesce(prior_doc->field_name,fallback)
          and coalesce(next_doc->field_name,fallback) is distinct from fallback then raise exception 'PLAN_REQUIRED:advancedProfilePersonalization' using errcode='42501'; end if;
      end loop;
      if next_doc->'sections' is distinct from prior_doc->'sections' and exists (
        select 1 from jsonb_array_elements(private.profile_array(next_doc->'sections')) with ordinality as items(item,ord)
        where item->>'id' is distinct from (array['about','video','subjects','approach','experience','certificates','offers','faq','contact'])[ord]
          or item->'visible'='false'::jsonb
          or item->>'title' is distinct from (array['O mnie','Poznajmy się','W czym mogę Ci pomóc','Jak uczę','Doświadczenie i edukacja','Kwalifikacje','Wybierz lekcję','Najczęstsze pytania','Kontakt'])[ord]
      ) then raise exception 'PLAN_REQUIRED:advancedProfilePersonalization' using errcode='42501'; end if;
    end if;
    if rights->'hostedIntroductionVideo'='false'::jsonb and next_doc#>>'{video,source}'='upload'
      and next_doc->'video' is distinct from prior_doc->'video' then raise exception 'PLAN_REQUIRED:hostedIntroductionVideo' using errcode='42501'; end if;
  end loop;
  if new.enabled and (tg_op='INSERT' or new.published_data is distinct from old_published) then
    select count(*) into visible_count from jsonb_array_elements(private.profile_array(new.published_data->'certificates')) item where item->'visible'='true'::jsonb;
    select count(*) into prior_count from jsonb_array_elements(private.profile_array(old_published->'certificates')) item where item->'visible'='true'::jsonb;
    if visible_count>(rights->>'maxPublishedCertificates')::integer and (visible_count>prior_count or exists (
      select 1 from jsonb_array_elements(private.profile_array(new.published_data->'certificates')) item
      where item->'visible'='true'::jsonb and not exists (
        select 1 from jsonb_array_elements(private.profile_array(old_published->'certificates')) prior
        where prior->'visible'='true'::jsonb and prior->>'id'=item->>'id' and prior->'storagePath' is not distinct from item->'storagePath'
      )
    )) then raise exception 'PLAN_LIMIT_REACHED:published_certificates' using errcode='42501'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_profile_publication_entitlements() from public,anon,authenticated;
create trigger tutor_profile_plan_guard before insert or update on public.tutor_public_profiles
for each row execute function private.enforce_profile_publication_entitlements();

create function private.enforce_profile_offer_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare max_offers integer; current_count integer;
begin
  if auth.uid() is not null and auth.uid()<>new.tutor_id then raise exception 'UNAUTHORIZED_OPERATION' using errcode='42501'; end if;
  -- One tutor lock serializes inserts/activations across different offer rows.
  perform 1 from public.tutor_profiles where id=new.tutor_id for update;
  if not new.is_active or not new.is_public then return new; end if;
  if tg_op='UPDATE' and old.is_active and old.is_public and old.tutor_id=new.tutor_id then return new; end if;
  max_offers:=coalesce((private.effective_profile_entitlements(new.tutor_id)->>'maxPublishedLessonOffers')::integer,500);
  select count(*) into current_count from public.booking_event_types where tutor_id=new.tutor_id and is_active and is_public and id<>new.id;
  if current_count>=max_offers then raise exception 'PLAN_LIMIT_REACHED:published_offers' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.enforce_profile_offer_limit() from public,anon,authenticated;
create trigger booking_event_type_plan_guard before insert or update on public.booking_event_types
for each row execute function private.enforce_profile_offer_limit();

-- Reuse the existing scheduling engine, adding only a publication-eligibility boundary.
alter function public.get_public_tutor_availability(text,uuid,date,date) set schema private;
revoke all on function private.get_public_tutor_availability(text,uuid,date,date) from public,anon,authenticated,service_role;
create function public.get_public_tutor_availability(p_slug text,p_event_type_id uuid,p_start_date date,p_end_date date)
returns table(date date,starts_at timestamptz,ends_at timestamptz,timezone text)
language plpgsql stable security definer set search_path = '' as $$
declare tutor_id uuid;
begin
  select p.tutor_id into tutor_id from public.tutor_public_profiles p where p.enabled and lower(p.slug)=lower(trim(p_slug));
  if tutor_id is null or not exists(select 1 from private.published_profile_offer_ids(tutor_id) id where id=p_event_type_id) then return; end if;
  return query select * from private.get_public_tutor_availability(p_slug,p_event_type_id,p_start_date,p_end_date);
end;
$$;
revoke all on function public.get_public_tutor_availability(text,uuid,date,date) from public;
grant execute on function public.get_public_tutor_availability(text,uuid,date,date) to anon,authenticated;

create function private.enforce_booking_offer_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source='public_booking' and not exists(select 1 from private.published_profile_offer_ids(new.tutor_id) id where id=new.event_type_id) then
    raise exception 'PUBLIC_BOOKING_OFFER_NOT_FOUND' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_booking_offer_publication() from public,anon,authenticated;
create trigger public_booking_offer_plan_guard before insert on public.bookings
for each row execute function private.enforce_booking_offer_publication();
