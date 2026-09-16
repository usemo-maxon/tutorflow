-- Stage 1A: focused relational commands for contacts and group membership.
-- These functions derive workspace scope from RLS-visible rows; callers never
-- provide a trusted workspace id.

create index if not exists students_workspace_created_idx
  on public.students (workspace_id, created_at desc);
create index if not exists students_workspace_search_name_idx
  on public.students (workspace_id, lower(display_name));
create index if not exists group_members_group_status_idx
  on public.group_members (workspace_id, group_id, status);

create or replace function public.create_student_contact(
  p_student_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_type public.contact_type,
  p_relationship text,
  p_is_primary boolean,
  p_is_billing_contact boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_contact_id uuid;
begin
  select workspace_id into v_workspace_id
  from public.students
  where id = p_student_id;

  if v_workspace_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_is_primary then
    update public.student_contacts
    set is_primary = false
    where workspace_id = v_workspace_id and student_id = p_student_id and is_primary;
  end if;
  if p_is_billing_contact then
    update public.student_contacts
    set is_billing_contact = false
    where workspace_id = v_workspace_id and student_id = p_student_id and is_billing_contact;
  end if;

  select id into v_contact_id
  from public.contacts
  where workspace_id = v_workspace_id
    and (
      (nullif(trim(coalesce(p_email, '')), '') is not null
        and lower(email) = lower(trim(p_email)))
      or
      (nullif(trim(coalesce(p_phone, '')), '') is not null
        and phone = trim(p_phone))
    )
  order by created_at
  limit 1;

  if v_contact_id is null then
    insert into public.contacts (
      workspace_id, first_name, last_name, email, phone, type
    ) values (
      v_workspace_id, trim(p_first_name), trim(coalesce(p_last_name, '')),
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(p_phone, '')), ''), p_type
    ) returning id into v_contact_id;
  end if;

  insert into public.student_contacts (
    workspace_id, student_id, contact_id, relationship,
    is_primary, is_billing_contact
  ) values (
    v_workspace_id, p_student_id, v_contact_id,
    nullif(trim(coalesce(p_relationship, '')), ''),
    p_is_primary, p_is_billing_contact
  );

  return v_contact_id;
end;
$$;

revoke all on function public.create_student_contact(
  uuid, text, text, text, text, public.contact_type, text, boolean, boolean
) from public, anon;
grant execute on function public.create_student_contact(
  uuid, text, text, text, text, public.contact_type, text, boolean, boolean
) to authenticated;

create or replace function public.update_student_contact(
  p_relation_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_type public.contact_type,
  p_relationship text,
  p_is_primary boolean,
  p_is_billing_contact boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_student_id uuid;
  v_contact_id uuid;
begin
  select workspace_id, student_id, contact_id
  into v_workspace_id, v_student_id, v_contact_id
  from public.student_contacts
  where id = p_relation_id;

  if v_workspace_id is null then
    raise exception 'CONTACT_RELATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_is_primary then
    update public.student_contacts
    set is_primary = false
    where workspace_id = v_workspace_id and student_id = v_student_id
      and id <> p_relation_id and is_primary;
  end if;
  if p_is_billing_contact then
    update public.student_contacts
    set is_billing_contact = false
    where workspace_id = v_workspace_id and student_id = v_student_id
      and id <> p_relation_id and is_billing_contact;
  end if;

  update public.contacts
  set first_name = trim(p_first_name),
      last_name = trim(coalesce(p_last_name, '')),
      email = nullif(trim(coalesce(p_email, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      type = p_type,
      updated_at = now()
  where id = v_contact_id and workspace_id = v_workspace_id;

  update public.student_contacts
  set relationship = nullif(trim(coalesce(p_relationship, '')), ''),
      is_primary = p_is_primary,
      is_billing_contact = p_is_billing_contact
  where id = p_relation_id and workspace_id = v_workspace_id;

  return v_contact_id;
end;
$$;

revoke all on function public.update_student_contact(
  uuid, text, text, text, text, public.contact_type, text, boolean, boolean
) from public, anon;
grant execute on function public.update_student_contact(
  uuid, text, text, text, text, public.contact_type, text, boolean, boolean
) to authenticated;

create or replace function public.add_group_members(
  p_group_id uuid,
  p_student_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_student_id uuid;
  v_count integer := 0;
begin
  select workspace_id into v_workspace_id
  from public.groups
  where id = p_group_id and status = 'active';

  if v_workspace_id is null then
    raise exception 'GROUP_NOT_FOUND' using errcode = 'P0002';
  end if;

  foreach v_student_id in array p_student_ids loop
    if not exists (
      select 1 from public.students
      where id = v_student_id and workspace_id = v_workspace_id and status = 'active'
    ) then
      raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    insert into public.group_members (
      workspace_id, group_id, student_id, status, joined_at, left_at
    ) values (
      v_workspace_id, p_group_id, v_student_id, 'active', now(), null
    )
    on conflict (group_id, student_id) do update
      set status = 'active',
          joined_at = case
            when public.group_members.status = 'active'
              then public.group_members.joined_at
            else now()
          end,
          left_at = null;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
