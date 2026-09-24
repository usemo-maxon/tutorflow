-- L0.10: harden the existing Stage 4 finance lifecycle without changing its
-- ledger model. All functions remain security invoker and therefore retain RLS.

create or replace function private.normalize_lesson_billing_type()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- The scheduling UI supplies one snapshot price. For a group that price is
  -- per participant; persist the semantic billing type instead of per_lesson.
  if new.group_id is not null and new.student_id is null and new.billing_type = 'per_lesson' then
    new.billing_type := 'per_student';
  end if;
  return new;
end;
$$;
revoke all on function private.normalize_lesson_billing_type() from public;

create trigger lessons_normalize_billing_type
before insert or update of student_id, group_id, billing_type on public.lessons
for each row execute function private.normalize_lesson_billing_type();

update public.lessons
set billing_type = 'per_student'
where group_id is not null
  and student_id is null
  and billing_type = 'per_lesson'
  and status in ('scheduled', 'needs_completion');

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
declare
  package_row public.packages%rowtype;
  lesson_row public.lessons%rowtype;
  used_units integer;
  existing_usage uuid;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  select * into package_row
  from public.packages
  where id = p_package_id
    and workspace_id = p_workspace_id
    and student_id = p_student_id
  for update;
  if package_row.id is null then raise exception 'PACKAGE_NOT_FOUND'; end if;

  select lesson.* into lesson_row
  from public.lessons lesson
  join public.lesson_participants participant
    on participant.lesson_id = lesson.id
    and participant.workspace_id = lesson.workspace_id
  where lesson.workspace_id = p_workspace_id
    and lesson.id = p_lesson_id
    and participant.student_id = p_student_id
  for update of lesson;
  if lesson_row.id is null then raise exception 'LESSON_PARTICIPANT_NOT_FOUND'; end if;
  if lesson_row.status = 'cancelled' then raise exception 'CANCELLED_LESSON_CANNOT_BE_COMPLETED'; end if;
  if lesson_row.billing_type <> 'package'
    or lesson_row.student_id is null
    or lesson_row.student_id <> p_student_id
    or lesson_row.group_id is not null then
    raise exception 'PACKAGE_REQUIRES_SINGLE_STUDENT' using errcode = '23514';
  end if;

  select id into existing_usage
  from public.package_usages
  where workspace_id = p_workspace_id
    and package_id = p_package_id
    and lesson_id = p_lesson_id
    and kind = 'consumption';

  select coalesce(sum(case when kind = 'consumption' then units else -units end), 0)::integer
  into used_units
  from public.package_usages
  where workspace_id = p_workspace_id and package_id = p_package_id;

  if existing_usage is null then
    if package_row.status <> 'active'
      or (package_row.expires_at is not null and package_row.expires_at < now())
      or used_units >= package_row.total_lessons then
      raise exception 'PACKAGE_EXHAUSTED' using errcode = '23514';
    end if;
    insert into public.package_usages (
      workspace_id, package_id, lesson_id, kind, units, idempotency_key
    ) values (p_workspace_id, p_package_id, p_lesson_id, 'consumption', 1, p_idempotency_key);
    used_units := used_units + 1;
  end if;

  update public.lessons
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      cancelled_at = null,
      updated_at = now()
  where id = p_lesson_id and workspace_id = p_workspace_id;

  update public.packages
  set status = case
      when used_units >= total_lessons then 'exhausted'::public.package_status
      else 'active'::public.package_status
    end,
    updated_at = now()
  where id = p_package_id and workspace_id = p_workspace_id;

  return greatest(package_row.total_lessons - used_units, 0);
