create table public.product_tour_states (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tour_key text not null default 'main',
  version integer not null check (version > 0),
  status text not null check (
    status in ('not_started', 'in_progress', 'completed', 'skipped', 'invitation_dismissed')
  ),
  current_step integer not null default 0 check (current_step >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.product_tour_states is
  'Per-user, versioned product-tour progress. This is independent from setup onboarding.';

-- Accounts that existed before this feature must not receive a surprise prompt.
insert into public.product_tour_states (user_id, version, status)
select id, 1, 'invitation_dismissed'
from public.profiles
on conflict (user_id) do nothing;

alter table public.product_tour_states enable row level security;

create policy product_tour_states_owner_select
on public.product_tour_states for select to authenticated
using (user_id = (select auth.uid()));

create policy product_tour_states_owner_insert
on public.product_tour_states for insert to authenticated
with check (user_id = (select auth.uid()));

create policy product_tour_states_owner_update
on public.product_tour_states for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update on public.product_tour_states to authenticated;

