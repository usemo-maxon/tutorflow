-- Durable, independently leased work units for Google Calendar imports.
-- A page cursor is provider-opaque and is advanced only after that page has
-- been reconciled. Visible-range coverage intentionally lives separately from
-- the global incremental sync token.

alter table public.google_calendars
  add column last_attempted_sync_at timestamptz,
  add column processed_event_count bigint not null default 0,
  add column recoverable_failure boolean not null default false,
  add column sync_mode text,
  add column sync_page_token text,
  add column sync_run_id uuid,
  add column sync_force_full boolean not null default false,
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add constraint google_calendars_sync_mode_check
    check (sync_mode is null or sync_mode in ('full', 'incremental'));

create index google_calendars_resumable_work_idx
  on public.google_calendars (sync_state, lease_expires_at, updated_at)
  where sync_enabled;

create table public.google_calendar_range_backfills (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.google_calendars(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  teacher_id uuid not null,
  range_start timestamptz not null,
  range_end timestamptz not null,
  page_token text,
  sync_run_id uuid not null default gen_random_uuid(),
  state text not null default 'pending',
  processed_event_count bigint not null default 0,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  last_error text,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (teacher_id, workspace_id)
    references public.tutor_profiles(id, workspace_id) on delete cascade,
  constraint google_calendar_range_backfills_valid_range
    check (range_end > range_start),
  constraint google_calendar_range_backfills_state_check
    check (state in ('pending', 'syncing', 'idle', 'error')),
  unique (calendar_id, range_start, range_end)
);

create index google_calendar_range_backfills_due_idx
  on public.google_calendar_range_backfills (state, lease_expires_at, updated_at)
  where state <> 'idle';

alter table public.google_calendar_range_backfills enable row level security;

create policy google_calendar_range_backfills_select_member
  on public.google_calendar_range_backfills for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

revoke all on table public.google_calendar_range_backfills from anon, authenticated;
grant select on table public.google_calendar_range_backfills to authenticated;

grant select (
  sync_state, last_attempted_sync_at, last_successful_sync_at,
  processed_event_count, recoverable_failure
) on public.google_calendars to authenticated;
