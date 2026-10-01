-- D2.1: deliberately public tutor presentation. The base table remains private;
-- anonymous reads go only through the narrow RPC below.
create table public.tutor_public_profiles (
  tutor_id uuid primary key references public.tutor_profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  slug text not null,
  photo_url text,
  public_name text not null default '',
  headline text,
  about text,
  subjects text[] not null default '{}',
  levels text[] not null default '{}',
  lesson_formats text[] not null default '{}',
  city text,
  price_text text,
  contact_links text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint tutor_public_profiles_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  constraint tutor_public_profiles_formats_check check (lesson_formats <@ array['online','offline']::text[]),
  constraint tutor_public_profiles_reserved_check check (slug not in ('app','api','admin','logowanie','rejestracja','pricing','ustawienia','odzyskaj-haslo','regulamin','polityka-prywatnosci'))
);
create unique index tutor_public_profiles_slug_unique on public.tutor_public_profiles (lower(slug));
alter table public.tutor_public_profiles enable row level security;
grant select, insert, update on public.tutor_public_profiles to authenticated;
create policy tutor_public_profiles_owner_select on public.tutor_public_profiles for select to authenticated using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy tutor_public_profiles_owner_insert on public.tutor_public_profiles for insert to authenticated with check (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy tutor_public_profiles_owner_update on public.tutor_public_profiles for update to authenticated using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id))) with check (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));

create or replace function public.get_published_tutor_profile(p_slug text)
returns table (slug text, photo_url text, public_name text, headline text, about text, subjects text[], levels text[], lesson_formats text[], city text, price_text text, contact_links text[])
language sql stable security definer set search_path = '' as $$
  select p.slug, p.photo_url, p.public_name, p.headline, p.about, p.subjects, p.levels, p.lesson_formats, p.city, p.price_text, p.contact_links
  from public.tutor_public_profiles p join public.tutor_profiles t on t.id = p.tutor_id join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = t.user_id
  where p.enabled and lower(p.slug) = lower(trim(p_slug)) and m.status = 'active' limit 1;
$$;
revoke all on function public.get_published_tutor_profile(text) from public;
grant execute on function public.get_published_tutor_profile(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('tutor-public-photos','tutor-public-photos',true,3145728,array['image/jpeg','image/png','image/webp']) on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy tutor_public_photos_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'tutor-public-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy tutor_public_photos_owner_update on storage.objects for update to authenticated using (bucket_id = 'tutor-public-photos' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'tutor-public-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy tutor_public_photos_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'tutor-public-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
