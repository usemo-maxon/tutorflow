-- Stage 0: normalized, workspace-scoped domain foundation.
-- Existing teacher_states remains as a compatibility command snapshot while
-- the application is migrated incrementally; relational tables are the read
-- source of truth after this migration.

create type public.workspace_role as enum ('owner', 'admin', 'tutor');
create type public.membership_status as enum ('active', 'invited', 'suspended');
create type public.student_status as enum ('active', 'inactive', 'archived');
create type public.contact_type as enum ('parent', 'guardian', 'billing', 'other');
create type public.group_status as enum ('active', 'inactive', 'archived');
create type public.lesson_status as enum ('scheduled', 'needs_completion', 'completed', 'cancelled', 'no_show');
create type public.lesson_format as enum ('online', 'offline');
create type public.lesson_creation_mode as enum ('single', 'multiple', 'recurring');
create type public.lesson_billing_type as enum ('per_lesson', 'per_student', 'package', 'trial');
create type public.attendance_status as enum ('unknown', 'present', 'absent', 'late', 'cancelled');
create type public.participant_payment_status as enum ('unpaid', 'paid', 'cancelled');
create type public.recurrence_frequency as enum ('daily', 'weekly', 'monthly');
create type public.series_status as enum ('active', 'cancelled', 'completed');
create type public.note_visibility as enum ('private', 'student_visible');
create type public.homework_status as enum ('assigned', 'completed', 'cancelled');
create type public.material_type as enum ('note', 'file', 'link');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'cancelled');
create type public.package_status as enum ('active', 'exhausted', 'expired', 'cancelled');
create type public.package_usage_kind as enum ('consumption', 'reversal');
create type public.availability_kind as enum ('single', 'recurring');
create type public.availability_exception_kind as enum ('available', 'unavailable');
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'converted');
create type public.booking_source as enum ('tutor', 'student_portal', 'public_booking');
create type public.reminder_channel as enum ('email', 'telegram', 'sms', 'whatsapp', 'push');
create type public.notification_status as enum ('unread', 'read', 'archived');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  timezone text not null default 'Europe/Warsaw',
  currency text not null default 'PLN',
  locale text not null default 'pl-PL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_not_blank check (length(trim(name)) > 0),
  constraint workspaces_timezone_not_blank check (length(trim(timezone)) > 0),
  constraint workspaces_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint workspaces_locale_not_blank check (length(trim(locale)) > 0),
  unique (id, owner_user_id)
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'tutor',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  unique (id, workspace_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id, workspace_id) where status = 'active';

create table public.tutor_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text,
  timezone text not null default 'Europe/Warsaw',
  default_currency text not null default 'PLN',
  default_lesson_duration_minutes integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutor_profiles_timezone_not_blank check (length(trim(timezone)) > 0),
  constraint tutor_profiles_currency_iso check (default_currency ~ '^[A-Z]{3}$'),
  constraint tutor_profiles_duration_range check (default_lesson_duration_minutes between 15 and 480),
  unique (workspace_id, user_id),
  unique (id, workspace_id)
);

-- Existing accounts become one-person workspaces. IDs for tutor profiles reuse
-- auth user IDs to preserve the existing teacher identifiers.
insert into public.workspaces (name, owner_user_id, timezone)
select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) || ' workspace', p.id, p.timezone
from public.profiles p
where not exists (select 1 from public.workspaces w where w.owner_user_id = p.id);

insert into public.workspace_members (workspace_id, user_id, role, status)
select w.id, w.owner_user_id, 'owner', 'active'
from public.workspaces w
on conflict (workspace_id, user_id) do update set role = excluded.role, status = excluded.status;

insert into public.tutor_profiles (id, workspace_id, user_id, display_name, timezone)
select p.id, w.id, p.id, p.full_name, p.timezone
from public.profiles p
join public.workspaces w on w.owner_user_id = p.id
on conflict (workspace_id, user_id) do update
set display_name = excluded.display_name, timezone = excluded.timezone, updated_at = now();

create table public.students (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  first_name text not null,
  last_name text not null default '',
  display_name text not null,
  email text,
  phone text,
  timezone text,
  status public.student_status not null default 'active',
  level text,
  subject text,
  goal text,
  notes text,
  default_lesson_duration_minutes integer not null default 60,
  default_lesson_price_grosz bigint,
  currency text not null default 'PLN',
  default_format public.lesson_format not null default 'online',
  default_location text,
  legacy_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint students_display_name_not_blank check (length(trim(display_name)) > 0),
  constraint students_duration_range check (default_lesson_duration_minutes between 15 and 480),
  constraint students_price_nonnegative check (default_lesson_price_grosz is null or default_lesson_price_grosz >= 0),
  constraint students_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint students_archive_consistent check ((status = 'archived') = (archived_at is not null)),
  unique (id, workspace_id)
);
create index students_workspace_status_idx on public.students (workspace_id, status, display_name);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  type public.contact_type not null default 'other',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index contacts_workspace_idx on public.contacts (workspace_id);

create table public.student_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  contact_id uuid not null,
  relationship text,
  is_primary boolean not null default false,
  is_billing_contact boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete cascade,
  foreign key (contact_id, workspace_id) references public.contacts(id, workspace_id) on delete cascade,
  unique (student_id, contact_id),
  unique (id, workspace_id)
);
create unique index student_contacts_one_primary_idx on public.student_contacts (student_id) where is_primary;
create unique index student_contacts_one_billing_idx on public.student_contacts (student_id) where is_billing_contact;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null,
  subject text,
  level text,
  status public.group_status not null default 'active',
  default_duration_minutes integer not null default 60,
  default_price_grosz bigint,
  currency text not null default 'PLN',
  notes text,
  is_ad_hoc boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint groups_name_not_blank check (length(trim(name)) > 0),
  constraint groups_duration_range check (default_duration_minutes between 15 and 480),
  constraint groups_price_nonnegative check (default_price_grosz is null or default_price_grosz >= 0),
  constraint groups_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint groups_archive_consistent check ((status = 'archived') = (archived_at is not null)),
  unique (id, workspace_id)
);
create index groups_workspace_status_idx on public.groups (workspace_id, status, name);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  group_id uuid not null,
  student_id uuid not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  status public.membership_status not null default 'active',
  foreign key (group_id, workspace_id) references public.groups(id, workspace_id) on delete cascade,
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete restrict,
  constraint group_members_dates_valid check (left_at is null or left_at >= joined_at),
  unique (group_id, student_id),
  unique (id, workspace_id)
);
create index group_members_student_idx on public.group_members (workspace_id, student_id) where status = 'active';

