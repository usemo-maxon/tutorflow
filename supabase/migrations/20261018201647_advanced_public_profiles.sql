-- Advanced public profiles: drafts are private, publication is an explicit snapshot.
alter table public.tutor_public_profiles
  add column draft_slug text,
  add column draft_data jsonb,
  add column published_data jsonb,
  add column published_at timestamptz,
  add column draft_updated_at timestamptz not null default now();

update public.tutor_public_profiles p set
  draft_slug = p.slug,
  draft_data = jsonb_build_object(
    'enabled', p.enabled, 'slug', p.slug, 'photoUrl', p.photo_url,
    'publicName', p.public_name, 'headline', p.headline, 'about', p.about,
    'subjects', p.subjects, 'levels', p.levels, 'lessonFormats', p.lesson_formats,
    'city', p.city, 'priceText', p.price_text, 'contactLinks', p.contact_links,
    'theme', 'professional', 'accentColor', '#137d60', 'heroLayout', 'portrait'
  ),
  published_data = case when p.enabled then jsonb_build_object(
    'slug', p.slug, 'photoUrl', p.photo_url, 'publicName', p.public_name,
    'headline', p.headline, 'about', p.about, 'subjects', p.subjects,
    'levels', p.levels, 'lessonFormats', p.lesson_formats, 'city', p.city,
    'priceText', p.price_text, 'contactLinks', p.contact_links,
    'theme', 'professional', 'accentColor', '#137d60', 'heroLayout', 'portrait'
  ) end,
  published_at = case when p.enabled then p.updated_at end;

alter table public.tutor_public_profiles
  alter column draft_slug set not null,
  add constraint tutor_public_profiles_draft_slug_check check (
    draft_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(draft_slug) between 3 and 60
  );
create unique index tutor_public_profiles_draft_slug_unique on public.tutor_public_profiles (lower(draft_slug));

create function private.initialize_tutor_public_profile_draft()
returns trigger language plpgsql set search_path = '' as $$
declare v_profile jsonb;
begin
  v_profile := jsonb_build_object(
    'slug', new.slug, 'photoUrl', new.photo_url, 'publicName', new.public_name,
    'headline', new.headline, 'about', new.about, 'subjects', new.subjects,
    'levels', new.levels, 'lessonFormats', new.lesson_formats, 'city', new.city,
    'priceText', new.price_text, 'contactLinks', new.contact_links,
    'theme', 'professional', 'accentColor', '#137d60', 'heroLayout', 'portrait'
  );
  new.draft_slug := coalesce(new.draft_slug, new.slug);
  new.draft_data := coalesce(new.draft_data, v_profile);
  if new.enabled then
    new.published_data := coalesce(new.published_data, v_profile);
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;
create trigger tutor_public_profiles_initialize_draft before insert on public.tutor_public_profiles
for each row execute function private.initialize_tutor_public_profile_draft();

create table public.tutor_public_profile_redirects (
  old_slug text primary key,
  tutor_id uuid not null references public.tutor_profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint tutor_public_profile_redirects_slug_check check (old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
alter table public.tutor_public_profile_redirects enable row level security;
grant select, insert, delete on public.tutor_public_profile_redirects to authenticated;
create policy tutor_profile_redirects_owner_select on public.tutor_public_profile_redirects for select to authenticated
  using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy tutor_profile_redirects_owner_insert on public.tutor_public_profile_redirects for insert to authenticated
  with check (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy tutor_profile_redirects_owner_delete on public.tutor_public_profile_redirects for delete to authenticated
  using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));

create or replace function public.publish_own_tutor_profile(p_profile jsonb, p_slug text)
returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.tutor_public_profiles;
  v_now timestamptz := now();
begin
  select * into v_row from public.tutor_public_profiles
    where tutor_id = (select auth.uid()) for update;
  if not found then raise exception 'profile_not_found'; end if;
  if exists (select 1 from public.tutor_public_profiles p where p.tutor_id <> v_row.tutor_id and (lower(p.slug) = lower(p_slug) or lower(p.draft_slug) = lower(p_slug)))
    or exists (select 1 from public.tutor_public_profile_redirects r where r.tutor_id <> v_row.tutor_id and lower(r.old_slug) = lower(p_slug))
  then raise unique_violation using message = 'slug_taken'; end if;
  if v_row.enabled and lower(v_row.slug) <> lower(p_slug) then
    insert into public.tutor_public_profile_redirects(old_slug, tutor_id, workspace_id)
      values (v_row.slug, v_row.tutor_id, v_row.workspace_id)
      on conflict (old_slug) do nothing;
  end if;
  delete from public.tutor_public_profile_redirects where tutor_id = v_row.tutor_id and lower(old_slug) = lower(p_slug);
  update public.tutor_public_profiles set
    enabled = true, slug = p_slug, draft_slug = p_slug,
    photo_url = nullif(p_profile->>'photoUrl', ''), public_name = p_profile->>'publicName',
    headline = nullif(p_profile->>'headline', ''), about = nullif(p_profile->>'about', ''),
    subjects = coalesce(array(select jsonb_array_elements_text(p_profile->'subjects')), '{}'),
    levels = coalesce(array(select jsonb_array_elements_text(p_profile->'levels')), '{}'),
    lesson_formats = coalesce(array(select jsonb_array_elements_text(p_profile->'lessonFormats')), '{}'),
    city = nullif(p_profile->>'city', ''), price_text = nullif(p_profile->>'priceText', ''),
    contact_links = coalesce(array(select jsonb_array_elements_text(p_profile->'contactLinks')), '{}'),
    draft_data = p_profile || jsonb_build_object('enabled', true, 'slug', p_slug),
    published_data = p_profile - 'enabled' || jsonb_build_object('slug', p_slug),
    published_at = v_now, draft_updated_at = v_now, updated_at = v_now
  where tutor_id = v_row.tutor_id;
  return v_now;
end;
$$;
revoke all on function public.publish_own_tutor_profile(jsonb, text) from public;
grant execute on function public.publish_own_tutor_profile(jsonb, text) to authenticated;

drop function if exists public.get_published_tutor_profile(text);
create function public.get_published_tutor_profile(p_slug text)
returns table (slug text, profile_data jsonb, published_at timestamptz, event_types jsonb)
language sql stable security definer set search_path = '' as $$
  select p.slug, p.published_data, p.published_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'description', e.description,
      'durationMinutes', e.duration_minutes, 'priceGrosz', e.price_grosz,
      'currency', e.currency, 'format', e.format
    ) order by e.display_order, e.name)
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutor-profile-media', 'tutor-profile-media', false, 104857600,
  array['video/mp4','video/webm','image/jpeg','image/png','image/webp','application/pdf','text/vtt'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy tutor_profile_media_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'tutor-profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy tutor_profile_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tutor-profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy tutor_profile_media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'tutor-profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'tutor-profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy tutor_profile_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tutor-profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
