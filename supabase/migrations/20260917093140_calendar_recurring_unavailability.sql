-- Recurring unavailable intervals are hard scheduling conflicts. Regular
-- availability remains a soft guard that tutors may explicitly override.

create or replace function private.prevent_recurring_unavailability_overlap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status <> 'cancelled' and exists (
    select 1
    from public.availability_rules r
    cross join lateral generate_series(
      (new.starts_at at time zone r.timezone)::date - 1,
      (new.ends_at at time zone r.timezone)::date,
      interval '1 day'
    ) occurrence_date
    where r.workspace_id = new.workspace_id
      and r.tutor_id = new.tutor_id
      and r.kind = 'recurring'
      and not r.is_available
      and r.day_of_week = extract(isodow from occurrence_date)::smallint
      and new.starts_at < (
        case
          when r.all_day then (occurrence_date::date + 1)::timestamp
          else occurrence_date::date + r.end_time
        end at time zone r.timezone
      )
      and new.ends_at > (
        case
          when r.all_day then occurrence_date::date::timestamp
          else occurrence_date::date + r.start_time
        end at time zone r.timezone
      )
  ) then
    raise exception 'RECURRING_UNAVAILABILITY_CONFLICT' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger lessons_recurring_unavailability_guard
before insert or update of starts_at, ends_at on public.lessons
for each row execute function private.prevent_recurring_unavailability_overlap();

revoke all on function private.prevent_recurring_unavailability_overlap()
  from public, anon, authenticated;