create table public.recurring_lesson_series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tutor_id uuid not null,
  student_id uuid,
  group_id uuid,
  parent_series_id uuid,
  frequency public.recurrence_frequency not null default 'weekly',
  recurrence_interval integer not null default 1,
  days_of_week smallint[] not null default '{}',
  starts_on date not null,
  ends_on date,
  start_time time not null,
  duration_minutes integer not null,
  timezone text not null,
  status public.series_status not null default 'active',
  effective_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tutor_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete restrict,
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete restrict,
  foreign key (group_id, workspace_id) references public.groups(id, workspace_id) on delete restrict,
  foreign key (parent_series_id, workspace_id) references public.recurring_lesson_series(id, workspace_id) on delete restrict,
  constraint recurring_series_participant_xor check (num_nonnulls(student_id, group_id) = 1),
  constraint recurring_series_interval_positive check (recurrence_interval > 0),
  constraint recurring_series_duration_range check (duration_minutes between 15 and 480),
  constraint recurring_series_date_range check (ends_on is null or ends_on >= starts_on),
  constraint recurring_series_weekdays check (days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint recurring_series_weekly_days_required check (frequency <> 'weekly' or cardinality(days_of_week) > 0),
  constraint recurring_series_timezone_not_blank check (length(trim(timezone)) > 0),
  unique (id, workspace_id)
);
create index recurring_series_workspace_status_idx on public.recurring_lesson_series (workspace_id, status, starts_on);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tutor_id uuid not null,
  student_id uuid,
  group_id uuid,
  title text not null default '',
  subject text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  status public.lesson_status not null default 'scheduled',
  format public.lesson_format not null default 'online',
  location text,
  price_grosz bigint,
  currency text not null default 'PLN',
  billing_type public.lesson_billing_type not null default 'per_lesson',
  meeting_url text,
  creation_mode public.lesson_creation_mode not null default 'single',
  recurring_series_id uuid,
  recurrence_original_starts_at timestamptz,
  sync_status text not null default 'disabled' check (sync_status in ('pending','synced','failed','deleted_in_google','disabled')),
  sync_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  foreign key (tutor_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete restrict,
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete restrict,
  foreign key (group_id, workspace_id) references public.groups(id, workspace_id) on delete restrict,
  foreign key (recurring_series_id, workspace_id) references public.recurring_lesson_series(id, workspace_id) on delete restrict,
  constraint lessons_participant_xor check (num_nonnulls(student_id, group_id) = 1),
  constraint lessons_time_range check (ends_at > starts_at),
  constraint lessons_timezone_not_blank check (length(trim(timezone)) > 0),
  constraint lessons_price_nonnegative check (price_grosz is null or price_grosz >= 0),
  constraint lessons_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint lessons_completion_timestamp check ((status = 'completed') = (completed_at is not null)),
  constraint lessons_cancellation_timestamp check ((status = 'cancelled') = (cancelled_at is not null)),
  unique (id, workspace_id)
);
create index lessons_workspace_starts_idx on public.lessons (workspace_id, starts_at);
create index lessons_calendar_idx on public.lessons (workspace_id, tutor_id, starts_at, ends_at) where status in ('scheduled', 'needs_completion');
create index lessons_student_history_idx on public.lessons (workspace_id, student_id, starts_at desc) where student_id is not null;
create index lessons_group_history_idx on public.lessons (workspace_id, group_id, starts_at desc) where group_id is not null;
create index lessons_series_idx on public.lessons (workspace_id, recurring_series_id, recurrence_original_starts_at) where recurring_series_id is not null;

create table public.lesson_participants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lesson_id uuid not null,
  student_id uuid not null,
  payment_status public.participant_payment_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete cascade,
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete restrict,
  unique (lesson_id, student_id),
  unique (lesson_id, student_id, workspace_id),
  unique (id, workspace_id)
);
create index lesson_participants_student_idx on public.lesson_participants (workspace_id, student_id, lesson_id);

create table public.attendances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lesson_id uuid not null,
  student_id uuid not null,
  status public.attendance_status not null default 'unknown',
  marked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lesson_id, student_id, workspace_id) references public.lesson_participants(lesson_id, student_id, workspace_id) on delete cascade,
  unique (lesson_id, student_id),
  unique (id, workspace_id)
);
create index attendances_student_idx on public.attendances (workspace_id, student_id, status);

create table public.lesson_plan_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lesson_id uuid not null,
  position integer not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete cascade,
  constraint lesson_plan_items_content_not_blank check (length(trim(content)) > 0),
  constraint lesson_plan_items_position_nonnegative check (position >= 0),
  unique (lesson_id, position),
  unique (id, workspace_id)
);

create table public.plan_item_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lesson_participant_id uuid not null,
  plan_item_id uuid not null,
  completed boolean not null default false,
  score smallint,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lesson_participant_id, workspace_id) references public.lesson_participants(id, workspace_id) on delete cascade,
  foreign key (plan_item_id, workspace_id) references public.lesson_plan_items(id, workspace_id) on delete cascade,
  constraint plan_item_results_score_range check (score is null or score between 1 and 10),
  unique (lesson_participant_id, plan_item_id),
  unique (id, workspace_id)
);

create table public.lesson_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  lesson_id uuid not null,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  content text not null,
  visibility public.note_visibility not null default 'private',
  note_type text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete cascade,
  unique (lesson_id, author_user_id, note_type),
  unique (id, workspace_id)
);

create table public.homeworks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  lesson_id uuid not null,
  student_id uuid,
  group_id uuid,
  title text not null,
  description text,
  status public.homework_status not null default 'assigned',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete cascade,
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete restrict,
  foreign key (group_id, workspace_id) references public.groups(id, workspace_id) on delete restrict,
  constraint homeworks_participant_xor check (num_nonnulls(student_id, group_id) = 1),
  unique (lesson_id),
  unique (id, workspace_id)
);
create index homeworks_due_idx on public.homeworks (workspace_id, due_at) where status = 'assigned' and due_at is not null;

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  description text,
  type public.material_type not null,
  file_url text,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint materials_title_not_blank check (length(trim(title)) > 0),
  constraint materials_location check (
    (type = 'note' and file_url is null and external_url is null)
    or (type = 'file' and file_url is not null and external_url is null)
    or (type = 'link' and external_url is not null and file_url is null)
  ),
  unique (id, workspace_id)
);
create index materials_workspace_active_idx on public.materials (workspace_id, title) where archived_at is null;

