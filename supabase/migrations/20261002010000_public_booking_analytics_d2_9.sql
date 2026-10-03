-- D2.9: first-party, privacy-minimal public booking analytics.
alter table public.bookings
  add column if not exists acquisition_source text not null default 'direct'
    check (acquisition_source in ('instagram','tiktok','facebook','linkedin','google','direct','other')),
  add column if not exists utm_source text check (char_length(utm_source) <= 80),
  add column if not exists utm_medium text check (char_length(utm_medium) <= 80),
  add column if not exists utm_campaign text check (char_length(utm_campaign) <= 80);

create table public.public_booking_funnel_metrics (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles(id) on delete cascade,
  metric_date date not null,
  metric text not null check (metric in ('profile_view','event_type_selected','slot_selected','booking_started','booking_completed')),
  source text not null check (source in ('instagram','tiktok','facebook','linkedin','google','direct','other')),
  count integer not null default 0 check (count >= 0),
  primary key (workspace_id, tutor_id, metric_date, metric, source)
);
alter table public.public_booking_funnel_metrics enable row level security;
revoke all on public.public_booking_funnel_metrics from anon, authenticated;
grant select, insert, update on public.public_booking_funnel_metrics to service_role;

create function public.record_public_booking_funnel_event(p_slug text, p_event text, p_source text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_profile record; v_source text;
begin
  if p_event not in ('profile_view','event_type_selected','slot_selected','booking_started','booking_completed') then return; end if;
  v_source := case lower(left(coalesce(p_source, ''), 80))
    when 'instagram' then 'instagram' when 'tiktok' then 'tiktok' when 'facebook' then 'facebook'
    when 'linkedin' then 'linkedin' when 'google' then 'google' when 'direct' then 'direct' else 'other' end;
  select profile.workspace_id, profile.tutor_id, account.timezone into v_profile
  from public.tutor_public_profiles profile join public.tutor_profiles tutor on tutor.id = profile.tutor_id
  join public.profiles account on account.id = tutor.user_id
  where profile.enabled and lower(profile.slug) = lower(btrim(p_slug)) limit 1;
  if v_profile.tutor_id is null then return; end if;
  insert into public.public_booking_funnel_metrics (workspace_id, tutor_id, metric_date, metric, source, count)
  values (v_profile.workspace_id, v_profile.tutor_id, (now() at time zone v_profile.timezone)::date, p_event, v_source, 1)
  on conflict (workspace_id, tutor_id, metric_date, metric, source) do update set count = public.public_booking_funnel_metrics.count + 1;
end; $$;
revoke all on function public.record_public_booking_funnel_event(text,text,text) from public, anon, authenticated;
grant execute on function public.record_public_booking_funnel_event(text,text,text) to service_role;

create function public.create_public_booking(
  p_slug text, p_event_type_id uuid, p_starts_at timestamptz, p_guest_name text, p_guest_email text,
  p_guest_phone text, p_guest_level text, p_guest_goal text, p_guest_message text, p_management_token_hash text,
  p_management_token_ciphertext text, p_acquisition_source text, p_utm_source text, p_utm_medium text, p_utm_campaign text
) returns table (
  booking_id uuid, tutor_id uuid, event_type_id uuid, event_type_name text, duration_minutes integer, price_grosz bigint,
  currency text, format text, starts_at timestamptz, ends_at timestamptz, timezone text, guest_name text, guest_email text,
  tutor_public_name text, public_location text, created_at timestamptz
) language plpgsql volatile security definer set search_path = '' as $$
declare item record; v_source text;
begin
  v_source := case lower(left(coalesce(p_acquisition_source, ''), 80))
    when 'instagram' then 'instagram' when 'tiktok' then 'tiktok' when 'facebook' then 'facebook'
    when 'linkedin' then 'linkedin' when 'google' then 'google' when 'direct' then 'direct' else 'other' end;
  for item in select * from public.create_public_booking(p_slug, p_event_type_id, p_starts_at, p_guest_name, p_guest_email,
    p_guest_phone, p_guest_level, p_guest_goal, p_guest_message, p_management_token_hash, p_management_token_ciphertext)
  loop
    update public.bookings set acquisition_source = v_source, utm_source = nullif(left(lower(btrim(coalesce(p_utm_source,''))),80), ''),
      utm_medium = nullif(left(lower(btrim(coalesce(p_utm_medium,''))),80), ''), utm_campaign = nullif(left(lower(btrim(coalesce(p_utm_campaign,''))),80), '')
    where id = item.booking_id;
    booking_id := item.booking_id;
    tutor_id := item.tutor_id;
    event_type_id := item.event_type_id;
    event_type_name := item.event_type_name;
    duration_minutes := item.duration_minutes;
    price_grosz := item.price_grosz;
    currency := item.currency;
    format := item.format;
    starts_at := item.starts_at;
    ends_at := item.ends_at;
    timezone := item.timezone;
    guest_name := item.guest_name;
    guest_email := item.guest_email;
    tutor_public_name := item.tutor_public_name;
    public_location := item.public_location;
    created_at := item.created_at;
    return next;
  end loop;
end; $$;
revoke all on function public.create_public_booking(text,uuid,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_public_booking(text,uuid,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) to service_role;

create function public.get_own_public_booking_analytics(p_period_days integer)
returns table(metric text, count bigint) language sql stable security definer set search_path = '' as $$
  with mine as (select tutor.id, tutor.workspace_id, account.timezone from public.tutor_profiles tutor join public.profiles account on account.id = tutor.user_id where tutor.user_id = auth.uid() limit 1),
  funnel as (select m.metric, sum(m.count)::bigint as count from public.public_booking_funnel_metrics m join mine on mine.id = m.tutor_id and mine.workspace_id = m.workspace_id where m.metric_date >= ((now() at time zone mine.timezone)::date - (p_period_days - 1)) group by m.metric),
  completed as (select 'booking_completed'::text as metric, count(*)::bigint as count from public.bookings b join mine on mine.id = b.tutor_id and mine.workspace_id = b.workspace_id where b.source = 'public_booking' and b.status <> 'cancelled' and (b.created_at at time zone mine.timezone)::date >= ((now() at time zone mine.timezone)::date - (p_period_days - 1)))
  select metric, max(count) from (select * from funnel union all select * from completed) all_metrics group by metric;
$$;
create function public.get_own_public_booking_sources(p_period_days integer)
returns table(source text, bookings bigint) language sql stable security definer set search_path = '' as $$
  select coalesce(b.acquisition_source, 'direct'), count(*)::bigint from public.bookings b
  join public.tutor_profiles tutor on tutor.id = b.tutor_id join public.profiles account on account.id = tutor.user_id
  where tutor.user_id = auth.uid() and b.source = 'public_booking' and b.status <> 'cancelled'
    and (b.created_at at time zone account.timezone)::date >= ((now() at time zone account.timezone)::date - (p_period_days - 1))
  group by coalesce(b.acquisition_source, 'direct') order by count(*) desc;
$$;
revoke all on function public.get_own_public_booking_analytics(integer), public.get_own_public_booking_sources(integer) from public, anon;
grant execute on function public.get_own_public_booking_analytics(integer), public.get_own_public_booking_sources(integer) to authenticated;