end;
$$;
revoke all on function public.complete_lesson_with_package(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.complete_lesson_with_package(uuid, uuid, uuid, uuid, text) to authenticated;

create or replace function public.complete_lesson_workspace(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lesson_row public.lessons%rowtype;
  package_row public.packages%rowtype;
  participant_row record;
  participant_count integer;
  unresolved_count integer;
  remaining_units integer;
  due_days integer;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  select * into lesson_row
  from public.lessons
  where id = p_lesson_id and workspace_id = p_workspace_id
  for update;
  if lesson_row.id is null then raise exception 'LESSON_NOT_FOUND'; end if;
  if lesson_row.status = 'cancelled' then raise exception 'CANCELLED_LESSON_CANNOT_BE_COMPLETED'; end if;
  if lesson_row.status = 'no_show' then raise exception 'NO_SHOW_LESSON_CANNOT_BE_COMPLETED'; end if;
  if lesson_row.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'remainingLessons', null);
  end if;

  select count(*)::integer into unresolved_count
  from public.lesson_participants participant
  left join public.attendances attendance
    on attendance.lesson_id = participant.lesson_id
    and attendance.student_id = participant.student_id
    and attendance.workspace_id = participant.workspace_id
  where participant.workspace_id = p_workspace_id
    and participant.lesson_id = p_lesson_id
    and (attendance.id is null or attendance.status = 'unknown');
  if unresolved_count > 0 then raise exception 'ATTENDANCE_REQUIRED' using errcode = '23514'; end if;

  select count(*)::integer into participant_count
  from public.lesson_participants
  where workspace_id = p_workspace_id and lesson_id = p_lesson_id;
  select payment_due_days into due_days from public.workspaces where id = p_workspace_id;

  if lesson_row.billing_type = 'package' then
    if lesson_row.student_id is null or lesson_row.group_id is not null or participant_count <> 1 then
      raise exception 'PACKAGE_REQUIRES_SINGLE_STUDENT' using errcode = '23514';
    end if;
    select * into package_row
    from public.packages
    where workspace_id = p_workspace_id
      and student_id = lesson_row.student_id
      and status = 'active'
      and (expires_at is null or expires_at >= now())
    order by expires_at asc nulls last, purchased_at, created_at, id
    limit 1
    for update;
    if package_row.id is null then
      raise exception 'PACKAGE_EXHAUSTED' using errcode = '23514';
    end if;
    remaining_units := public.complete_lesson_with_package(
      p_workspace_id,
      p_lesson_id,
      lesson_row.student_id,
      package_row.id,
      p_idempotency_key
    );
  else
    if lesson_row.billing_type = 'per_lesson' and participant_count <> 1 then
      raise exception 'PER_LESSON_REQUIRES_SINGLE_STUDENT' using errcode = '23514';
    end if;

    update public.lessons
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        cancelled_at = null,
        updated_at = now()
    where id = p_lesson_id and workspace_id = p_workspace_id;

    if lesson_row.billing_type in ('per_lesson', 'per_student')
      and coalesce(lesson_row.price_grosz, 0) > 0 then
      for participant_row in
        select student_id
        from public.lesson_participants
        where workspace_id = p_workspace_id and lesson_id = p_lesson_id
        order by student_id
      loop
        insert into public.charges (
          workspace_id, student_id, lesson_id, type, description,
          amount_grosz, currency, due_at
        ) values (
          p_workspace_id, participant_row.student_id, p_lesson_id, 'lesson',
          coalesce(nullif(lesson_row.title, ''), 'Lekcja'), lesson_row.price_grosz,
          lesson_row.currency, now() + make_interval(days => due_days)
        ) on conflict do nothing;
      end loop;
    end if;
  end if;

  return jsonb_build_object('status', 'completed', 'remainingLessons', remaining_units);
end;
$$;
revoke all on function public.complete_lesson_workspace(uuid, uuid, text) from public, anon;
grant execute on function public.complete_lesson_workspace(uuid, uuid, text) to authenticated;

create or replace function public.record_student_payment(
  p_workspace_id uuid,
  p_student_id uuid,
  p_amount_grosz bigint,
  p_currency text,
  p_paid_at timestamptz,
  p_payment_method text,
  p_note text,
  p_allocations jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payment_row public.payments%rowtype;
  allocation_row jsonb;
  charge_row public.charges%rowtype;
  requested bigint;
  payment_allocated bigint := 0;
  charge_allocated bigint;
  requested_allocations jsonb;
  stored_allocations jsonb;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_amount_grosz <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023'; end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'INVALID_CURRENCY' using errcode = '22023'; end if;
  if p_payment_method not in ('cash', 'bank_transfer', 'card_external', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_ALLOCATIONS' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.students where id = p_student_id and workspace_id = p_workspace_id
  ) then raise exception 'STUDENT_NOT_FOUND'; end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) value
    group by value->>'chargeId'
    having count(*) > 1
  ) then raise exception 'DUPLICATE_ALLOCATION_TARGET' using errcode = '22023'; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('chargeId', normalized.charge_id::text, 'amountGrosz', normalized.amount_grosz)
      order by normalized.charge_id
    ),
    '[]'::jsonb
  ) into requested_allocations
  from (
    select (value->>'chargeId')::uuid as charge_id,
      (value->>'amountGrosz')::bigint as amount_grosz
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) value
  ) normalized;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_idempotency_key, 0));
  select * into payment_row
  from public.payments
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key
  for update;
  if payment_row.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object('chargeId', allocation.charge_id::text, 'amountGrosz', allocation.amount_grosz)
        order by allocation.charge_id
      ),
      '[]'::jsonb
    ) into stored_allocations
    from public.payment_allocations allocation
    where allocation.workspace_id = p_workspace_id and allocation.payment_id = payment_row.id;

    if payment_row.student_id <> p_student_id
      or payment_row.amount_grosz <> p_amount_grosz
      or payment_row.currency <> p_currency
      or payment_row.paid_at is distinct from p_paid_at
      or payment_row.payment_method is distinct from p_payment_method
      or payment_row.note is distinct from nullif(trim(p_note), '')
      or stored_allocations <> requested_allocations then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23514';
    end if;
    return payment_row.id;
  end if;

  insert into public.payments (
    workspace_id, student_id, amount_grosz, currency, status,
    payment_method, paid_at, note, idempotency_key
  ) values (
    p_workspace_id, p_student_id, p_amount_grosz, p_currency, 'paid',
    p_payment_method, p_paid_at, nullif(trim(p_note), ''), p_idempotency_key
  ) returning * into payment_row;

  for allocation_row in
    select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
    order by value->>'chargeId'
  loop
    requested := (allocation_row->>'amountGrosz')::bigint;
    if requested <= 0 then raise exception 'INVALID_ALLOCATION_AMOUNT' using errcode = '22023'; end if;
    select * into charge_row
    from public.charges
    where id = (allocation_row->>'chargeId')::uuid and workspace_id = p_workspace_id
    for update;
    if charge_row.id is null or charge_row.student_id <> p_student_id then
      raise exception 'CHARGE_NOT_FOUND';
    end if;
    if charge_row.status = 'cancelled' then raise exception 'CHARGE_CANCELLED'; end if;
    if charge_row.currency <> p_currency then raise exception 'CURRENCY_MISMATCH' using errcode = '23514'; end if;
    select coalesce(sum(allocation.amount_grosz), 0)::bigint into charge_allocated
    from public.payment_allocations allocation
    join public.payments payment
      on payment.id = allocation.payment_id and payment.workspace_id = allocation.workspace_id
    where allocation.workspace_id = p_workspace_id
      and allocation.charge_id = charge_row.id
      and payment.status = 'paid';
    if requested > charge_row.amount_grosz - charge_allocated then
      raise exception 'CHARGE_OVERALLOCATION' using errcode = '23514';
    end if;
    payment_allocated := payment_allocated + requested;
    if payment_allocated > p_amount_grosz then
      raise exception 'PAYMENT_OVERALLOCATION' using errcode = '23514';
    end if;
    insert into public.payment_allocations (
      workspace_id, payment_id, charge_id, amount_grosz
    ) values (p_workspace_id, payment_row.id, charge_row.id, requested);
    update public.charges
    set status = case
        when charge_allocated + requested = amount_grosz then 'settled'::public.charge_status
        else 'partial'::public.charge_status
      end,
      settled_at = case when charge_allocated + requested = amount_grosz then now() else null end,
      updated_at = now()
    where id = charge_row.id and workspace_id = p_workspace_id;
  end loop;
  return payment_row.id;