create table public.lesson_materials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lesson_id uuid not null,
  material_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete cascade,
  foreign key (material_id, workspace_id) references public.materials(id, workspace_id) on delete restrict,
  unique (lesson_id, material_id),
  unique (id, workspace_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_id uuid not null,
  payer_contact_id uuid,
  amount_grosz bigint not null,
  currency text not null default 'PLN',
  status public.payment_status not null default 'pending',
  payment_method text,
  provider text,
  provider_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete restrict,
  foreign key (payer_contact_id, workspace_id) references public.contacts(id, workspace_id) on delete restrict,
  constraint payments_amount_positive check (amount_grosz > 0),
  constraint payments_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint payments_paid_timestamp check (
    (status in ('paid', 'refunded') and paid_at is not null)
    or (status in ('pending', 'failed', 'cancelled') and paid_at is null)
  ),
  unique (workspace_id, provider, provider_transaction_id),
  unique (id, workspace_id)
);
create index payments_workspace_student_idx on public.payments (workspace_id, student_id, created_at desc);
create index payments_workspace_status_idx on public.payments (workspace_id, status, created_at desc);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_id uuid not null,
  name text not null,
  total_lessons integer not null,
  price_grosz bigint not null,
  currency text not null default 'PLN',
  status public.package_status not null default 'active',
  purchased_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete restrict,
  constraint packages_name_not_blank check (length(trim(name)) > 0),
  constraint packages_lessons_positive check (total_lessons > 0),
  constraint packages_price_nonnegative check (price_grosz >= 0),
  constraint packages_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint packages_expiry_valid check (expires_at is null or expires_at >= purchased_at),
  unique (id, workspace_id)
);
create index packages_workspace_student_idx on public.packages (workspace_id, student_id, status);

create table public.package_usages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  package_id uuid not null,
  lesson_id uuid not null,
  kind public.package_usage_kind not null,
  units integer not null default 1,
  reverses_usage_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  foreign key (package_id, workspace_id) references public.packages(id, workspace_id) on delete restrict,
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete restrict,
  foreign key (reverses_usage_id, package_id, lesson_id, workspace_id)
    references public.package_usages(id, package_id, lesson_id, workspace_id) on delete restrict,
  constraint package_usages_units_positive check (units > 0),
  constraint package_usages_reversal_shape check (
    (kind = 'consumption' and reverses_usage_id is null)
    or (kind = 'reversal' and reverses_usage_id is not null)
  ),
  unique (workspace_id, idempotency_key),
  unique (reverses_usage_id),
  unique (id, workspace_id),
  unique (id, package_id, lesson_id, workspace_id)
);
create unique index package_usages_one_consumption_idx on public.package_usages (package_id, lesson_id) where kind = 'consumption';
create index package_usages_package_idx on public.package_usages (workspace_id, package_id, created_at);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  payment_id uuid not null,
  lesson_id uuid,
  package_id uuid,
  amount_grosz bigint not null,
  created_at timestamptz not null default now(),
  foreign key (payment_id, workspace_id) references public.payments(id, workspace_id) on delete restrict,
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete restrict,
  foreign key (package_id, workspace_id) references public.packages(id, workspace_id) on delete restrict,
  constraint payment_allocations_target_xor check (num_nonnulls(lesson_id, package_id) = 1),
  constraint payment_allocations_amount_positive check (amount_grosz > 0),
  unique (id, workspace_id)
);
create index payment_allocations_payment_idx on public.payment_allocations (workspace_id, payment_id);
create unique index payment_allocations_lesson_once_idx on public.payment_allocations (payment_id, lesson_id) where lesson_id is not null;
create unique index payment_allocations_package_once_idx on public.payment_allocations (payment_id, package_id) where package_id is not null;

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tutor_id uuid not null,
  kind public.availability_kind not null,
  label text not null default 'Czas niedostępny',
  day_of_week smallint,
  start_time time,
  end_time time,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tutor_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete cascade,
  constraint availability_shape check (
    (kind = 'single' and starts_at is not null and ends_at is not null and ends_at > starts_at)
    or (kind = 'recurring' and day_of_week between 1 and 7 and (all_day or (start_time is not null and end_time is not null and end_time > start_time)))
  ),
  constraint availability_timezone_not_blank check (length(trim(timezone)) > 0),
  unique (id, workspace_id)
);
create index availability_rules_lookup_idx on public.availability_rules (workspace_id, tutor_id, kind, day_of_week);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tutor_id uuid not null,
  exception_date date not null,
  kind public.availability_exception_kind not null,
  start_time time,
  end_time time,
  timezone text not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tutor_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete cascade,
  constraint availability_exceptions_time_range check (
    (start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  unique (workspace_id, tutor_id, exception_date, start_time, end_time),
  unique (id, workspace_id)
);
create unique index availability_exceptions_all_day_idx on public.availability_exceptions (workspace_id, tutor_id, exception_date) where start_time is null;
create unique index availability_exceptions_timed_idx on public.availability_exceptions (workspace_id, tutor_id, exception_date, start_time, end_time) where start_time is not null;

create table public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tutor_id uuid not null,
  title text not null default 'Zajęty',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tutor_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete cascade,
  constraint calendar_blocks_time_range check (ends_at > starts_at),
  unique (id, workspace_id)
);
create index calendar_blocks_lookup_idx on public.calendar_blocks (workspace_id, tutor_id, starts_at, ends_at);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_id uuid,
  tutor_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  status public.booking_status not null default 'pending',
  source public.booking_source not null default 'tutor',
  converted_lesson_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete restrict,
  foreign key (tutor_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete restrict,
  foreign key (converted_lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete restrict,
  constraint bookings_time_range check (ends_at > starts_at),
  constraint bookings_conversion_consistent check ((status = 'converted') = (converted_lesson_id is not null)),
  unique (id, workspace_id)
);
create index bookings_calendar_idx on public.bookings (workspace_id, tutor_id, starts_at) where status in ('pending', 'confirmed');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  status public.notification_status not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (id, workspace_id)
);
create index notifications_user_unread_idx on public.notifications (workspace_id, user_id, created_at desc) where status = 'unread';

