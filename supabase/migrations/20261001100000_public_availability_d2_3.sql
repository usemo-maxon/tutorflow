-- D2.3: public read-only availability. All private scheduling inputs remain
-- inside this security-definer function; anonymous callers receive free slots only.
create table public.booking_availability_settings (
  tutor_id uuid primary key references public.tutor_profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  minimum_notice_hours integer not null default 12,
  booking_horizon_days integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_availability_settings_notice_check check (minimum_notice_hours between 0 and 720),
  constraint booking_availability_settings_horizon_check check (booking_horizon_days between 1 and 365)
);

alter table public.booking_availability_settings enable row level security;
grant select, insert, update on public.booking_availability_settings to authenticated;

create policy booking_availability_settings_owner_select on public.booking_availability_settings
  for select to authenticated
  using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy booking_availability_settings_owner_insert on public.booking_availability_settings
  for insert to authenticated
  with check (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy booking_availability_settings_owner_update on public.booking_availability_settings
  for update to authenticated
  using (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)))
  with check (tutor_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));

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
  v_notice integer := 12;
  v_horizon integer := 30;
  v_earliest timestamptz;
  v_latest timestamptz;
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
  if v_tutor_id is null then
    return;
  end if;

  select minimum_notice_hours, booking_horizon_days into v_notice, v_horizon
  from public.booking_availability_settings where tutor_id = v_tutor_id;
  v_notice := coalesce(v_notice, 12);
  v_horizon := coalesce(v_horizon, 30);
  v_earliest := now() + make_interval(hours => v_notice);
  v_latest := now() + make_interval(days => v_horizon);

  return query
  with requested_days as (
    select generated::date as local_date
    from generate_series(
      p_start_date::timestamp,
      p_end_date::timestamp,
      interval '1 day'
    ) generated
  ), candidate_slots as (
    select d.local_date,
      ((d.local_date::timestamp + make_interval(mins => minute)) at time zone v_timezone) as candidate_start,
      ((d.local_date::timestamp + make_interval(mins => minute)) at time zone v_timezone)
        + make_interval(mins => v_duration) as candidate_end,
      minute as start_minute,
      minute + v_duration as end_minute
    from requested_days d
    cross join generate_series(0, 1440 - v_duration, 15) minute
  ), free_slots as (
    select c.local_date, c.candidate_start, c.candidate_end
    from candidate_slots c
    where c.candidate_start >= v_earliest and c.candidate_start <= v_latest
      -- Never offer a non-existent local time during the spring DST transition.
      and (c.candidate_start at time zone v_timezone) =
        (c.local_date::timestamp + make_interval(mins => c.start_minute))
      and not exists (
        select 1 from public.availability_exceptions x
        where x.workspace_id = v_workspace_id and x.tutor_id = v_tutor_id
          and x.exception_date = c.local_date and x.kind = 'unavailable'
          and (x.start_time is null or (c.start_minute < extract(hour from x.end_time) * 60 + extract(minute from x.end_time)
            and c.end_minute > extract(hour from x.start_time) * 60 + extract(minute from x.start_time)))
      )
      and (
        not exists (
          select 1 from public.availability_exceptions x
          where x.workspace_id = v_workspace_id and x.tutor_id = v_tutor_id
            and x.exception_date = c.local_date and x.kind = 'available'
        ) or exists (
          select 1 from public.availability_exceptions x
          where x.workspace_id = v_workspace_id and x.tutor_id = v_tutor_id
            and x.exception_date = c.local_date and x.kind = 'available'
            and (x.start_time is null or (c.start_minute >= extract(hour from x.start_time) * 60 + extract(minute from x.start_time)
              and c.end_minute <= extract(hour from x.end_time) * 60 + extract(minute from x.end_time)))
        )
      )
      and not exists (
        select 1 from public.availability_rules r
        where r.workspace_id = v_workspace_id and r.tutor_id = v_tutor_id and not r.is_available
          and ((r.kind = 'single' and c.candidate_start < r.ends_at and c.candidate_end > r.starts_at)
            or (r.kind = 'recurring' and r.day_of_week = extract(isodow from c.local_date)
              and (r.all_day or (c.start_minute < extract(hour from r.end_time) * 60 + extract(minute from r.end_time)
                and c.end_minute > extract(hour from r.start_time) * 60 + extract(minute from r.start_time)))))
      )
      and (
        not exists (
          select 1 from public.availability_rules r
          where r.workspace_id = v_workspace_id and r.tutor_id = v_tutor_id
            and r.is_available and r.kind = 'recurring'
        ) or exists (
          select 1 from public.availability_rules r
          where r.workspace_id = v_workspace_id and r.tutor_id = v_tutor_id
            and r.is_available and r.kind = 'recurring'
            and r.day_of_week = extract(isodow from c.local_date)
            and (r.all_day or (c.start_minute >= extract(hour from r.start_time) * 60 + extract(minute from r.start_time)
              and c.end_minute <= extract(hour from r.end_time) * 60 + extract(minute from r.end_time)))
        )
      )
      and not exists (
        select 1 from public.lessons l
        where l.workspace_id = v_workspace_id and l.tutor_id = v_tutor_id
          and l.status <> 'cancelled' and c.candidate_start < l.ends_at and c.candidate_end > l.starts_at
      )
      and not exists (
        select 1 from public.calendar_blocks b
        where b.workspace_id = v_workspace_id and b.tutor_id = v_tutor_id
          and c.candidate_start < b.ends_at and c.candidate_end > b.starts_at
      )
      and not exists (
        select 1 from public.external_google_events g
        join public.integration_connections i on i.id = g.connection_id
        where g.workspace_id = v_workspace_id and g.teacher_id = v_tutor_id
          and i.status = 'connected' and g.status <> 'cancelled' and g.transparency <> 'transparent'
          and ((not g.all_day and c.candidate_start < g.ends_at and c.candidate_end > g.starts_at)
            or (g.all_day and c.local_date >= g.start_date and c.local_date < g.end_date))
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
