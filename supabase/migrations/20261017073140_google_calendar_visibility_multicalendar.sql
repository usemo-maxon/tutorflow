-- Per-calendar Google state. Credentials stay on the parent connection; this
-- table contains only provider metadata, user display preferences and opaque
-- synchronization cursors/channel hashes.

alter table public.integration_connections
  add column easy4tutor_visible boolean not null default true;

create table public.google_calendars (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  teacher_id uuid not null,
  calendar_id text not null,
  summary text not null,
  description text,
  timezone text,
  access_role text not null default 'reader',
  is_primary boolean not null default false,
  google_background_color text,
  custom_color text,
  visible boolean not null default true,
  count_as_busy boolean not null default true,
  sync_enabled boolean not null default true,
  sync_token text,
  watch_channel_id text,
  watch_resource_id text,
  watch_token_hash text,
  watch_expires_at timestamptz,
  sync_state text not null default 'pending',
  last_error text,
  last_successful_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (teacher_id, workspace_id)
    references public.tutor_profiles(id, workspace_id) on delete cascade,
  constraint google_calendars_calendar_not_blank check (length(trim(calendar_id)) > 0),
  constraint google_calendars_summary_not_blank check (length(trim(summary)) > 0),
  constraint google_calendars_access_role_check
    check (access_role in ('freeBusyReader','reader','writer','owner')),
  constraint google_calendars_sync_state_check
    check (sync_state in ('idle','pending','syncing','error','reconnect_required')),
  constraint google_calendars_google_color_check
    check (google_background_color is null or google_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint google_calendars_custom_color_check
    check (custom_color is null or custom_color ~ '^#[0-9A-F]{6}$'),
  unique (connection_id, calendar_id)
);

alter table public.external_google_events
  add column description text,
  add column location text,
  add column html_link text;

create index google_calendars_workspace_teacher_idx
  on public.google_calendars (workspace_id, teacher_id);
create index google_calendars_watch_due_idx
  on public.google_calendars (watch_expires_at)
  where sync_enabled;

insert into public.google_calendars (
  connection_id, workspace_id, teacher_id, calendar_id, summary,
  is_primary, sync_token, watch_channel_id, watch_resource_id,
  watch_token_hash, watch_expires_at, sync_state, last_error,
  last_successful_sync_at
)
select id, workspace_id, teacher_id, selected_calendar_id,
  case when selected_calendar_id = 'primary' then 'Kalendarz główny' else selected_calendar_id end,
  selected_calendar_id = 'primary', sync_token, watch_channel_id,
  watch_resource_id, watch_token_hash, watch_expires_at, sync_state,
  last_error, last_successful_sync_at
from public.integration_connections
where provider = 'google';

alter table public.google_calendars enable row level security;

create policy google_calendars_select_member
  on public.google_calendars for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

revoke all on table public.google_calendars from anon, authenticated;
grant select on table public.google_calendars to authenticated;

grant select (teacher_id, provider, status, label, last_error, updated_at,
  sync_state, last_attempted_sync_at, last_successful_sync_at,
  easy4tutor_visible)
  on public.integration_connections to authenticated;

create or replace function private.reject_external_google_event_conflict()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('scheduled', 'needs_completion') and exists (
    select 1
    from public.external_google_events event
    left join public.google_calendars calendar
      on calendar.connection_id = event.connection_id
     and calendar.calendar_id = event.calendar_id
    where event.workspace_id = new.workspace_id
      and event.teacher_id = new.tutor_id
      and coalesce(calendar.sync_enabled, true)
      and coalesce(calendar.count_as_busy, true)
      and event.status <> 'cancelled'
      and event.transparency = 'opaque'
      and (
        (not event.all_day and new.starts_at < event.ends_at and new.ends_at > event.starts_at)
        or
        (event.all_day
          and (new.starts_at at time zone new.timezone)::date < event.end_date
          and (new.ends_at at time zone new.timezone)::date >= event.start_date)
      )
  ) then
    raise exception 'EXTERNAL_GOOGLE_EVENT_CONFLICT' using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_external_google_event_conflict() from public;
