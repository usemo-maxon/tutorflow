-- Public responses must contain only visible content, including for direct Data API writes.
-- These helpers do not mutate or delete the tutor's original draft/published snapshots.
create function private.profile_pick_fields(document jsonb, allowed_keys text[])
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(document) = 'object' then document else '{}'::jsonb end)
  where key = any(allowed_keys);
$$;

create function private.profile_array(document jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(document) = 'array' then document else '[]'::jsonb end;
$$;

create function private.profile_section_visible(document jsonb, section_id text)
returns boolean language sql immutable set search_path = '' as $$
  select not exists (
    select 1 from jsonb_array_elements(private.profile_array(document->'sections')) item
    where item->>'id' = section_id and item->'visible' = 'false'::jsonb
  );
$$;

create function private.profile_owned_media_path(path text, tutor_id uuid, kind text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(path ~ ('^' || tutor_id::text || '/' || kind || '/[0-9a-f-]{36}\.[a-z0-9]+$'), false);
$$;

create function private.public_profile_payload(document jsonb, tutor_id uuid)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  result jsonb;
  video jsonb;
  certificates jsonb;
  section_id text;
  field_name text;
begin
  result := private.profile_pick_fields(document, array[
    'slug','photoUrl','publicName','headline','shortIntro','about','subjects',
    'specializations','levels','audiences','languages','lessonFormats','city',
    'priceText','contactLinks','theme','accentColor','heroLayout','coverUrl','highlights'
  ]);

  result := result || jsonb_build_object('sections', coalesce((
    select jsonb_agg(private.profile_pick_fields(item, array['id','visible','title']) order by ord)
    from jsonb_array_elements(private.profile_array(document->'sections')) with ordinality as items(item, ord)
  ), '[]'::jsonb));

  if private.profile_section_visible(document, 'video') then
    video := private.profile_pick_fields(document->'video', array['source','videoId','storagePath','posterPath','title','description']);
    if video->>'source' = 'youtube' and coalesce(video->>'videoId', '') ~ '^[A-Za-z0-9_-]{11}$' then
      video := video - 'storagePath';
    elsif video->>'source' = 'upload' and private.profile_owned_media_path(video->>'storagePath', tutor_id, 'video') then
      video := video - 'videoId';
    else
      video := null;
    end if;
    if not private.profile_owned_media_path(video->>'posterPath', tutor_id, 'poster') then
      video := video - 'posterPath';
    end if;
    if video is not null then result := result || jsonb_build_object('video', video); end if;
  end if;

  if private.profile_section_visible(document, 'certificates') then
    select coalesce(jsonb_agg(
      private.profile_pick_fields(item, array['id','title','issuer','issuedAt','expiresAt','credentialNumber','verificationUrl','description','fileType','visible'])
      || case when private.profile_owned_media_path(item->>'storagePath', tutor_id, 'certificate')
        then jsonb_build_object('storagePath', item->'storagePath') else '{}'::jsonb end
      order by ord), '[]'::jsonb) into certificates
    from jsonb_array_elements(private.profile_array(document->'certificates')) with ordinality as items(item, ord)
    where item->'visible' = 'true'::jsonb;
    result := result || jsonb_build_object('certificates', certificates);
  end if;

  if private.profile_section_visible(document, 'faq') then
    result := result || jsonb_build_object('faq', coalesce((
      select jsonb_agg(private.profile_pick_fields(item, array['id','question','answer','visible']) order by ord)
      from jsonb_array_elements(private.profile_array(document->'faq')) with ordinality as items(item, ord)
      where item->'visible' = 'true'::jsonb
    ), '[]'::jsonb));
  end if;

  if private.profile_section_visible(document, 'experience') then
    result := result || jsonb_build_object('timeline', coalesce((
      select jsonb_agg(private.profile_pick_fields(item, array['id','kind','institution','title','startYear','endYear','current','description']) order by ord)
      from jsonb_array_elements(private.profile_array(document->'timeline')) with ordinality as items(item, ord)
    ), '[]'::jsonb));
  end if;
  if private.profile_section_visible(document, 'approach') then
    result := result || jsonb_build_object('teachingApproach', private.profile_pick_fields(document->'teachingApproach',
      array['philosophy','lessonStructure','materials','homework','personalization','outcomes','highlights']));
  end if;
  for section_id, field_name in select * from (values
    ('about','about'), ('subjects','specializations'), ('subjects','levels'),
    ('subjects','audiences'), ('contact','contactLinks')
  ) as fields(section_id, field_name) loop
    if not private.profile_section_visible(document, section_id) then result := result - field_name; end if;
  end loop;
  return result;
end;
$$;

revoke all on function private.profile_pick_fields(jsonb,text[]), private.profile_array(jsonb),
  private.profile_section_visible(jsonb,text), private.profile_owned_media_path(text,uuid,text),
  private.public_profile_payload(jsonb,uuid) from public, anon, authenticated;

create or replace function public.get_published_tutor_profile(p_slug text)
returns table (slug text, profile_data jsonb, published_at timestamptz, event_types jsonb)
language sql stable security definer set search_path = '' as $$
  select p.slug, private.public_profile_payload(p.published_data, p.tutor_id), p.published_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'description', e.description,
      'durationMinutes', e.duration_minutes, 'priceGrosz', e.price_grosz,
      'currency', e.currency, 'format', e.format
    ) order by e.display_order, e.name, e.id)
    from public.booking_event_types e
    where e.tutor_id = p.tutor_id and e.is_active and e.is_public), '[]'::jsonb)
  from public.tutor_public_profiles p
  join public.tutor_profiles t on t.id = p.tutor_id
  join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = t.user_id
  where p.enabled and p.published_data is not null and m.status = 'active'
    and (lower(p.slug) = lower(trim(p_slug)) or exists (
      select 1 from public.tutor_public_profile_redirects r
      where r.tutor_id = p.tutor_id and lower(r.old_slug) = lower(trim(p_slug))
    ))
  limit 1;
$$;
revoke all on function public.get_published_tutor_profile(text) from public;
grant execute on function public.get_published_tutor_profile(text) to anon, authenticated;

-- The existing subscription state machine and trusted grants own write access.
-- No independent expiry calculation or administrator-as-premium rule is introduced.
create function private.can_write_own_public_profile()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and (
    (select public.current_user_has_owner_lifetime_access())
    or coalesce((select public.current_user_subscription_override())->>'tier' in ('pro','founder'), false)
    or exists (select 1 from public.subscriptions where teacher_id = (select auth.uid()) and not read_only)
  );
$$;
revoke all on function private.can_write_own_public_profile() from public, anon;
grant execute on function private.can_write_own_public_profile() to authenticated;

create policy tutor_profile_writable_insert on public.tutor_public_profiles as restrictive
  for insert to authenticated with check ((select private.can_write_own_public_profile()));
create policy tutor_profile_writable_update on public.tutor_public_profiles as restrictive
  for update to authenticated
  using ((select private.can_write_own_public_profile()))
  with check ((select private.can_write_own_public_profile()));
