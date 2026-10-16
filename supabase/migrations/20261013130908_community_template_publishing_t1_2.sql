-- T1.2 Community Template Publishing. Community submissions reuse the T1.1
-- public snapshot tables, while provenance, consent, and moderation history
-- remain private. The original Lesson Template is never exposed or linked
-- from catalog responses.

alter table public.shared_template_publications
  drop constraint shared_template_publications_status,
  drop constraint shared_template_publications_approved_at,
  add constraint shared_template_publications_status_check
    check (status in ('draft', 'pending_review', 'approved', 'rejected', 'withdrawn')),
  add constraint shared_template_publications_published_at_check check (
    (status = 'approved' and published_at is not null)
    or (status in ('draft', 'pending_review', 'rejected') and published_at is null)
    or status = 'withdrawn'
  );

create table public.community_template_submissions (
  publication_id uuid primary key references public.shared_template_publications(id) on delete restrict,
  source_template_id uuid not null,
  source_workspace_id uuid not null,
  submitter_user_id uuid not null references auth.users(id) on delete restrict,
  rights_confirmed_at timestamptz not null,
  terms_document_version text not null,
  moderation_feedback text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  withdrawal_kind text,
  created_at timestamptz not null default now(),
  foreign key (source_template_id, source_workspace_id)
    references public.lesson_templates(id, workspace_id) on delete restrict,
  constraint community_submission_terms_version_length
    check (length(trim(terms_document_version)) between 1 and 80),
  constraint community_submission_feedback_length
    check (length(coalesce(moderation_feedback, '')) <= 2000),
  constraint community_submission_withdrawal_kind
    check (withdrawal_kind is null or withdrawal_kind in ('author', 'moderator'))
);

create index community_template_submissions_author_idx
  on public.community_template_submissions (submitter_user_id, created_at desc);
create index shared_template_publications_review_queue_idx
  on public.shared_template_publications (created_at)
  where status = 'pending_review';

-- Platform administration is deliberately independent from workspace roles
-- and profile fields. Rows are provisioned only by trusted server/migration
-- access; authenticated users receive no table privileges.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

alter table public.community_template_submissions enable row level security;
alter table public.platform_admins enable row level security;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins administrator
    where administrator.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated;

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_platform_admin(); $$;

revoke all on function public.current_user_is_platform_admin() from public;
grant execute on function public.current_user_is_platform_admin() to authenticated;

drop policy shared_template_publications_browse_approved on public.shared_template_publications;
create policy shared_template_publications_browse_or_own_or_moderate
  on public.shared_template_publications for select to authenticated
  using (
    status = 'approved'
    or exists (
      select 1 from public.community_template_submissions submission
      where submission.publication_id = id
        and submission.submitter_user_id = (select auth.uid())
    )
    or (select private.is_platform_admin())
  );

drop policy shared_template_sections_browse_approved on public.shared_template_sections;
create policy shared_template_sections_browse_or_own_or_moderate
  on public.shared_template_sections for select to authenticated
  using (exists (
    select 1 from public.shared_template_publications publication
    where publication.id = publication_id
      and (
        publication.status = 'approved'
        or exists (
          select 1 from public.community_template_submissions submission
          where submission.publication_id = publication.id
            and submission.submitter_user_id = (select auth.uid())
        )
        or (select private.is_platform_admin())
      )
  ));

create policy community_template_submissions_read_own_or_moderate
  on public.community_template_submissions for select to authenticated
  using (
    submitter_user_id = (select auth.uid())
    or (select private.is_platform_admin())
  );

revoke all on table public.community_template_submissions from public, anon, authenticated;
revoke all on table public.platform_admins from public, anon, authenticated;
grant select on table public.community_template_submissions to authenticated;

create or replace function private.clean_community_template_text(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(coalesce(value, ''), '[[:cntrl:]]', ' ', 'g'));
$$;

