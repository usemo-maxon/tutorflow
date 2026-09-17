-- Stage 4: relational receivables, transactional payments and package purchase.

create type public.charge_type as enum ('lesson', 'package', 'manual');
create type public.charge_status as enum ('open', 'partial', 'settled', 'cancelled');

alter table public.workspaces
  add column payment_due_days integer not null default 7
  constraint workspaces_payment_due_days_range check (payment_due_days between 0 and 90);

alter table public.payments add column note text;
alter table public.payments add column idempotency_key text;
alter table public.payments
  add constraint payments_method_valid check (
    payment_method is null or payment_method in ('cash', 'bank_transfer', 'card_external', 'other')
  );
create unique index payments_workspace_idempotency_idx
  on public.payments (workspace_id, idempotency_key)
  where idempotency_key is not null;

alter table public.packages add column idempotency_key text;
create unique index packages_workspace_idempotency_idx
  on public.packages (workspace_id, idempotency_key)
  where idempotency_key is not null;

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  student_id uuid not null,
  lesson_id uuid,
  package_id uuid,
  type public.charge_type not null,
  description text not null,
  amount_grosz bigint not null,
  currency text not null,
  status public.charge_status not null default 'open',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  foreign key (student_id, workspace_id)
    references public.students(id, workspace_id) on delete restrict,
  foreign key (lesson_id, workspace_id)
    references public.lessons(id, workspace_id) on delete restrict,
  foreign key (package_id, workspace_id)
    references public.packages(id, workspace_id) on delete restrict,
  constraint charges_description_not_blank check (length(trim(description)) > 0),
  constraint charges_amount_positive check (amount_grosz > 0),
  constraint charges_currency_iso check (currency ~ '^[A-Z]{3}$'),
  constraint charges_source_shape check (
    (type = 'lesson' and lesson_id is not null and package_id is null)
    or (type = 'package' and package_id is not null and lesson_id is null)
    or (type = 'manual' and lesson_id is null and package_id is null)
  ),
  constraint charges_settlement_shape check (
    (status = 'settled' and settled_at is not null)
    or (status <> 'settled' and settled_at is null)
  ),
  unique (id, workspace_id)
);
create unique index charges_lesson_student_once_idx
  on public.charges (workspace_id, lesson_id, student_id)
  where lesson_id is not null and status <> 'cancelled';
create unique index charges_package_once_idx
  on public.charges (workspace_id, package_id)
  where package_id is not null and status <> 'cancelled';
create index charges_workspace_student_open_idx
  on public.charges (workspace_id, student_id, due_at, created_at)
  where status in ('open', 'partial');
create index charges_workspace_due_idx
  on public.charges (workspace_id, due_at)
  where status in ('open', 'partial') and due_at is not null;

alter table public.charges enable row level security;
create policy charges_select_member on public.charges for select to authenticated
using ((select private.is_workspace_member(workspace_id)));
create policy charges_insert_member on public.charges for insert to authenticated
with check ((select private.is_workspace_member(workspace_id)));
create policy charges_update_member on public.charges for update to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));
revoke all on table public.charges from anon, authenticated;
grant select, insert, update on table public.charges to authenticated;

-- Convert the Stage 0 lesson/package-target allocation shape to a durable
-- charge target. This also keeps already imported history auditable.
insert into public.charges (
  workspace_id, student_id, lesson_id, type, description, amount_grosz,
  currency, status, due_at, created_at, updated_at
)
select distinct
  allocation.workspace_id,
  payment.student_id,
  allocation.lesson_id,
  'lesson'::public.charge_type,
  coalesce(nullif(lesson.title, ''), 'Lekcja'),
  greatest(coalesce(lesson.price_grosz, allocation.amount_grosz), 1),
  lesson.currency,
  'open'::public.charge_status,
  lesson.completed_at + make_interval(days => workspace.payment_due_days),
  least(allocation.created_at, payment.created_at),
  now()
from public.payment_allocations allocation
join public.payments payment
  on payment.id = allocation.payment_id and payment.workspace_id = allocation.workspace_id
join public.lessons lesson
  on lesson.id = allocation.lesson_id and lesson.workspace_id = allocation.workspace_id
join public.workspaces workspace on workspace.id = allocation.workspace_id
where allocation.lesson_id is not null
on conflict do nothing;

insert into public.charges (
  workspace_id, student_id, package_id, type, description, amount_grosz,
  currency, status, due_at, created_at, updated_at
)
select distinct
  allocation.workspace_id,
  package.student_id,
  allocation.package_id,
  'package'::public.charge_type,
  package.name,
  greatest(package.price_grosz, 1),
  package.currency,
  'open'::public.charge_status,
  package.purchased_at + make_interval(days => workspace.payment_due_days),
  least(allocation.created_at, payment.created_at),
  now()
from public.payment_allocations allocation
join public.payments payment
  on payment.id = allocation.payment_id and payment.workspace_id = allocation.workspace_id
join public.packages package
  on package.id = allocation.package_id and package.workspace_id = allocation.workspace_id
