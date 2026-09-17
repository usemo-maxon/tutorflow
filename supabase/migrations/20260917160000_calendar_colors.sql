-- Calendar color ownership for lessons, recurring defaults and calendar blocks.
-- Exact easy4tutor colors remain #RRGGBB; provider mapping happens in code.

alter table public.recurring_lesson_series add column color text;
alter table public.lessons add column color text;
alter table public.calendar_blocks add column color text;

alter table public.recurring_lesson_series add constraint recurring_lesson_series_color_hex
  check (color ~ '^#[0-9A-F]{6}$');
alter table public.lessons add constraint lessons_color_hex
  check (color ~ '^#[0-9A-F]{6}$');
alter table public.calendar_blocks add constraint calendar_blocks_color_hex
  check (color ~ '^#[0-9A-F]{6}$');

update public.recurring_lesson_series set color = '#6F8FEF' where color is null;
update public.lessons l
set color = coalesce(s.color, '#6F8FEF')
from public.recurring_lesson_series s
where l.recurring_series_id = s.id and l.color is null;
update public.lessons set color = '#6F8FEF' where color is null;
update public.calendar_blocks set color = '#7F8A9A' where color is null;

alter table public.recurring_lesson_series alter column color set not null;
alter table public.lessons alter column color set not null;
alter table public.calendar_blocks alter column color set not null;

create or replace function private.inherit_recurring_series_color()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.color is null and new.parent_series_id is not null then
    select color into new.color
    from public.recurring_lesson_series
    where id = new.parent_series_id and workspace_id = new.workspace_id;
  end if;
  new.color := coalesce(new.color, '#6F8FEF');
  return new;
end;
$$;

create or replace function private.inherit_lesson_color()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.color is null and new.recurring_series_id is not null then
    select color into new.color
    from public.recurring_lesson_series
    where id = new.recurring_series_id and workspace_id = new.workspace_id;
  end if;
  new.color := coalesce(new.color, '#6F8FEF');
  return new;
end;
$$;

create trigger recurring_series_color_default
before insert on public.recurring_lesson_series
for each row execute function private.inherit_recurring_series_color();

create trigger lesson_color_default
before insert on public.lessons
for each row execute function private.inherit_lesson_color();

alter table public.calendar_blocks alter column color set default '#7F8A9A';

create or replace function public.create_lesson_schedule_with_color(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_color text := coalesce(nullif(upper(trim(p_payload->>'color')), ''), '#6F8FEF');
  v_series_id uuid;
begin
  if v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'INVALID_CALENDAR_COLOR' using errcode = '22023';
  end if;
  v_result := public.create_lesson_schedule(p_payload);
  v_series_id := nullif(v_result->>'seriesId', '')::uuid;
  if v_series_id is not null then
    update public.recurring_lesson_series set color = v_color, updated_at = now()
    where id = v_series_id;
  end if;
  update public.lessons set color = v_color, updated_at = now()
  where id in (
    select value::uuid from jsonb_array_elements_text(v_result->'ids')
  );
  return v_result;
end;
$$;

create or replace function public.upsert_calendar_block_with_color(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_color text := coalesce(nullif(upper(trim(p_payload->>'color')), ''), '#7F8A9A');
begin
  if v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'INVALID_CALENDAR_COLOR' using errcode = '22023';
  end if;
  v_result := public.upsert_calendar_block_relational(p_payload);
  update public.calendar_blocks set color = v_color, updated_at = now()
  where id = (v_result->>'id')::uuid;
  return v_result;
end;
$$;

create or replace function public.update_lesson_color_relational(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_lesson public.lessons%rowtype;
  v_color text := upper(trim(p_payload->>'color'));
  v_scope text := coalesce(p_payload->>'scope', 'single');
  v_ids uuid[];
  v_target record;
  v_cutoff timestamptz;
begin
  if v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'INVALID_CALENDAR_COLOR' using errcode = '22023';
  end if;
  if v_scope not in ('single', 'future', 'series') then
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;
  select workspace_id into v_workspace_id
  from public.tutor_profiles
  where user_id = v_user_id and id = v_user_id;
  select * into v_lesson from public.lessons
  where id = (p_payload->>'lessonId')::uuid
    and workspace_id = v_workspace_id and tutor_id = v_user_id;
  if v_lesson.id is null then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0002';
  end if;
  if nullif(p_payload->>'expectedUpdatedAt', '') is not null
    and v_lesson.updated_at <> (p_payload->>'expectedUpdatedAt')::timestamptz then
    raise exception 'STALE_WRITE' using errcode = '40001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if v_scope = 'single' or v_lesson.recurring_series_id is null then
    v_ids := array[v_lesson.id];
  else
    v_cutoff := case when v_scope = 'future'
      then coalesce(v_lesson.recurrence_original_starts_at, v_lesson.starts_at)
      else now()
    end;
    with recursive family as (
      select id from public.recurring_lesson_series
      where id = v_lesson.recurring_series_id and workspace_id = v_workspace_id
      union all
      select child.id from public.recurring_lesson_series child
      join family parent on child.parent_series_id = parent.id
      where child.workspace_id = v_workspace_id
    )
    select array_agg(l.id order by l.starts_at, l.id) into v_ids
    from public.lessons l
    where l.workspace_id = v_workspace_id
      and l.recurring_series_id in (select id from family)
      and coalesce(l.recurrence_original_starts_at, l.starts_at) >= v_cutoff
      and l.status not in ('completed', 'cancelled');
    v_ids := coalesce(v_ids, array[]::uuid[]);

    with recursive family as (
      select id from public.recurring_lesson_series
      where id = v_lesson.recurring_series_id and workspace_id = v_workspace_id
      union all
      select child.id from public.recurring_lesson_series child
      join family parent on child.parent_series_id = parent.id
      where child.workspace_id = v_workspace_id
    )
    update public.recurring_lesson_series
    set color = v_color, updated_at = now()
    where id in (select id from family);
  end if;

  update public.lessons l
  set color = v_color,
    sync_status = case
      when l.sync_status = 'disabled' then 'disabled'
      when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending'
      else 'disabled'
    end,
    sync_message = null,
    updated_at = now()
  where l.id = any(v_ids);

  for v_target in
    select id, starts_at, status, sync_status
    from public.lessons where id = any(v_ids)
  loop
    perform private.enqueue_lesson_side_effects(
      v_workspace_id, v_user_id, v_target.id, v_target.starts_at,
      v_target.status, v_target.sync_status
    );
  end loop;
  return jsonb_build_object('ids', to_jsonb(v_ids));
end;
$$;

revoke all on function private.inherit_recurring_series_color() from public, anon;
revoke all on function private.inherit_lesson_color() from public, anon;
revoke all on function public.create_lesson_schedule_with_color(jsonb) from public, anon;
revoke all on function public.upsert_calendar_block_with_color(jsonb) from public, anon;
revoke all on function public.update_lesson_color_relational(jsonb) from public, anon;
grant execute on function public.create_lesson_schedule_with_color(jsonb) to authenticated;
grant execute on function public.upsert_calendar_block_with_color(jsonb) to authenticated;
grant execute on function public.update_lesson_color_relational(jsonb) to authenticated;
