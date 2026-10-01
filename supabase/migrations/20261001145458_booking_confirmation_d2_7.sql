-- D2.7: hashed guest-management tokens, canonical cancellation and delivery
-- bookkeeping. Raw tokens exist only in the booking response/email URL.
alter table public.booking_availability_settings
  add column cancellation_notice_hours integer not null default 24,
  add constraint booking_availability_settings_cancellation_check
    check (cancellation_notice_hours between 0 and 720);

alter table public.bookings
  add column management_token_hash text,
  add column confirmation_email_sent_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancelled_by text,
  add constraint bookings_management_token_hash_check check (
    management_token_hash is null or management_token_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint bookings_cancelled_by_check check (
    cancelled_by is null or cancelled_by in ('guest', 'tutor')
  ),
  add constraint bookings_cancellation_consistent check (
    (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
    or (status <> 'cancelled' and cancelled_at is null and cancelled_by is null)
    or (status = 'cancelled' and cancelled_at is null and cancelled_by is null)
  );

create unique index bookings_management_token_hash_unique
  on public.bookings (management_token_hash)
  where management_token_hash is not null;

create function public.create_public_booking(
  p_slug text,
  p_event_type_id uuid,
  p_starts_at timestamptz,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_guest_level text,
  p_guest_goal text,
  p_guest_message text,
  p_management_token_hash text
)
returns table (
  booking_id uuid,
  tutor_id uuid,
  event_type_id uuid,
  event_type_name text,
  duration_minutes integer,
  price_grosz bigint,
  currency text,
  format text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  guest_name text,
  guest_email text,
  tutor_public_name text,
  public_location text,
  created_at timestamptz
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_booking_id uuid;
  v_tutor_id uuid;
  v_workspace_id uuid;
  v_timezone text;
  v_event_name text;
  v_duration integer;
  v_price bigint;
  v_currency text;
  v_format text;
  v_ends_at timestamptz;
  v_email text;
  v_public_name text;
  v_public_location text;
  v_created_at timestamptz;
begin
  v_email := lower(btrim(coalesce(p_guest_email, '')));
  if char_length(btrim(coalesce(p_guest_name, ''))) not between 1 and 120
    or char_length(v_email) not between 3 and 255
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or char_length(coalesce(p_guest_phone, '')) > 50
    or char_length(coalesce(p_guest_level, '')) > 80
    or char_length(coalesce(p_guest_goal, '')) > 500
    or char_length(coalesce(p_guest_message, '')) > 2000
    or p_management_token_hash is null
    or p_management_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'PUBLIC_BOOKING_INVALID_GUEST' using errcode = '22023';
  end if;

  select profile.tutor_id, profile.workspace_id, account.timezone, event.name,
      event.duration_minutes, event.price_grosz, event.currency, event.format,
      profile.public_name,
      case when event.format = 'offline' then nullif(btrim(profile.city), '') end
    into v_tutor_id, v_workspace_id, v_timezone, v_event_name,
      v_duration, v_price, v_currency, v_format, v_public_name, v_public_location
  from public.tutor_public_profiles profile
  join public.tutor_profiles tutor on tutor.id = profile.tutor_id
  join public.profiles account on account.id = tutor.user_id
  join public.workspace_members member
    on member.workspace_id = profile.workspace_id and member.user_id = tutor.user_id
  join public.booking_event_types event
    on event.id = p_event_type_id and event.tutor_id = profile.tutor_id
    and event.workspace_id = profile.workspace_id
  where profile.enabled and lower(profile.slug) = lower(btrim(p_slug))
    and member.status = 'active' and event.is_active and event.is_public
  limit 1;
  if v_tutor_id is null then
    raise exception 'PUBLIC_BOOKING_OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tutor_id::text, 0)
  );
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  if not private.public_booking_slot_is_available(
    v_workspace_id, v_tutor_id, v_timezone, v_duration, p_starts_at, v_ends_at
  ) then
    raise exception 'PUBLIC_BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  begin
    insert into public.bookings (
      workspace_id, tutor_id, event_type_id, event_type_name,
      duration_minutes, price_grosz, currency, format,
      starts_at, ends_at, timezone, status, source,
      guest_name, guest_email, guest_phone, guest_level, guest_goal,
      guest_message, management_token_hash
    ) values (
      v_workspace_id, v_tutor_id, p_event_type_id, v_event_name,
      v_duration, v_price, v_currency, v_format,
      p_starts_at, v_ends_at, v_timezone, 'confirmed', 'public_booking',
      btrim(p_guest_name), v_email, nullif(btrim(p_guest_phone), ''),
      nullif(btrim(p_guest_level), ''), nullif(btrim(p_guest_goal), ''),
      nullif(btrim(p_guest_message), ''), p_management_token_hash
    ) returning id, public.bookings.created_at into v_booking_id, v_created_at;
  exception when exclusion_violation or unique_violation then
    raise exception 'PUBLIC_BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end;

  return query select v_booking_id, v_tutor_id, p_event_type_id, v_event_name,
    v_duration, v_price, v_currency, v_format, p_starts_at, v_ends_at,
    v_timezone, btrim(p_guest_name), v_email, v_public_name,
    v_public_location, v_created_at;
end;
$$;
revoke all on function public.create_public_booking(
  text, uuid, timestamptz, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_public_booking(
  text, uuid, timestamptz, text, text, text, text, text, text, text
) to service_role;

create function public.get_public_booking_by_token(p_token_hash text)
returns table (
  tutor_public_name text,
  event_type_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  format text,
  public_location text,
  status public.booking_status,
  cancellation_notice_hours integer
)
language sql stable security definer set search_path = '' as $$
  select profile.public_name, booking.event_type_name, booking.starts_at,
    booking.ends_at, booking.timezone, booking.format,
    case when booking.format = 'offline' then nullif(btrim(profile.city), '') end,
    booking.status, coalesce(settings.cancellation_notice_hours, 24)
  from public.bookings booking
  join public.tutor_public_profiles profile on profile.tutor_id = booking.tutor_id
    and profile.workspace_id = booking.workspace_id
  left join public.booking_availability_settings settings
    on settings.tutor_id = booking.tutor_id
  where booking.source = 'public_booking'
    and booking.management_token_hash = p_token_hash
    and p_token_hash ~ '^[0-9a-f]{64}$'
  limit 1;
$$;
revoke all on function public.get_public_booking_by_token(text)
  from public, anon, authenticated;
grant execute on function public.get_public_booking_by_token(text) to service_role;

create function private.cancel_public_booking_transition(
  p_booking_id uuid,
  p_actor text,
  p_token_hash text default null,
  p_tutor_id uuid default null
)
returns public.booking_status
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_booking public.bookings%rowtype;
  v_notice integer := 24;
begin
  select booking.* into v_booking
  from public.bookings booking
  where booking.id = p_booking_id
    and booking.source = 'public_booking'
    and (
      (p_actor = 'guest' and booking.management_token_hash = p_token_hash)
      or (p_actor = 'tutor' and booking.tutor_id = p_tutor_id)
    )
  for update;
  if v_booking.id is null then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  if v_booking.status = 'converted' then
    raise exception 'BOOKING_CONVERTED' using errcode = 'P0001';
  end if;
  if v_booking.status = 'cancelled' then return v_booking.status; end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;

  if p_actor = 'guest' then
    select coalesce(settings.cancellation_notice_hours, 24) into v_notice
    from public.booking_availability_settings settings
    where settings.tutor_id = v_booking.tutor_id;
    v_notice := coalesce(v_notice, 24);
    if now() >= v_booking.starts_at - make_interval(hours => v_notice) then
      raise exception 'BOOKING_CANCELLATION_DEADLINE' using errcode = 'P0001';
    end if;
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor,
      updated_at = now()
  where id = v_booking.id;
  return 'cancelled'::public.booking_status;
end;
$$;
revoke all on function private.cancel_public_booking_transition(
  uuid, text, text, uuid
) from public;
grant execute on function private.cancel_public_booking_transition(
  uuid, text, text, uuid
) to service_role, authenticated;

create function public.cancel_public_booking_by_token(p_token_hash text)
returns public.booking_status
language plpgsql volatile security definer set search_path = '' as $$
declare v_booking_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  select booking.id into v_booking_id from public.bookings booking
  where booking.management_token_hash = p_token_hash
    and booking.source = 'public_booking' limit 1;
  if v_booking_id is null then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  return private.cancel_public_booking_transition(
    v_booking_id, 'guest', p_token_hash, null
  );
end;
$$;
revoke all on function public.cancel_public_booking_by_token(text)
  from public, anon, authenticated;
grant execute on function public.cancel_public_booking_by_token(text)
  to service_role;

create function public.mark_booking_confirmation_email_sent(p_booking_id uuid)
returns void
language sql volatile security definer set search_path = '' as $$
  update public.bookings booking
  set confirmation_email_sent_at = coalesce(booking.confirmation_email_sent_at, now()),
      updated_at = now()
  where booking.id = p_booking_id and booking.source = 'public_booking';
$$;
revoke all on function public.mark_booking_confirmation_email_sent(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_booking_confirmation_email_sent(uuid)
  to service_role;

create function public.cancel_public_booking_as_tutor(p_booking_id uuid)
returns public.booking_status
language plpgsql volatile security invoker set search_path = '' as $$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  return private.cancel_public_booking_transition(
    p_booking_id, 'tutor', null, v_user_id
  );
end;
$$;
revoke all on function public.cancel_public_booking_as_tutor(uuid)
  from public, anon;
grant execute on function public.cancel_public_booking_as_tutor(uuid)
  to authenticated;
