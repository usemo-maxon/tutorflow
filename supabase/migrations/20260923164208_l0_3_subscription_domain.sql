-- L0.3 separates product tier from billing cadence while retaining the
-- legacy subscriptions.plan column for deployment compatibility.

create or replace function private.subscription_tier_from_legacy_plan(
  legacy_plan text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case legacy_plan
    when 'trial' then 'free'
    when 'monthly' then 'pro'
    when 'annual' then 'pro'
    when 'founder' then 'founder'
  end;
$$;

create or replace function private.billing_interval_from_legacy_plan(
  legacy_plan text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case legacy_plan
    when 'trial' then null
    when 'monthly' then 'monthly'
    when 'annual' then 'annual'
    when 'founder' then 'monthly'
  end;
$$;

revoke all on function private.subscription_tier_from_legacy_plan(text)
from public;
revoke all on function private.billing_interval_from_legacy_plan(text)
from public;

alter table public.subscriptions
  add column tier text,
  add column billing_interval text;

update public.subscriptions
set tier = private.subscription_tier_from_legacy_plan(plan),
    billing_interval = private.billing_interval_from_legacy_plan(plan);

alter table public.subscriptions
  alter column tier set not null,
  add constraint subscriptions_tier_check
    check (tier in ('free', 'pro', 'founder')),
  add constraint subscriptions_billing_interval_check
    check (billing_interval in ('monthly', 'annual') or billing_interval is null);

create or replace function public.confirm_payu_order(
  p_ext_order_id text,
  p_payu_order_id text
)
returns table (teacher_id uuid, plan text, founder_awarded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare target public.payu_orders%rowtype;
declare award_founder boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('tutorflow-founder-slots'));
  select *
  into target
  from public.payu_orders
  where ext_order_id = p_ext_order_id
  for update;

  if target.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if target.status = 'completed' then
    return query
    select target.teacher_id, target.plan, target.founder_awarded;
    return;
  end if;

  -- payu_orders.plan remains the monthly/annual checkout product identifier.
  if target.plan = 'monthly' and (
    select count(*)
    from public.subscriptions as subscription
    where subscription.plan = 'founder'
      and subscription.status = 'active'
  ) < 50 then
    award_founder := true;
  end if;

  update public.payu_orders
  set status = 'completed',
      payu_order_id = p_payu_order_id,
      founder_awarded = award_founder,
      updated_at = now()
  where id = target.id;

  update public.subscriptions
  set status = 'active',
      read_only = false,
      plan = case when award_founder then 'founder' else target.plan end,
      tier = case when award_founder then 'founder' else 'pro' end,
      billing_interval = case
        when award_founder then 'monthly'
        else target.plan
      end,
      renews_at = case
        when target.plan = 'annual' then now() + interval '1 year'
        else now() + interval '1 month'
      end,
      updated_at = now()
  where subscriptions.teacher_id = target.teacher_id;

  return query
  select
    target.teacher_id,
    case when award_founder then 'founder' else target.plan end,
    award_founder;
end;
$$;

revoke all on function public.confirm_payu_order(text, text)
from public, anon, authenticated;
grant execute on function public.confirm_payu_order(text, text) to service_role;

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
  insert into public.subscriptions (
    teacher_id,
    status,
    plan,
    tier,
    billing_interval,
    trial_ends_at
  ) values (
    new.id,
    'trial',
    'trial',
    'free',
    null,
    now() + interval '14 days'
  );
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