join public.workspaces workspace on workspace.id = allocation.workspace_id
where allocation.package_id is not null
on conflict do nothing;

alter table public.payment_allocations add column charge_id uuid;
update public.payment_allocations allocation
set charge_id = charge.id
from public.payments payment, public.charges charge
where payment.id = allocation.payment_id
  and payment.workspace_id = allocation.workspace_id
  and charge.workspace_id = allocation.workspace_id
  and charge.student_id = payment.student_id
  and (
    (allocation.lesson_id is not null and charge.lesson_id = allocation.lesson_id)
    or (allocation.package_id is not null and charge.package_id = allocation.package_id)
  );
alter table public.payment_allocations alter column charge_id set not null;
alter table public.payment_allocations
  add constraint payment_allocations_charge_workspace_fk
  foreign key (charge_id, workspace_id) references public.charges(id, workspace_id) on delete restrict;
alter table public.payment_allocations drop constraint payment_allocations_target_xor;
create index payment_allocations_charge_idx
  on public.payment_allocations (workspace_id, charge_id, created_at);

create or replace function private.validate_payment_allocation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payment_row public.payments%rowtype;
  charge_row public.charges%rowtype;
  payment_used bigint;
  charge_paid bigint;
begin
  select * into payment_row from public.payments
  where id = new.payment_id and workspace_id = new.workspace_id for update;
  select * into charge_row from public.charges
  where id = new.charge_id and workspace_id = new.workspace_id for update;
  if payment_row.id is null or charge_row.id is null then raise exception 'ALLOCATION_TARGET_NOT_FOUND'; end if;
  if payment_row.status <> 'paid' then raise exception 'PAYMENT_NOT_PAID' using errcode = '23514'; end if;
  if payment_row.student_id <> charge_row.student_id then raise exception 'STUDENT_MISMATCH' using errcode = '23514'; end if;
  if payment_row.currency <> charge_row.currency then raise exception 'CURRENCY_MISMATCH' using errcode = '23514'; end if;
  if charge_row.status = 'cancelled' then raise exception 'CHARGE_CANCELLED' using errcode = '23514'; end if;
  select coalesce(sum(amount_grosz), 0)::bigint into payment_used
  from public.payment_allocations where payment_id = new.payment_id and workspace_id = new.workspace_id;
  select coalesce(sum(allocation.amount_grosz), 0)::bigint into charge_paid
  from public.payment_allocations allocation
  join public.payments payment on payment.id = allocation.payment_id and payment.workspace_id = allocation.workspace_id
  where allocation.charge_id = new.charge_id and allocation.workspace_id = new.workspace_id and payment.status = 'paid';
  if payment_used + new.amount_grosz > payment_row.amount_grosz then
    raise exception 'PAYMENT_OVERALLOCATION' using errcode = '23514';
  end if;
  if charge_paid + new.amount_grosz > charge_row.amount_grosz then
    raise exception 'CHARGE_OVERALLOCATION' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_payment_allocation() from public;
create trigger payment_allocations_validate
before insert on public.payment_allocations
for each row execute function private.validate_payment_allocation();

revoke update on public.payment_allocations from authenticated;

create view public.charge_balances
with (security_invoker = true)
as
select
  charge.id as charge_id,
  charge.workspace_id,
  charge.student_id,
  charge.lesson_id,
  charge.package_id,
  charge.type,
  charge.description,
  charge.amount_grosz,
  charge.currency,
  charge.status,
  charge.due_at,
  charge.created_at,
  charge.settled_at,
  coalesce(sum(allocation.amount_grosz) filter (where payment.status = 'paid'), 0)::bigint as allocated_grosz,
  greatest(
    charge.amount_grosz - coalesce(sum(allocation.amount_grosz) filter (where payment.status = 'paid'), 0),
    0
  )::bigint as outstanding_grosz,
  (
    charge.status <> 'cancelled'
    and charge.due_at is not null
    and charge.due_at < now()
    and charge.amount_grosz > coalesce(sum(allocation.amount_grosz) filter (where payment.status = 'paid'), 0)
  ) as is_overdue
from public.charges charge
left join public.payment_allocations allocation
  on allocation.charge_id = charge.id and allocation.workspace_id = charge.workspace_id
left join public.payments payment
  on payment.id = allocation.payment_id and payment.workspace_id = allocation.workspace_id
group by charge.id;
revoke all on public.charge_balances from anon, authenticated;
grant select on public.charge_balances to authenticated;

create view public.payment_balances
with (security_invoker = true)
as
select
  payment.id as payment_id,
  payment.workspace_id,
  payment.student_id,
  payment.amount_grosz,
  payment.currency,
  payment.status,
  payment.paid_at,
  payment.payment_method,
  payment.note,
  payment.created_at,
  coalesce(sum(allocation.amount_grosz), 0)::bigint as allocated_grosz,
  greatest(payment.amount_grosz - coalesce(sum(allocation.amount_grosz), 0), 0)::bigint as unallocated_grosz
from public.payments payment
left join public.payment_allocations allocation
  on allocation.payment_id = payment.id and allocation.workspace_id = payment.workspace_id