create table public.student_stat_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  occurred_at timestamptz not null,
  topic text not null,
  skill text not null,
  score numeric(4,2),
  duration_minutes integer not null,
  attendance_status public.attendance_status not null,
  source_file text not null,
  imported_at timestamptz not null default now(),
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete cascade,
  constraint student_stat_imports_score_range check (score is null or score between 0 and 10),
  constraint student_stat_imports_duration_range check (duration_minutes between 0 and 600),
  unique (id, workspace_id)
);
create index student_stat_imports_student_idx on public.student_stat_imports (workspace_id, student_id, occurred_at desc);

-- Evolve existing integration/queue tables instead of creating duplicates.
alter table public.integration_connections add column workspace_id uuid;
alter table public.integration_connections add column external_account_id text;
alter table public.integration_connections add column settings jsonb not null default '{}'::jsonb;
alter table public.integration_connections add column created_at timestamptz not null default now();
alter table public.google_sync_jobs add column workspace_id uuid;
alter table public.reminder_deliveries add column workspace_id uuid;
alter table public.reminder_deliveries add column student_id uuid;
alter table public.reminder_deliveries add column type text not null default 'lesson_upcoming';
alter table public.reminder_deliveries add column channel public.reminder_channel not null default 'telegram';
alter table public.attachments add column workspace_id uuid;

update public.integration_connections c set workspace_id = w.id
from public.workspaces w where w.owner_user_id = c.teacher_id;
update public.google_sync_jobs j set workspace_id = w.id
from public.workspaces w where w.owner_user_id = j.teacher_id;
update public.reminder_deliveries r set workspace_id = w.id
from public.workspaces w where w.owner_user_id = r.teacher_id;
update public.attachments a set workspace_id = w.id
from public.workspaces w where w.owner_user_id = a.teacher_id;

alter table public.integration_connections alter column workspace_id set not null;
alter table public.google_sync_jobs alter column workspace_id set not null;
alter table public.reminder_deliveries alter column workspace_id set not null;
alter table public.attachments alter column workspace_id set not null;
alter table public.integration_connections add constraint integration_connections_workspace_fk
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;
alter table public.google_sync_jobs add constraint google_sync_jobs_workspace_fk
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;
alter table public.reminder_deliveries add constraint reminder_deliveries_workspace_fk
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;
alter table public.attachments add constraint attachments_workspace_fk
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;
create index integration_connections_workspace_idx on public.integration_connections (workspace_id, provider);
create index google_sync_jobs_workspace_idx on public.google_sync_jobs (workspace_id, lesson_id);
create index reminder_deliveries_workspace_idx on public.reminder_deliveries (workspace_id, lesson_id, scheduled_for);
create index attachments_workspace_idx on public.attachments (workspace_id, created_at desc);

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  );
$$;
revoke all on function private.is_workspace_member(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;

create or replace function private.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'admin')
  );
$$;
revoke all on function private.can_manage_workspace(uuid) from public;
grant execute on function private.can_manage_workspace(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tutor_profiles enable row level security;

create policy workspaces_select_member on public.workspaces for select to authenticated
using ((select private.is_workspace_member(id)));
create policy workspaces_update_manager on public.workspaces for update to authenticated
using ((select private.can_manage_workspace(id)))
with check ((select private.can_manage_workspace(id)));

create policy workspace_members_select_member on public.workspace_members for select to authenticated
using ((select private.is_workspace_member(workspace_id)));
create policy workspace_members_insert_manager on public.workspace_members for insert to authenticated
with check ((select private.can_manage_workspace(workspace_id)));
create policy workspace_members_update_manager on public.workspace_members for update to authenticated
using ((select private.can_manage_workspace(workspace_id)))
with check ((select private.can_manage_workspace(workspace_id)));
create policy workspace_members_delete_manager on public.workspace_members for delete to authenticated
using ((select private.can_manage_workspace(workspace_id)) and user_id <> (select auth.uid()));

create policy tutor_profiles_select_member on public.tutor_profiles for select to authenticated
using ((select private.is_workspace_member(workspace_id)));
create policy tutor_profiles_insert_manager on public.tutor_profiles for insert to authenticated
with check ((select private.can_manage_workspace(workspace_id)));
create policy tutor_profiles_update_self_or_manager on public.tutor_profiles for update to authenticated
using (user_id = (select auth.uid()) or (select private.can_manage_workspace(workspace_id)))
with check (user_id = (select auth.uid()) or (select private.can_manage_workspace(workspace_id)));
create policy tutor_profiles_delete_manager on public.tutor_profiles for delete to authenticated
using ((select private.can_manage_workspace(workspace_id)) and user_id <> (select auth.uid()));

-- Every business table is protected by the same active-workspace boundary.
-- Separate policies keep SELECT/INSERT/UPDATE/DELETE behavior auditable.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'students','contacts','student_contacts','groups','group_members',
    'recurring_lesson_series','lessons','lesson_participants','attendances',
    'lesson_plan_items','plan_item_results','lesson_notes','homeworks',
    'materials','lesson_materials','payments','packages','package_usages',
    'payment_allocations','availability_rules','availability_exceptions',
    'calendar_blocks','bookings','notifications','student_stat_imports'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_workspace_member(workspace_id)))', table_name || '_select_member', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_workspace_member(workspace_id)))', table_name || '_insert_member', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)))', table_name || '_update_member', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_workspace_member(workspace_id)))', table_name || '_delete_member', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

grant delete on public.student_contacts, public.group_members, public.lesson_participants,
  public.attendances, public.lesson_plan_items, public.plan_item_results,
  public.lesson_materials, public.availability_rules, public.availability_exceptions,
  public.calendar_blocks to authenticated;
revoke all on public.workspaces, public.workspace_members, public.tutor_profiles from anon, authenticated;
grant select, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members, public.tutor_profiles to authenticated;