create or replace function private.community_text_is_safe(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(value, '') !~* '(storage/v1/object|/material-files/|blob:|data:|file:|javascript:|supabase[^[:space:]]*/storage)';
$$;

revoke all on function private.clean_community_template_text(text) from public;
revoke all on function private.community_text_is_safe(text) from public;

create or replace function public.submit_community_template(
  target_template_id uuid,
  snapshot jsonb,
  rights_confirmed boolean,
  terms_document_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  source_template public.lesson_templates%rowtype;
  new_publication_id uuid := gen_random_uuid();
  section jsonb;
  section_index integer := 0;
  clean_title text;
  clean_description text;
  clean_subject text;
  clean_level text;
  clean_objective text;
  clean_author_name text;
  duration_minutes integer;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if rights_confirmed is not true then
    raise exception 'rights confirmation required' using errcode = '22023';
  end if;
  if length(trim(coalesce(terms_document_version, ''))) not between 1 and 80 then
    raise exception 'publishing terms version required' using errcode = '22023';
  end if;

  select template.* into source_template
  from public.lesson_templates template
  where template.id = target_template_id
    and template.archived_at is null
    and (
      template.owner_user_id = current_user_id
      or exists (
        select 1 from public.workspace_members member
        where member.workspace_id = template.workspace_id
          and member.user_id = current_user_id
          and member.status = 'active'
          and member.role in ('owner', 'admin')
      )
    )
    and (select private.can_mutate_workspace(template.workspace_id));
  if not found then
    raise exception 'template is unavailable for publication' using errcode = '42501';
  end if;

  if (select count(*) from public.community_template_submissions submission
      where submission.submitter_user_id = current_user_id
        and submission.created_at >= now() - interval '1 hour') >= 5
    or (select count(*) from public.community_template_submissions submission
      where submission.submitter_user_id = current_user_id
        and submission.created_at >= now() - interval '1 day') >= 20 then
    raise exception 'submission rate limit exceeded' using errcode = 'P0001';
  end if;

  clean_title := private.clean_community_template_text(snapshot->>'title');
  clean_description := private.clean_community_template_text(snapshot->>'description');
  clean_subject := private.clean_community_template_text(snapshot->>'subject');
  clean_level := private.clean_community_template_text(snapshot->>'level');
  clean_objective := private.clean_community_template_text(snapshot->>'objective');
  clean_author_name := private.clean_community_template_text(snapshot->>'authorName');
  begin
    duration_minutes := (snapshot->>'estimatedDurationMinutes')::integer;
  exception when others then
    raise exception 'invalid duration' using errcode = '22023';
  end;

  if length(clean_title) not between 1 and 160
    or length(clean_description) > 2000
    or length(clean_subject) not between 1 and 80
    or length(clean_level) not between 1 and 40
    or length(clean_objective) not between 1 and 5000
    or length(clean_author_name) not between 1 and 120
    or duration_minutes not between 1 and 480
    or jsonb_typeof(snapshot->'sections') is distinct from 'array'
    or jsonb_array_length(snapshot->'sections') not between 1 and 50
    or not private.community_text_is_safe(clean_title || ' ' || clean_description || ' ' || clean_subject || ' ' || clean_level || ' ' || clean_objective || ' ' || clean_author_name)
  then
    raise exception 'invalid or unsafe publication snapshot' using errcode = '22023';
  end if;

  insert into public.shared_template_publications (
    id, title, description, subject, level, objective,
    estimated_duration_minutes, source_kind, author_name,
    source_attribution, status, excluded_private_attachments
  ) values (
    new_publication_id, clean_title, clean_description, clean_subject,
    clean_level, clean_objective, duration_minutes, 'community',
    clean_author_name, 'Autor: ' || clean_author_name, 'pending_review',
    exists (
      select 1 from public.lesson_template_materials material
      where material.template_id = source_template.id
        and material.workspace_id = source_template.workspace_id
    )
  );

  insert into public.community_template_submissions (
    publication_id, source_template_id, source_workspace_id,
    submitter_user_id, rights_confirmed_at, terms_document_version
  ) values (
    new_publication_id, source_template.id, source_template.workspace_id,
    current_user_id, now(), trim(terms_document_version)
  );

  for section in select value from jsonb_array_elements(snapshot->'sections') loop
    if length(private.clean_community_template_text(section->>'title')) not between 1 and 120
      or length(private.clean_community_template_text(section->>'content')) > 5000
      or not private.community_text_is_safe(
        private.clean_community_template_text(section->>'title') || ' ' ||
        private.clean_community_template_text(section->>'content')
      )
      or (section ? 'estimatedMinutes' and (
        jsonb_typeof(section->'estimatedMinutes') <> 'number'
        or (section->>'estimatedMinutes')::integer not between 1 and 480
      ))
    then
      raise exception 'invalid or unsafe publication section' using errcode = '22023';
    end if;
    insert into public.shared_template_sections (
      publication_id, title, content, estimated_minutes, position
    ) values (
      new_publication_id,
      private.clean_community_template_text(section->>'title'),
      private.clean_community_template_text(section->>'content'),
      case when section ? 'estimatedMinutes' then (section->>'estimatedMinutes')::integer else null end,
      section_index
    );
    section_index := section_index + 1;
  end loop;

  return new_publication_id;
end;
$$;

revoke all on function public.submit_community_template(uuid, jsonb, boolean, text) from public;
grant execute on function public.submit_community_template(uuid, jsonb, boolean, text) to authenticated;

create or replace function public.withdraw_community_template(target_publication_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.community_template_submissions submission
    join public.shared_template_publications publication on publication.id = submission.publication_id
    where submission.publication_id = target_publication_id
      and submission.submitter_user_id = (select auth.uid())
      and publication.status = 'approved'
  ) then
    raise exception 'approved publication not found' using errcode = '42501';
  end if;

  update public.shared_template_publications
  set status = 'withdrawn', updated_at = now()
  where id = target_publication_id;
  update public.community_template_submissions
  set withdrawn_at = now(), withdrawal_kind = 'author'
  where publication_id = target_publication_id;
end;
$$;

revoke all on function public.withdraw_community_template(uuid) from public;
grant execute on function public.withdraw_community_template(uuid) to authenticated;

create or replace function public.moderate_community_template(
  target_publication_id uuid,
  moderation_action text,
  feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  clean_feedback text := nullif(private.clean_community_template_text(feedback), '');
begin
  if not (select private.is_platform_admin()) then
    raise exception 'platform administrator required' using errcode = '42501';
  end if;
  if length(coalesce(clean_feedback, '')) > 2000 then
    raise exception 'moderation feedback too long' using errcode = '22023';
  end if;

  select publication.status into current_status
  from public.shared_template_publications publication
  join public.community_template_submissions submission
    on submission.publication_id = publication.id
  where publication.id = target_publication_id
    and publication.source_kind = 'community'
  for update;
  if not found then
    raise exception 'community submission not found' using errcode = 'P0002';
  end if;

  if moderation_action = 'approve' and current_status = 'pending_review' then
    update public.shared_template_publications
    set status = 'approved', published_at = now(), updated_at = now()
    where id = target_publication_id;
  elsif moderation_action = 'reject' and current_status = 'pending_review' then
    update public.shared_template_publications
    set status = 'rejected', published_at = null, updated_at = now()
    where id = target_publication_id;
  elsif moderation_action = 'withdraw' and current_status = 'approved' then
    update public.shared_template_publications
    set status = 'withdrawn', updated_at = now()
    where id = target_publication_id;
  else
    raise exception 'invalid moderation transition' using errcode = '22023';
  end if;

  update public.community_template_submissions
  set moderation_feedback = clean_feedback,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      withdrawn_at = case when moderation_action = 'withdraw' then now() else withdrawn_at end,
      withdrawal_kind = case when moderation_action = 'withdraw' then 'moderator' else withdrawal_kind end
  where publication_id = target_publication_id;
end;
$$;

revoke all on function public.moderate_community_template(uuid, text, text) from public;
grant execute on function public.moderate_community_template(uuid, text, text) to authenticated;

-- Approved catalog rows remain cloneable; withdrawn rows immediately stop
-- matching the existing T1.1 copy function. Existing private copies are not
-- touched because their content was copied at save time.