group by payment.id;
revoke all on public.payment_balances from anon, authenticated;
grant select on public.payment_balances to authenticated;

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
  payment_id uuid;
  allocation_row jsonb;
  charge_row public.charges%rowtype;
  requested bigint;
  payment_allocated bigint := 0;
  charge_allocated bigint;
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
  if not exists (
    select 1 from public.students
    where id = p_student_id and workspace_id = p_workspace_id
  ) then raise exception 'STUDENT_NOT_FOUND'; end if;

  select id into payment_id from public.payments
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if payment_id is not null then return payment_id; end if;

  insert into public.payments (
    workspace_id, student_id, amount_grosz, currency, status,
    payment_method, paid_at, note, idempotency_key
  ) values (
    p_workspace_id, p_student_id, p_amount_grosz, p_currency, 'paid',
    p_payment_method, p_paid_at, nullif(trim(p_note), ''), p_idempotency_key
  ) returning id into payment_id;

  for allocation_row in
    select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
    order by value->>'chargeId'
  loop
    requested := (allocation_row->>'amountGrosz')::bigint;
    if requested <= 0 then raise exception 'INVALID_ALLOCATION_AMOUNT' using errcode = '22023'; end if;
    select * into charge_row from public.charges
    where id = (allocation_row->>'chargeId')::uuid
      and workspace_id = p_workspace_id
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
    ) values (p_workspace_id, payment_id, charge_row.id, requested);
    update public.charges set
      status = case
        when charge_allocated + requested = amount_grosz then 'settled'::public.charge_status
        else 'partial'::public.charge_status
      end,
      settled_at = case when charge_allocated + requested = amount_grosz then now() else null end,
      updated_at = now()
    where id = charge_row.id and workspace_id = p_workspace_id;
  end loop;
  return payment_id;
exception when unique_violation then
  select id into payment_id from public.payments
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if payment_id is not null then return payment_id; end if;
  raise;
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
declare package_id uuid;
declare due_days integer;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  select id into package_id from public.packages
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if package_id is not null then return package_id; end if;
  select payment_due_days into due_days from public.workspaces where id = p_workspace_id;
  insert into public.packages (
    workspace_id, student_id, name, total_lessons, price_grosz, currency,
    purchased_at, expires_at, idempotency_key
  ) values (
    p_workspace_id, p_student_id, p_name, p_total_lessons, p_price_grosz,
    p_currency, p_purchased_at, p_expires_at, p_idempotency_key
  ) returning id into package_id;
  if p_price_grosz > 0 then
    insert into public.charges (
      workspace_id, student_id, package_id, type, description,
      amount_grosz, currency, due_at
    ) values (
      p_workspace_id, p_student_id, package_id, 'package', p_name,
      p_price_grosz, p_currency, p_purchased_at + make_interval(days => due_days)
    );
  end if;
  return package_id;
exception when unique_violation then
  select id into package_id from public.packages
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if package_id is not null then return package_id; end if;
  raise;
end;
$$;
revoke all on function public.create_student_package(uuid, uuid, text, integer, bigint, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.create_student_package(uuid, uuid, text, integer, bigint, text, timestamptz, timestamptz, text) to authenticated;

-- Completion finalizes one receivable per participant from the immutable lesson
-- price snapshot. Package/trial lessons never create ordinary lesson charges.
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
  select * into lesson_row from public.lessons
  where id = p_lesson_id and workspace_id = p_workspace_id for update;
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
  select payment_due_days into due_days from public.workspaces where id = p_workspace_id;

  if lesson_row.billing_type = 'package' and lesson_row.student_id is not null then
    select * into package_row from public.packages
    where workspace_id = p_workspace_id and student_id = lesson_row.student_id
      and status = 'active' and (expires_at is null or expires_at >= now())
    order by expires_at asc nulls last, purchased_at, created_at
    limit 1 for update;
    if package_row.id is not null then
      remaining_units := public.complete_lesson_with_package(
        p_workspace_id, p_lesson_id, lesson_row.student_id, package_row.id, p_idempotency_key
      );
    else
      update public.lessons set status = 'completed', completed_at = coalesce(completed_at, now()),
        cancelled_at = null, updated_at = now()
      where id = p_lesson_id and workspace_id = p_workspace_id;
    end if;
  else
    update public.lessons set status = 'completed', completed_at = coalesce(completed_at, now()),
      cancelled_at = null, updated_at = now()
    where id = p_lesson_id and workspace_id = p_workspace_id;
    if lesson_row.billing_type in ('per_lesson', 'per_student') and coalesce(lesson_row.price_grosz, 0) > 0 then
      for participant_row in
        select student_id from public.lesson_participants
        where workspace_id = p_workspace_id and lesson_id = p_lesson_id
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

-- Financial records are corrected by status-changing operations, never normal
-- hard-delete UI. Remove the broad Stage 0 grants for these ledgers.
revoke delete on public.payments, public.payment_allocations, public.packages,
  public.package_usages, public.charges from authenticated;