-- Retrofit the same tenant predicate onto existing workspace-scoped tables.
drop policy if exists integration_connections_owner_all on public.integration_connections;
create policy integration_connections_workspace_select on public.integration_connections for select to authenticated
using ((select private.is_workspace_member(workspace_id)));
drop policy if exists google_sync_jobs_owner_select on public.google_sync_jobs;
drop policy if exists google_sync_jobs_owner_insert on public.google_sync_jobs;
drop policy if exists google_sync_jobs_owner_update on public.google_sync_jobs;
create policy google_sync_jobs_workspace_select on public.google_sync_jobs for select to authenticated
using ((select private.is_workspace_member(workspace_id)));
create policy google_sync_jobs_workspace_insert on public.google_sync_jobs for insert to authenticated
with check ((select private.is_workspace_member(workspace_id)));
create policy google_sync_jobs_workspace_update on public.google_sync_jobs for update to authenticated
using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
drop policy if exists reminder_deliveries_owner_select on public.reminder_deliveries;
drop policy if exists reminder_deliveries_owner_insert on public.reminder_deliveries;
drop policy if exists reminder_deliveries_owner_update on public.reminder_deliveries;
drop policy if exists reminder_deliveries_owner_delete on public.reminder_deliveries;
create policy reminder_deliveries_workspace_select on public.reminder_deliveries for select to authenticated
using ((select private.is_workspace_member(workspace_id)));
create policy reminder_deliveries_workspace_insert on public.reminder_deliveries for insert to authenticated
with check ((select private.is_workspace_member(workspace_id)));
create policy reminder_deliveries_workspace_update on public.reminder_deliveries for update to authenticated
using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
create policy reminder_deliveries_workspace_delete on public.reminder_deliveries for delete to authenticated
using ((select private.is_workspace_member(workspace_id)));
drop policy if exists attachments_owner_all on public.attachments;
create policy attachments_workspace_all on public.attachments for all to authenticated
using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));

-- Explicit grants are required because auto_expose_new_tables=false and by the
-- 2026 Supabase Data API default.
grant select on public.workspaces to authenticated;

