-- D2.4: atomic public bookings. Anonymous clients cannot execute the mutation;
-- the server uses its trusted role after validating the deliberately small DTO.
create extension if not exists btree_gist with schema extensions;

alter table public.booking_event_types
  add constraint booking_event_types_id_workspace_unique unique (id, workspace_id);

alter table public.bookings
  add column event_type_id uuid,
  add column event_type_name text,
  add column duration_minutes integer,
  add column price_grosz bigint,
  add column currency text,
  add column format text,
  add column guest_name text,
  add column guest_email text,
  add column guest_phone text,
  add column guest_level text,
  add column guest_goal text,
  add column guest_message text,
  add constraint bookings_event_type_workspace_fk
    foreign key (event_type_id, workspace_id)
    references public.booking_event_types(id, workspace_id) on delete restrict,
  add constraint bookings_public_guest_check check (
    source <> 'public_booking' or (
      student_id is null and event_type_id is not null
      and event_type_name is not null and duration_minutes is not null
      and price_grosz is not null and currency is not null and format is not null
      and guest_name is not null and guest_email is not null
      and status in ('confirmed', 'cancelled')
    )
  ),
  add constraint bookings_event_type_name_check
    check (event_type_name is null or char_length(btrim(event_type_name)) between 1 and 120),
  add constraint bookings_duration_check
    check (duration_minutes is null or duration_minutes between 1 and 720),
  add constraint bookings_price_check
    check (price_grosz is null or price_grosz between 0 and 100000000),
  add constraint bookings_currency_check
    check (currency is null or currency = 'PLN'),
  add constraint bookings_format_check
    check (format is null or format in ('online', 'offline')),
  add constraint bookings_guest_name_check
    check (guest_name is null or char_length(btrim(guest_name)) between 1 and 120),
  add constraint bookings_guest_email_check
    check (guest_email is null or char_length(guest_email) between 3 and 255),
  add constraint bookings_guest_phone_check
    check (guest_phone is null or char_length(guest_phone) <= 50),
  add constraint bookings_guest_level_check
    check (guest_level is null or char_length(guest_level) <= 80),
  add constraint bookings_guest_goal_check
    check (guest_goal is null or char_length(guest_goal) <= 500),
  add constraint bookings_guest_message_check
    check (guest_message is null or char_length(guest_message) <= 2000);

