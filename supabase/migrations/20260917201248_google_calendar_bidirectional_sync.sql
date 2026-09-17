-- Bidirectional Google Calendar synchronization state.
-- OAuth credentials remain encrypted in integration_connections and are never
-- granted to browser roles.  Provider events are cached separately from Lessons.

alter table public.integration_connections
  add column id uuid not null default gen_random_uuid(),
  add column selected_calendar_id text not null default 'primary',
  add column sync_token text,
  add column watch_channel_id text,
  add column watch_resource_id text,
  add column watch_token_hash text,
  add column watch_expires_at timestamptz,
  add column sync_state text not null default 'idle',
  add column sync_requested_at timestamptz,
  add column last_attempted_sync_at timestamptz,
  add column last_successful_sync_at timestamptz;

alter table public.integration_connections
  add constraint integration_connections_id_unique unique (id),
  add constraint integration_connections_selected_calendar_not_blank
    check (length(trim(selected_calendar_id)) > 0),
  add constraint integration_connections_sync_state_check
    check (sync_state in ('idle', 'pending', 'syncing', 'error', 'reconnect_required'));

alter table public.integration_connections
  drop constraint if exists integration_connections_status_check;
alter table public.integration_connections
  add constraint integration_connections_status_check
    check (status in ('connected','not_connected','error','reconnect_required'));

create index integration_connections_sync_due_idx
  on public.integration_connections (sync_requested_at)
  where provider = 'google' and sync_requested_at is not null;
create index integration_connections_watch_due_idx
  on public.integration_connections (watch_expires_at)
  where provider = 'google' and status = 'connected';

create table public.google_event_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  teacher_id uuid not null,
  lesson_id uuid not null,
  calendar_id text not null,
  google_event_id text not null,
  google_etag text,
  google_updated_at timestamptz,
  recurring_event_id text,
  original_start_time timestamptz,
  last_synced_at timestamptz,
  local_updated_at_at_sync timestamptz,
  last_synced_hash text,
  status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (teacher_id, workspace_id)
    references public.tutor_profiles(id, workspace_id) on delete cascade,
  foreign key (lesson_id, workspace_id)
    references public.lessons(id, workspace_id) on delete cascade,
  constraint google_event_mappings_calendar_not_blank check (length(trim(calendar_id)) > 0),
  constraint google_event_mappings_event_not_blank check (length(trim(google_event_id)) > 0),
  constraint google_event_mappings_status_check
    check (status in ('pending','synced','provider_deleted','error','retired')),
  unique (connection_id, lesson_id),
  unique (connection_id, calendar_id, google_event_id)
);

create index google_event_mappings_lesson_idx
  on public.google_event_mappings (workspace_id, lesson_id);
create index google_event_mappings_provider_idx
  on public.google_event_mappings (connection_id, google_event_id);

create table public.external_google_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  teacher_id uuid not null,
  calendar_id text not null,
  google_event_id text not null,
  summary text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  timezone text,
  all_day boolean not null default false,
  status text not null default 'confirmed',
  transparency text not null default 'opaque',
  google_color_id text,
  app_color text,
  google_etag text,
  google_updated_at timestamptz,
  recurring_event_id text,
  original_start_time timestamptz,
  last_seen_sync_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (teacher_id, workspace_id)
    references public.tutor_profiles(id, workspace_id) on delete cascade,
  constraint external_google_events_time_shape check (
    (all_day and start_date is not null and end_date is not null
      and starts_at is null and ends_at is null and end_date > start_date)
    or
    (not all_day and starts_at is not null and ends_at is not null
      and start_date is null and end_date is null and ends_at > starts_at)
  ),
  constraint external_google_events_status_check
    check (status in ('confirmed','tentative','cancelled')),
  constraint external_google_events_transparency_check
    check (transparency in ('opaque','transparent')),
  constraint external_google_events_color_hex
    check (app_color is null or app_color ~ '^#[0-9A-F]{6}$'),
  unique (connection_id, calendar_id, google_event_id)
);

create index external_google_events_range_idx
  on public.external_google_events (workspace_id, teacher_id, ends_at, starts_at)
  where not all_day and status <> 'cancelled';
create index external_google_events_all_day_idx
  on public.external_google_events (workspace_id, teacher_id, start_date, end_date)
  where all_day and status <> 'cancelled';

alter table public.google_event_mappings enable row level security;
alter table public.external_google_events enable row level security;

create policy google_event_mappings_select_member
  on public.google_event_mappings for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy external_google_events_select_member
  on public.external_google_events for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

revoke all on public.google_event_mappings, public.external_google_events
  from anon, authenticated;
grant select on public.google_event_mappings, public.external_google_events
  to authenticated;

-- Browser clients may see connection state but never sync tokens, watch secrets,
-- provider credentials, or provider identifiers.
revoke all on public.integration_connections from authenticated;
grant select (teacher_id, provider, status, label, last_error, updated_at,
  sync_state, last_attempted_sync_at, last_successful_sync_at)
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
    where event.workspace_id = new.workspace_id
      and event.teacher_id = new.tutor_id
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

create trigger lessons_external_google_event_guard
before insert or update of starts_at, ends_at, status on public.lessons
for each row execute function private.reject_external_google_event_conflict();
