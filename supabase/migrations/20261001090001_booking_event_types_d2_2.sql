-- D2.2: configurable lesson types. Prices stay in integer grosz; public reads
-- stay behind the deliberately narrow published-profile RPC.
create table public.booking_event_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null,
  price_grosz bigint not null default 0,
  currency text not null default 'PLN',
  format text not null,
  is_active boolean not null default true,
  is_public boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_event_types_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint booking_event_types_description_check check (description is null or char_length(description) <= 500),
  constraint booking_event_types_duration_check check (duration_minutes between 1 and 720),
  constraint booking_event_types_price_check check (price_grosz between 0 and 100000000),
  constraint booking_event_types_currency_check check (currency = 'PLN'),
  constraint booking_event_types_format_check check (format in ('online', 'offline')),
  constraint booking_event_types_display_order_check check (display_order between 0 and 10000)
);

create index booking_event_types_public_order_idx
  on public.booking_event_types (tutor_id, display_order)
  where is_active and is_public;

alter table public.booking_event_types enable row level security;
grant select, insert, update, delete on public.booking_event_types to authenticated;

create policy booking_event_types_owner_select on public.booking_event_types
  for select to authenticated
  using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy booking_event_types_owner_insert on public.booking_event_types
  for insert to authenticated
  with check (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy booking_event_types_owner_update on public.booking_event_types
  for update to authenticated
  using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)))
  with check (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy booking_event_types_owner_delete on public.booking_event_types
  for delete to authenticated
  using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));

drop function if exists public.get_published_tutor_profile(text);
create function public.get_published_tutor_profile(p_slug text)
returns table (
  slug text, photo_url text, public_name text, headline text, about text,
  subjects text[], levels text[], lesson_formats text[], city text, price_text text,
  contact_links text[], event_types jsonb
)
language sql stable security definer set search_path = '' as $$
  select p.slug, p.photo_url, p.public_name, p.headline, p.about, p.subjects,
    p.levels, p.lesson_formats, p.city, p.price_text, p.contact_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'description', e.description,
        'durationMinutes', e.duration_minutes, 'priceGrosz', e.price_grosz,
        'currency', e.currency, 'format', e.format
      ) order by e.display_order, e.name)
      from public.booking_event_types e
      where e.tutor_id = p.tutor_id and e.is_active and e.is_public
    ), '[]'::jsonb)
  from public.tutor_public_profiles p
  join public.tutor_profiles t on t.id = p.tutor_id
  join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = t.user_id
  where p.enabled and lower(p.slug) = lower(trim(p_slug)) and m.status = 'active'
  limit 1;
$$;
revoke all on function public.get_published_tutor_profile(text) from public;
grant execute on function public.get_published_tutor_profile(text) to anon, authenticated;