-- PostgreSQL enforces this invariant even when two transactions race. Adjacent
-- half-open ranges remain valid; cancelled bookings release their interval.
alter table public.bookings
  add constraint bookings_tutor_active_time_excl
  exclude using gist (
    tutor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'));

revoke insert, update, delete on public.bookings from anon;

create or replace function private.public_booking_slot_is_available(
  p_workspace_id uuid,
  p_tutor_id uuid,
  p_timezone text,
  p_duration integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_notice integer := 12;
  v_horizon integer := 30;
  v_local_start timestamp;
  v_local_date date;
  v_start_minute integer;
  v_end_minute integer;
begin
  select minimum_notice_hours, booking_horizon_days
    into v_notice, v_horizon
  from public.booking_availability_settings
  where tutor_id = p_tutor_id;
  v_notice := coalesce(v_notice, 12);
  v_horizon := coalesce(v_horizon, 30);
  v_local_start := p_starts_at at time zone p_timezone;
  v_local_date := v_local_start::date;
  v_start_minute := extract(hour from v_local_start)::integer * 60
    + extract(minute from v_local_start)::integer;
  v_end_minute := v_start_minute + p_duration;

  if p_duration < 1 or p_ends_at <> p_starts_at + make_interval(mins => p_duration)
    or extract(second from v_local_start) <> 0
    or mod(v_start_minute, 15) <> 0 or v_end_minute > 1440
    or p_starts_at < now() + make_interval(hours => v_notice)
    or p_starts_at > now() + make_interval(days => v_horizon) then
    return false;
  end if;

  if exists (
    select 1 from public.availability_exceptions x
    where x.workspace_id = p_workspace_id and x.tutor_id = p_tutor_id
      and x.exception_date = v_local_date and x.kind = 'unavailable'
      and (x.start_time is null or (
        v_start_minute < extract(hour from x.end_time) * 60 + extract(minute from x.end_time)
        and v_end_minute > extract(hour from x.start_time) * 60 + extract(minute from x.start_time)
      ))
  ) then return false; end if;

  if exists (
    select 1 from public.availability_exceptions x
    where x.workspace_id = p_workspace_id and x.tutor_id = p_tutor_id
      and x.exception_date = v_local_date and x.kind = 'available'
  ) and not exists (
    select 1 from public.availability_exceptions x
    where x.workspace_id = p_workspace_id and x.tutor_id = p_tutor_id
      and x.exception_date = v_local_date and x.kind = 'available'
      and (x.start_time is null or (
        v_start_minute >= extract(hour from x.start_time) * 60 + extract(minute from x.start_time)
        and v_end_minute <= extract(hour from x.end_time) * 60 + extract(minute from x.end_time)
      ))
  ) then return false; end if;

  if exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id and r.tutor_id = p_tutor_id
      and not r.is_available and (
        (r.kind = 'single' and p_starts_at < r.ends_at and p_ends_at > r.starts_at)
        or (r.kind = 'recurring' and r.day_of_week = extract(isodow from v_local_date)
          and (r.all_day or (
            v_start_minute < extract(hour from r.end_time) * 60 + extract(minute from r.end_time)
            and v_end_minute > extract(hour from r.start_time) * 60 + extract(minute from r.start_time)
          )))
      )
  ) then return false; end if;

  if exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id and r.tutor_id = p_tutor_id
      and r.is_available and r.kind = 'recurring'
  ) and not exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id and r.tutor_id = p_tutor_id
      and r.is_available and r.kind = 'recurring'
      and r.day_of_week = extract(isodow from v_local_date)
      and (r.all_day or (
        v_start_minute >= extract(hour from r.start_time) * 60 + extract(minute from r.start_time)
        and v_end_minute <= extract(hour from r.end_time) * 60 + extract(minute from r.end_time)
      ))
  ) then return false; end if;

  if exists (
    select 1 from public.lessons l
    where l.workspace_id = p_workspace_id and l.tutor_id = p_tutor_id
      and l.status <> 'cancelled' and p_starts_at < l.ends_at and p_ends_at > l.starts_at
  ) or exists (
    select 1 from public.calendar_blocks b
    where b.workspace_id = p_workspace_id and b.tutor_id = p_tutor_id
      and p_starts_at < b.ends_at and p_ends_at > b.starts_at
  ) or exists (
    select 1 from public.bookings b
    where b.workspace_id = p_workspace_id and b.tutor_id = p_tutor_id
      and b.status in ('pending', 'confirmed')
      and p_starts_at < b.ends_at and p_ends_at > b.starts_at
  ) or exists (
    select 1 from public.external_google_events g
    join public.integration_connections i on i.id = g.connection_id
    where g.workspace_id = p_workspace_id and g.teacher_id = p_tutor_id
      and i.status = 'connected' and g.status <> 'cancelled'
      and g.transparency <> 'transparent'
      and ((not g.all_day and p_starts_at < g.ends_at and p_ends_at > g.starts_at)
        or (g.all_day and v_local_date >= g.start_date and v_local_date < g.end_date))
  ) then return false; end if;

  return true;
end;
$$;
revoke all on function private.public_booking_slot_is_available(uuid, uuid, text, integer, timestamptz, timestamptz) from public;

