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