end;
$$;
revoke all on function public.record_student_payment(uuid, uuid, bigint, text, timestamptz, text, text, jsonb, text) from public, anon;
grant execute on function public.record_student_payment(uuid, uuid, bigint, text, timestamptz, text, text, jsonb, text) to authenticated;

create or replace function public.create_student_package(
  p_workspace_id uuid,
  p_student_id uuid,
  p_name text,
  p_total_lessons integer,
  p_price_grosz bigint,
  p_currency text,
  p_purchased_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  package_row public.packages%rowtype;
  due_days integer;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if length(trim(p_name)) = 0 then raise exception 'INVALID_PACKAGE_NAME' using errcode = '22023'; end if;
  if p_total_lessons <= 0 then raise exception 'INVALID_PACKAGE_LESSONS' using errcode = '22023'; end if;
  if p_price_grosz < 0 then raise exception 'INVALID_PACKAGE_PRICE' using errcode = '22023'; end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'INVALID_CURRENCY' using errcode = '22023'; end if;
  if p_expires_at is not null and p_expires_at < p_purchased_at then
    raise exception 'INVALID_PACKAGE_DATES' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_idempotency_key, 0));
  select * into package_row
  from public.packages
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key
  for update;
  if package_row.id is not null then
    if package_row.student_id <> p_student_id
      or package_row.name <> trim(p_name)
      or package_row.total_lessons <> p_total_lessons
      or package_row.price_grosz <> p_price_grosz
      or package_row.currency <> p_currency
      or package_row.purchased_at is distinct from p_purchased_at
      or package_row.expires_at is distinct from p_expires_at then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23514';
    end if;
    return package_row.id;
  end if;

  if not exists (
    select 1 from public.students
    where id = p_student_id and workspace_id = p_workspace_id and status = 'active'
  ) then raise exception 'STUDENT_NOT_ACTIVE' using errcode = '23514'; end if;

  select payment_due_days into due_days from public.workspaces where id = p_workspace_id;
  insert into public.packages (
    workspace_id, student_id, name, total_lessons, price_grosz, currency,
    purchased_at, expires_at, idempotency_key
  ) values (
    p_workspace_id, p_student_id, trim(p_name), p_total_lessons, p_price_grosz,
    p_currency, p_purchased_at, p_expires_at, p_idempotency_key
  ) returning * into package_row;
  if p_price_grosz > 0 then
    insert into public.charges (
      workspace_id, student_id, package_id, type, description,
      amount_grosz, currency, due_at
    ) values (
      p_workspace_id, p_student_id, package_row.id, 'package', trim(p_name),
      p_price_grosz, p_currency, p_purchased_at + make_interval(days => due_days)
    );
  end if;
  return package_row.id;