create or replace function public.get_public_tutor_availability(
  p_slug text,
  p_event_type_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (date date, starts_at timestamptz, ends_at timestamptz, timezone text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tutor_id uuid;
  v_workspace_id uuid;
  v_timezone text;
  v_duration integer;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
    or p_end_date - p_start_date > 13 then
    raise exception 'INVALID_DATE_RANGE' using errcode = '22023';
  end if;

  select p.tutor_id, p.workspace_id, pr.timezone, e.duration_minutes
    into v_tutor_id, v_workspace_id, v_timezone, v_duration
  from public.tutor_public_profiles p
  join public.tutor_profiles t on t.id = p.tutor_id
  join public.profiles pr on pr.id = t.user_id
  join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = t.user_id
  join public.booking_event_types e on e.id = p_event_type_id and e.tutor_id = p.tutor_id
  where p.enabled and lower(p.slug) = lower(trim(p_slug))
    and m.status = 'active' and e.is_active and e.is_public
  limit 1;
  if v_tutor_id is null then return; end if;

  return query
  with requested_days as (
    select generated::date as local_date
    from generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') generated
  ), candidate_slots as (
    select d.local_date,
      ((d.local_date::timestamp + make_interval(mins => minute)) at time zone v_timezone) as candidate_start,
      ((d.local_date::timestamp + make_interval(mins => minute)) at time zone v_timezone)
        + make_interval(mins => v_duration) as candidate_end,
      minute as start_minute
    from requested_days d
    cross join generate_series(0, 1440 - v_duration, 15) minute
  ), free_slots as (
    select c.local_date, c.candidate_start, c.candidate_end
    from candidate_slots c
    where (c.candidate_start at time zone v_timezone) =
        (c.local_date::timestamp + make_interval(mins => c.start_minute))
      and private.public_booking_slot_is_available(
        v_workspace_id, v_tutor_id, v_timezone, v_duration,
        c.candidate_start, c.candidate_end
      )
  )
  select d.local_date, s.candidate_start, s.candidate_end, v_timezone
  from requested_days d
  left join free_slots s on s.local_date = d.local_date
  order by d.local_date, s.candidate_start;
end;
$$;
revoke all on function public.get_public_tutor_availability(text, uuid, date, date) from public;
grant execute on function public.get_public_tutor_availability(text, uuid, date, date) to anon, authenticated;

create function public.create_public_booking(
  p_slug text,
  p_event_type_id uuid,
  p_starts_at timestamptz,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text default null,
  p_guest_level text default null,
  p_guest_goal text default null,
  p_guest_message text default null
)
returns table (
  booking_id uuid,
  event_type_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  guest_email text
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_booking_id uuid;
  v_tutor_id uuid;
  v_workspace_id uuid;
  v_timezone text;
  v_event_name text;
  v_duration integer;
  v_price bigint;
  v_currency text;
  v_format text;
  v_ends_at timestamptz;
  v_email text;
begin
  v_email := lower(btrim(coalesce(p_guest_email, '')));
  if char_length(btrim(coalesce(p_guest_name, ''))) not between 1 and 120
    or char_length(v_email) not between 3 and 255
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or char_length(coalesce(p_guest_phone, '')) > 50
    or char_length(coalesce(p_guest_level, '')) > 80
    or char_length(coalesce(p_guest_goal, '')) > 500
    or char_length(coalesce(p_guest_message, '')) > 2000 then
    raise exception 'PUBLIC_BOOKING_INVALID_GUEST' using errcode = '22023';
  end if;

  select p.tutor_id, p.workspace_id, pr.timezone, e.name,
      e.duration_minutes, e.price_grosz, e.currency, e.format
    into v_tutor_id, v_workspace_id, v_timezone, v_event_name,
      v_duration, v_price, v_currency, v_format
  from public.tutor_public_profiles p
  join public.tutor_profiles t on t.id = p.tutor_id
  join public.profiles pr on pr.id = t.user_id
  join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = t.user_id
  join public.booking_event_types e
    on e.id = p_event_type_id and e.tutor_id = p.tutor_id and e.workspace_id = p.workspace_id
  where p.enabled and lower(p.slug) = lower(btrim(p_slug))
    and m.status = 'active' and e.is_active and e.is_public
  limit 1;
  if v_tutor_id is null then
    raise exception 'PUBLIC_BOOKING_OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tutor_id::text, 0));
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  if not private.public_booking_slot_is_available(
    v_workspace_id, v_tutor_id, v_timezone, v_duration, p_starts_at, v_ends_at
  ) then
    raise exception 'PUBLIC_BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  begin
    insert into public.bookings (
      workspace_id, tutor_id, event_type_id, event_type_name,
      duration_minutes, price_grosz, currency, format,
      starts_at, ends_at, timezone, status, source,
      guest_name, guest_email, guest_phone, guest_level, guest_goal, guest_message
    ) values (
      v_workspace_id, v_tutor_id, p_event_type_id, v_event_name,
      v_duration, v_price, v_currency, v_format,
      p_starts_at, v_ends_at, v_timezone, 'confirmed', 'public_booking',
      btrim(p_guest_name), v_email, nullif(btrim(p_guest_phone), ''),
      nullif(btrim(p_guest_level), ''), nullif(btrim(p_guest_goal), ''),
      nullif(btrim(p_guest_message), '')
    ) returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'PUBLIC_BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end;

  return query select v_booking_id, v_event_name, p_starts_at, v_ends_at, v_timezone, v_email;
end;
$$;
revoke all on function public.create_public_booking(text, uuid, timestamptz, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_public_booking(text, uuid, timestamptz, text, text, text, text, text, text)
  to service_role;