create or replace function private.sync_legacy_teacher_state(p_teacher_id uuid, p_state jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_timezone text;
  v_student jsonb;
  v_lesson jsonb;
  v_participant jsonb;
  v_plan_item jsonb;
  v_result jsonb;
  v_rule jsonb;
  v_import jsonb;
  v_student_id uuid;
  v_group_id uuid;
  v_series_id uuid;
  v_lesson_id uuid;
  v_participant_id uuid;
  v_starts_at timestamptz;
  v_duration integer;
  v_participant_count integer;
  v_status public.lesson_status;
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> p_teacher_id then
    raise exception 'TENANT_MISMATCH' using errcode = '42501';
  end if;

  select w.id, p.timezone into v_workspace_id, v_timezone
  from public.workspaces w
  join public.profiles p on p.id = w.owner_user_id
  where w.owner_user_id = p_teacher_id
  order by w.created_at
  limit 1;
  if v_workspace_id is null then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  for v_student in select value from jsonb_array_elements(coalesce(p_state->'students', '[]'::jsonb)) loop
    v_student_id := (v_student->>'id')::uuid;
    insert into public.students (
      id, workspace_id, first_name, last_name, display_name, email, phone,
      timezone, status, level, goal, notes, default_lesson_duration_minutes,
      default_lesson_price_grosz, currency, default_format, default_location,
      legacy_contact, created_at, archived_at
    ) values (
      v_student_id, v_workspace_id, v_student->>'name', '', v_student->>'name',
      case when coalesce(v_student->>'contact', '') like '%@%' then nullif(v_student->>'contact', '') end,
      case when coalesce(v_student->>'contact', '') not like '%@%' then nullif(v_student->>'contact', '') end,
      null, (v_student->>'status')::public.student_status,
      nullif(v_student->>'level', ''), nullif(v_student->>'goal', ''), nullif(v_student->>'notes', ''),
      coalesce((v_student->>'defaultDurationMinutes')::integer, 60),
      (v_student->'defaultPrice'->>'amount')::bigint,
      coalesce(v_student->'defaultPrice'->>'currency', 'PLN'),
      coalesce((v_student->>'defaultFormat')::public.lesson_format, 'online'),
      nullif(v_student->>'defaultLocation', ''), nullif(v_student->>'contact', ''),
      coalesce((v_student->>'createdAt')::timestamptz, now()),
      case when v_student->>'status' = 'archived' then now() else null end
    )
    on conflict (id) do update set
      display_name = excluded.display_name,
      first_name = excluded.first_name,
      email = excluded.email,
      phone = excluded.phone,
      status = excluded.status,
      level = excluded.level,
      goal = excluded.goal,
      notes = excluded.notes,
      default_lesson_duration_minutes = excluded.default_lesson_duration_minutes,
      default_lesson_price_grosz = excluded.default_lesson_price_grosz,
      currency = excluded.currency,
      default_format = excluded.default_format,
      default_location = excluded.default_location,
      legacy_contact = excluded.legacy_contact,
      archived_at = case
        when excluded.status = 'archived' then coalesce(public.students.archived_at, now())
        else null
      end,
      updated_at = now()
    where public.students.workspace_id = excluded.workspace_id;
  end loop;

  for v_lesson in select value from jsonb_array_elements(coalesce(p_state->'lessons', '[]'::jsonb)) loop
    v_lesson_id := (v_lesson->>'id')::uuid;
    v_starts_at := (v_lesson->>'startsAt')::timestamptz;
    v_duration := (v_lesson->>'durationMinutes')::integer;
    v_participant_count := jsonb_array_length(coalesce(v_lesson->'participantIds', '[]'::jsonb));
    if v_participant_count = 0 then
      raise exception 'LESSON_PARTICIPANT_REQUIRED';
    end if;
    v_series_id := nullif(v_lesson->>'seriesId', '')::uuid;
    v_group_id := case when v_participant_count > 1 then coalesce(v_series_id, v_lesson_id) end;
    v_student_id := case when v_participant_count = 1 then (v_lesson->'participantIds'->>0)::uuid end;

    if v_group_id is not null then
      insert into public.groups (id, workspace_id, name, status, default_duration_minutes, default_price_grosz, currency, is_ad_hoc)
      values (v_group_id, v_workspace_id, coalesce(nullif(v_lesson->>'topic', ''), 'Grupa ad hoc'), 'active', v_duration,
        (v_lesson->'price'->>'amount')::bigint, coalesce(v_lesson->'price'->>'currency', 'PLN'), true)
      on conflict (id) do update set
        name = excluded.name, default_duration_minutes = excluded.default_duration_minutes,
        default_price_grosz = excluded.default_price_grosz, updated_at = now()
      where public.groups.workspace_id = excluded.workspace_id;

      for v_participant in select value from jsonb_array_elements(v_lesson->'participantIds') loop
        insert into public.group_members (workspace_id, group_id, student_id, status)
        values (v_workspace_id, v_group_id, (trim(both '"' from v_participant::text))::uuid, 'active')
        on conflict (group_id, student_id) do update set status = 'active', left_at = null;
      end loop;
    end if;

    if v_series_id is not null then
      insert into public.recurring_lesson_series (
        id, workspace_id, tutor_id, student_id, group_id, frequency,
        recurrence_interval, days_of_week, starts_on, start_time,
        duration_minutes, timezone, status, effective_from
      ) values (
        v_series_id, v_workspace_id, p_teacher_id, v_student_id, v_group_id, 'weekly', 1,
        array[extract(isodow from v_starts_at at time zone v_timezone)::smallint],
        (v_starts_at at time zone v_timezone)::date,
        (v_starts_at at time zone v_timezone)::time,
        v_duration, v_timezone, 'active', (v_starts_at at time zone v_timezone)::date
      ) on conflict (id) do update set
        student_id = excluded.student_id, group_id = excluded.group_id,
        days_of_week = (select array_agg(distinct day_value order by day_value)
          from unnest(public.recurring_lesson_series.days_of_week || excluded.days_of_week) day_value),
        starts_on = least(public.recurring_lesson_series.starts_on, excluded.starts_on),
        duration_minutes = excluded.duration_minutes, updated_at = now()
      where public.recurring_lesson_series.workspace_id = excluded.workspace_id;
    end if;

    v_status := (v_lesson->>'status')::public.lesson_status;
    insert into public.lessons (
      id, workspace_id, tutor_id, student_id, group_id, title, starts_at, ends_at,
      timezone, status, format, location, price_grosz, currency, billing_type,
      meeting_url, creation_mode, recurring_series_id, recurrence_original_starts_at,
      sync_status, sync_message, created_at, completed_at, cancelled_at
    ) values (
      v_lesson_id, v_workspace_id, p_teacher_id, v_student_id, v_group_id,
      coalesce(v_lesson->>'topic', ''), v_starts_at, v_starts_at + make_interval(mins => v_duration),
      v_timezone, v_status, coalesce((v_lesson->>'format')::public.lesson_format, 'online'),
      case when v_lesson->>'format' = 'offline' then nullif(v_lesson->>'location', '') end,
      (v_lesson->'price'->>'amount')::bigint, coalesce(v_lesson->'price'->>'currency', 'PLN'),
      case when v_participant_count > 1 then 'per_student'::public.lesson_billing_type else 'per_lesson'::public.lesson_billing_type end,
      case when v_lesson->>'format' = 'online' then nullif(v_lesson->>'location', '') end,
      coalesce((v_lesson->>'mode')::public.lesson_creation_mode, 'single'), v_series_id,
      case when v_series_id is not null then v_starts_at end,
      coalesce(v_lesson->>'syncStatus', 'disabled'), nullif(v_lesson->>'syncMessage', ''),
      coalesce((v_lesson->>'createdAt')::timestamptz, now()),
      case when v_status = 'completed' then now() end,
      case when v_status = 'cancelled' then now() end
    ) on conflict (id) do update set
      student_id = excluded.student_id, group_id = excluded.group_id, title = excluded.title,
      starts_at = excluded.starts_at, ends_at = excluded.ends_at, timezone = excluded.timezone,
      status = excluded.status, format = excluded.format, location = excluded.location,
      price_grosz = excluded.price_grosz, currency = excluded.currency,
      billing_type = excluded.billing_type, meeting_url = excluded.meeting_url,
      creation_mode = excluded.creation_mode, recurring_series_id = excluded.recurring_series_id,
      recurrence_original_starts_at = coalesce(public.lessons.recurrence_original_starts_at, excluded.recurrence_original_starts_at),
      sync_status = excluded.sync_status, sync_message = excluded.sync_message,
      completed_at = case when excluded.status = 'completed' then coalesce(public.lessons.completed_at, now()) else null end,
      cancelled_at = case when excluded.status = 'cancelled' then coalesce(public.lessons.cancelled_at, now()) else null end,
      updated_at = now()
    where public.lessons.workspace_id = excluded.workspace_id;

    delete from public.lesson_plan_items where lesson_id = v_lesson_id and workspace_id = v_workspace_id;

    for v_plan_item in select value from jsonb_array_elements(coalesce(v_lesson->'planItems', '[]'::jsonb)) loop
      insert into public.lesson_plan_items (id, workspace_id, lesson_id, position, content)
      values ((v_plan_item->>'id')::uuid, v_workspace_id, v_lesson_id,
        coalesce((v_plan_item->>'position')::integer, 0), v_plan_item->>'text');
    end loop;

    for v_participant in select value from jsonb_array_elements(coalesce(v_lesson->'participants', '[]'::jsonb)) loop
      v_student_id := (v_participant->>'studentId')::uuid;
      insert into public.lesson_participants (workspace_id, lesson_id, student_id, payment_status)
      values (v_workspace_id, v_lesson_id, v_student_id,
        coalesce((v_participant->>'paymentStatus')::public.participant_payment_status, 'unpaid'))
      on conflict (lesson_id, student_id) do update set
        payment_status = excluded.payment_status, updated_at = now()
      returning id into v_participant_id;

      insert into public.attendances (workspace_id, lesson_id, student_id, status, marked_at)
      values (v_workspace_id, v_lesson_id, v_student_id,
        coalesce((v_participant->>'attendanceStatus')::public.attendance_status, 'unknown'),
        case when coalesce(v_participant->>'attendanceStatus', 'unknown') <> 'unknown' then now() end)
      on conflict (lesson_id, student_id) do update set
        status = excluded.status,
        marked_at = case
          when excluded.status = 'unknown' then null
          else coalesce(public.attendances.marked_at, excluded.marked_at)
        end,
        updated_at = now();

      for v_result in select value from jsonb_array_elements(coalesce(v_participant->'results', '[]'::jsonb)) loop
        insert into public.plan_item_results (
          workspace_id, lesson_participant_id, plan_item_id, completed, score, note
        ) values (
          v_workspace_id, v_participant_id, (v_result->>'planItemId')::uuid,
          coalesce((v_result->>'completed')::boolean, false),
          (v_result->>'score')::smallint, nullif(v_result->>'note', '')
        );
      end loop;
    end loop;

    delete from public.lesson_participants participant
    where participant.lesson_id = v_lesson_id
      and participant.workspace_id = v_workspace_id
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(v_lesson->'participants', '[]'::jsonb)) current_participant
        where (current_participant->>'studentId')::uuid = participant.student_id
      );

    insert into public.homeworks (workspace_id, lesson_id, student_id, group_id, title, description, status)
    values (v_workspace_id, v_lesson_id,
      (select student_id from public.lessons where id = v_lesson_id),
      (select group_id from public.lessons where id = v_lesson_id),
      'Praca domowa', coalesce(v_lesson->>'homework', ''), 'assigned')
    on conflict (lesson_id) do update set description = excluded.description, updated_at = now();

    insert into public.lesson_notes (workspace_id, lesson_id, author_user_id, content, visibility, note_type)
    values (v_workspace_id, v_lesson_id, p_teacher_id, coalesce(v_lesson->>'generalNotes', ''), 'private', 'general')
    on conflict (lesson_id, author_user_id, note_type) do update set content = excluded.content, updated_at = now();
  end loop;

  delete from public.availability_rules where workspace_id = v_workspace_id and tutor_id = p_teacher_id;
  for v_rule in select value from jsonb_array_elements(coalesce(p_state->'availability', '[]'::jsonb)) loop
    insert into public.availability_rules (
      id, workspace_id, tutor_id, kind, label, day_of_week, start_time, end_time,
      starts_at, ends_at, timezone, all_day
    ) values (
      (v_rule->>'id')::uuid, v_workspace_id, p_teacher_id,
      (v_rule->>'kind')::public.availability_kind, coalesce(v_rule->>'label', 'Czas niedostępny'),
      (v_rule->>'weekday')::smallint,
      case when v_rule->>'kind' = 'recurring' then ((v_rule->>'start')::timestamptz at time zone v_timezone)::time end,
      case when v_rule->>'kind' = 'recurring' then ((v_rule->>'end')::timestamptz at time zone v_timezone)::time end,
      case when v_rule->>'kind' = 'single' then (v_rule->>'start')::timestamptz end,
      case when v_rule->>'kind' = 'single' then (v_rule->>'end')::timestamptz end,
      v_timezone, coalesce((v_rule->>'allDay')::boolean, false)
    );
  end loop;

  for v_import in select value from jsonb_array_elements(coalesce(p_state->'studentStatImports', '[]'::jsonb)) loop
    insert into public.student_stat_imports (
      id, workspace_id, student_id, occurred_at, topic, skill, score,
      duration_minutes, attendance_status, source_file, imported_at
    ) values (
      (v_import->>'id')::uuid, v_workspace_id, (v_import->>'studentId')::uuid,
      (v_import->>'occurredAt')::timestamptz, coalesce(v_import->>'topic', ''),
      coalesce(v_import->>'skill', ''), (v_import->>'score')::numeric,
      coalesce((v_import->>'durationMinutes')::integer, 0),
      (v_import->>'attendanceStatus')::public.attendance_status,
      coalesce(v_import->>'sourceFile', 'import.csv'),
      coalesce((v_import->>'importedAt')::timestamptz, now())
    ) on conflict (id) do update set
      occurred_at = excluded.occurred_at, topic = excluded.topic, skill = excluded.skill,
      score = excluded.score, duration_minutes = excluded.duration_minutes,
      attendance_status = excluded.attendance_status, source_file = excluded.source_file;
  end loop;
