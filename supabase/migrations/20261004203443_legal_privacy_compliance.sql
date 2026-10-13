create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('terms')),
  document_version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document_type, document_version)
);
alter table public.legal_acceptances enable row level security;
create policy "Users read own legal acceptances" on public.legal_acceptances for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.legal_acceptances from anon;
grant select on public.legal_acceptances to authenticated;

create table public.cookie_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  consent_version text not null,
  preferences boolean not null default false,
  analytics boolean not null default false,
  marketing boolean not null default false,
  recorded_at timestamptz not null default now()
);
alter table public.cookie_consents enable row level security;
create policy "Users manage own cookie consents" on public.cookie_consents for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.cookie_consents from anon;
grant select, insert, update on public.cookie_consents to authenticated;

create table public.illegal_content_reports (
  id uuid primary key default gen_random_uuid(),
  content_url text not null,
  description text not null,
  legal_reason text not null,
  reporter_email text not null,
  additional_info text not null default '',
  status text not null default 'received' check (status in ('received','reviewing','resolved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.illegal_content_reports enable row level security;
revoke all on public.illegal_content_reports from anon, authenticated;