end;
$$;
revoke all on function public.create_student_package(uuid, uuid, text, integer, bigint, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.create_student_package(uuid, uuid, text, integer, bigint, text, timestamptz, timestamptz, text) to authenticated;

create or replace function public.finance_summary(
  p_workspace_id uuid,
  p_currency text,
  p_month_start timestamptz,
  p_student_id uuid default null
)
returns table (
  outstanding_grosz bigint,
  overdue_grosz bigint,
  received_this_month_grosz bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  return query
  select
    coalesce((
      select sum(balance.outstanding_grosz)::bigint
      from public.charge_balances balance
      where balance.workspace_id = p_workspace_id
        and balance.currency = p_currency
        and balance.status <> 'cancelled'
        and balance.outstanding_grosz > 0
        and (p_student_id is null or balance.student_id = p_student_id)
    ), 0)::bigint,
    coalesce((
      select sum(balance.outstanding_grosz)::bigint
      from public.charge_balances balance
      where balance.workspace_id = p_workspace_id
        and balance.currency = p_currency
        and balance.status <> 'cancelled'
        and balance.outstanding_grosz > 0
        and balance.is_overdue
        and (p_student_id is null or balance.student_id = p_student_id)
    ), 0)::bigint,
    coalesce((
      select sum(payment.amount_grosz)::bigint
      from public.payments payment
      where payment.workspace_id = p_workspace_id
        and payment.currency = p_currency
        and payment.status = 'paid'
        and payment.paid_at >= p_month_start
        and (p_student_id is null or payment.student_id = p_student_id)
    ), 0)::bigint;
end;
$$;
revoke all on function public.finance_summary(uuid, text, timestamptz, uuid) from public, anon;
grant execute on function public.finance_summary(uuid, text, timestamptz, uuid) to authenticated;