end;
$$;
revoke all on function private.sync_legacy_teacher_state(uuid, jsonb) from public;
grant execute on function private.sync_legacy_teacher_state(uuid, jsonb) to authenticated, service_role;

-- Backfill the relational model before switching application reads.
do $$
declare state_row record;
begin
  for state_row in select teacher_id, state from public.teacher_states loop
    perform private.sync_legacy_teacher_state(state_row.teacher_id, state_row.state);
  end loop;
end;
$$;

create or replace function public.update_teacher_state(expected_version bigint, new_state jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare new_version bigint;
begin
  update public.teacher_states
  set state = new_state, version = version + 1, updated_at = now()
  where teacher_id = (select auth.uid()) and version = expected_version
  returning version into new_version;
  if new_version is null then
    raise exception 'STATE_VERSION_CONFLICT' using errcode = '40001';
  end if;
  perform private.sync_legacy_teacher_state((select auth.uid()), new_state);
  return new_version;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare workspace_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into public.subscriptions (teacher_id, trial_ends_at)
  values (new.id, now() + interval '14 days');
  insert into public.teacher_states (teacher_id) values (new.id);
  insert into public.workspaces (name, owner_user_id, timezone)
  values (
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, 'Tutor'), '@', 1)) || ' workspace',
    new.id,
    'Europe/Warsaw'
  ) returning id into workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (workspace_id, new.id, 'owner', 'active');
  insert into public.tutor_profiles (id, workspace_id, user_id, display_name, timezone)
  values (new.id, workspace_id, new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'Europe/Warsaw');
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

-- Existing operational records now point at normalized lessons. NOT VALID
-- avoids blocking deployment if historic queue rows are already orphaned;
-- all new writes are still checked by PostgreSQL.
alter table public.google_sync_jobs add constraint google_sync_jobs_lesson_workspace_fk
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete cascade not valid;
alter table public.reminder_deliveries add constraint reminder_deliveries_lesson_workspace_fk
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete cascade not valid;
alter table public.reminder_deliveries add constraint reminder_deliveries_student_workspace_fk
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete cascade not valid;
alter table public.attachments add constraint attachments_lesson_workspace_fk
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete set null not valid;
alter table public.attachments add constraint attachments_student_workspace_fk
  foreign key (student_id, workspace_id) references public.students(id, workspace_id) on delete set null (student_id) not valid;
alter table public.attachments drop constraint attachments_lesson_workspace_fk;
alter table public.attachments add constraint attachments_lesson_workspace_fk
  foreign key (lesson_id, workspace_id) references public.lessons(id, workspace_id) on delete set null (lesson_id) not valid;
alter table public.integration_connections add constraint integration_connections_tutor_workspace_fk
  foreign key (teacher_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete cascade not valid;
alter table public.google_sync_jobs add constraint google_sync_jobs_tutor_workspace_fk
  foreign key (teacher_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete cascade not valid;
alter table public.reminder_deliveries add constraint reminder_deliveries_tutor_workspace_fk
  foreign key (teacher_id, workspace_id) references public.tutor_profiles(id, workspace_id) on delete cascade not valid;

create or replace function private.enforce_payment_allocation_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare payment_total bigint;
declare allocated_total bigint;
begin
  select amount_grosz into payment_total
  from public.payments
  where id = new.payment_id and workspace_id = new.workspace_id
  for update;
  if payment_total is null then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select coalesce(sum(amount_grosz), 0) into allocated_total
  from public.payment_allocations
  where payment_id = new.payment_id and id <> new.id;
  if allocated_total + new.amount_grosz > payment_total then
    raise exception 'PAYMENT_OVER_ALLOCATED' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_payment_allocation_total() from public;
create trigger payment_allocations_total_guard
before insert or update on public.payment_allocations
for each row execute function private.enforce_payment_allocation_total();

create or replace function public.complete_lesson_with_package(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_student_id uuid,
  p_package_id uuid,
  p_idempotency_key text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare total_units integer;
declare used_units integer;
declare existing_usage uuid;
declare current_lesson_status public.lesson_status;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  select total_lessons into total_units
  from public.packages
  where id = p_package_id and workspace_id = p_workspace_id
    and student_id = p_student_id and status in ('active', 'exhausted')
  for update;
  if total_units is null then raise exception 'PACKAGE_NOT_FOUND'; end if;
  select lesson.status into current_lesson_status
  from public.lessons lesson
  join public.lesson_participants participant
    on participant.lesson_id = lesson.id and participant.workspace_id = lesson.workspace_id
  where lesson.workspace_id = p_workspace_id and lesson.id = p_lesson_id
    and participant.student_id = p_student_id
  for update of lesson;
  if current_lesson_status is null then raise exception 'LESSON_PARTICIPANT_NOT_FOUND'; end if;
  if current_lesson_status = 'cancelled' then raise exception 'CANCELLED_LESSON_CANNOT_BE_COMPLETED'; end if;

  select id into existing_usage from public.package_usages
  where workspace_id = p_workspace_id and package_id = p_package_id
    and lesson_id = p_lesson_id and kind = 'consumption';
  if existing_usage is null then
    select coalesce(sum(case when kind = 'consumption' then units else -units end), 0)::integer
    into used_units
    from public.package_usages
    where workspace_id = p_workspace_id and package_id = p_package_id;
    if used_units >= total_units then raise exception 'PACKAGE_EXHAUSTED' using errcode = '23514'; end if;
    insert into public.package_usages (
      workspace_id, package_id, lesson_id, kind, units, idempotency_key
    ) values (p_workspace_id, p_package_id, p_lesson_id, 'consumption', 1, p_idempotency_key);
    used_units := used_units + 1;
  else
    select coalesce(sum(case when kind = 'consumption' then units else -units end), 0)::integer
    into used_units from public.package_usages
    where workspace_id = p_workspace_id and package_id = p_package_id;
  end if;

  update public.lessons set status = 'completed', completed_at = coalesce(completed_at, now()),
    cancelled_at = null, updated_at = now()
  where id = p_lesson_id and workspace_id = p_workspace_id;
  update public.packages set status = case
      when used_units >= total_units then 'exhausted'::public.package_status
      else 'active'::public.package_status
    end,
    updated_at = now()
  where id = p_package_id and workspace_id = p_workspace_id;
  return greatest(total_units - used_units, 0);
end;
$$;
revoke all on function public.complete_lesson_with_package(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.complete_lesson_with_package(uuid, uuid, uuid, uuid, text) to authenticated;

create or replace function public.reverse_lesson_package_usage(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_package_id uuid,
  p_idempotency_key text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare total_units integer;
declare used_units integer;
declare consumption_id uuid;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  select total_lessons into total_units from public.packages
  where id = p_package_id and workspace_id = p_workspace_id for update;
  select id into consumption_id from public.package_usages
  where workspace_id = p_workspace_id and package_id = p_package_id
    and lesson_id = p_lesson_id and kind = 'consumption';
  if consumption_id is null then raise exception 'PACKAGE_USAGE_NOT_FOUND'; end if;
  insert into public.package_usages (
    workspace_id, package_id, lesson_id, kind, units, reverses_usage_id, idempotency_key
  ) values (p_workspace_id, p_package_id, p_lesson_id, 'reversal', 1, consumption_id, p_idempotency_key)
  on conflict (reverses_usage_id) do nothing;
  select coalesce(sum(case when kind = 'consumption' then units else -units end), 0)::integer
  into used_units from public.package_usages
  where workspace_id = p_workspace_id and package_id = p_package_id;
  update public.packages set status = 'active', updated_at = now()
  where id = p_package_id and workspace_id = p_workspace_id;
  update public.lessons set status = 'needs_completion', completed_at = null, updated_at = now()
  where id = p_lesson_id and workspace_id = p_workspace_id and status = 'completed';
  return greatest(total_units - used_units, 0);
end;
$$;
revoke all on function public.reverse_lesson_package_usage(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.reverse_lesson_package_usage(uuid, uuid, uuid, text) to authenticated;

create view public.package_balances
with (security_invoker = true)
as
select
  package.id as package_id,
  package.workspace_id,
  package.student_id,
  package.total_lessons,
  coalesce(sum(case when usage.kind = 'consumption' then usage.units else -usage.units end), 0)::integer as used_lessons,
  greatest(package.total_lessons - coalesce(sum(case when usage.kind = 'consumption' then usage.units else -usage.units end), 0), 0)::integer as remaining_lessons
from public.packages package
left join public.package_usages usage on usage.package_id = package.id and usage.workspace_id = package.workspace_id
group by package.id, package.workspace_id, package.student_id, package.total_lessons;
revoke all on public.package_balances from anon, authenticated;
grant select on public.package_balances to authenticated;

-- Workspace ownership cannot be reassigned through the Data API in Stage 0.
revoke update on public.workspaces from authenticated;
grant update (name, timezone, currency, locale, updated_at) on public.workspaces to authenticated;

-- Keep tutor/workspace settings aligned with the existing profile update path.
create or replace function private.sync_profile_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tutor_profiles set display_name = new.full_name, timezone = new.timezone, updated_at = now()
  where user_id = new.id;
  update public.workspaces set timezone = new.timezone, updated_at = now()
  where owner_user_id = new.id;
  return new;
end;
$$;
revoke all on function private.sync_profile_defaults() from public;
create trigger profiles_sync_workspace_defaults
after update of full_name, timezone on public.profiles
for each row execute function private.sync_profile_defaults();
