-- T1.3 Community quality and discovery. Engagement is deliberately limited
-- to private bookmarks, distinct successful adoptions, curation and reports.

alter table public.shared_template_publications
  add column is_featured boolean not null default false,
  add column featured_order integer,
  add column adoption_count integer not null default 0,
  add constraint shared_template_publications_featured_active
    check (not is_featured or status = 'approved'),
  add constraint shared_template_publications_featured_order
    check ((is_featured and featured_order is not null and featured_order >= 0)
      or (not is_featured and featured_order is null)),
  add constraint shared_template_publications_adoption_count
    check (adoption_count >= 0);

create index shared_template_publications_featured_idx
  on public.shared_template_publications (featured_order, published_at desc)
  where status = 'approved' and is_featured;
create index shared_template_publications_popular_idx
  on public.shared_template_publications (adoption_count desc, published_at desc)
  where status = 'approved';

create table public.shared_template_favorites (
  publication_id uuid not null references public.shared_template_publications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (publication_id, user_id)
);

create table public.shared_template_adoptions (
  publication_id uuid not null references public.shared_template_publications(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_private_template_id uuid not null references public.lesson_templates(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (publication_id, user_id)
);

create table public.shared_template_reports (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.shared_template_publications(id) on delete restrict,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  explanation text,
  status text not null default 'open',
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shared_template_reports_reason check (reason in (
    'copyright', 'inappropriate', 'personal_data', 'misleading', 'other'
  )),
  constraint shared_template_reports_explanation check (
    length(coalesce(explanation, '')) <= 1000
  ),
  constraint shared_template_reports_status check (status in ('open', 'dismissed', 'withdrawn')),
  constraint shared_template_reports_resolution check (
    (status = 'open' and resolved_by is null and resolution_reason is null and resolved_at is null)
    or
    (status <> 'open' and resolved_by is not null
      and length(trim(coalesce(resolution_reason, ''))) between 1 and 1000
      and resolved_at is not null)
  )
);

create unique index shared_template_reports_one_open_per_user
  on public.shared_template_reports (publication_id, reporter_user_id)
  where status = 'open';
create index shared_template_reports_queue_idx
  on public.shared_template_reports (created_at desc)
  where status = 'open';
create index shared_template_favorites_user_idx
  on public.shared_template_favorites (user_id, created_at desc);

alter table public.shared_template_favorites enable row level security;
alter table public.shared_template_adoptions enable row level security;
alter table public.shared_template_reports enable row level security;

create policy shared_template_favorites_read_own_active
  on public.shared_template_favorites for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.shared_template_publications publication
      where publication.id = publication_id and publication.status = 'approved'
    )
  );
create policy shared_template_reports_admin_read
  on public.shared_template_reports for select to authenticated
  using ((select private.is_platform_admin()));

revoke all on table public.shared_template_favorites from public, anon, authenticated;
revoke all on table public.shared_template_adoptions from public, anon, authenticated;
revoke all on table public.shared_template_reports from public, anon, authenticated;
grant select on table public.shared_template_favorites to authenticated;
grant select on table public.shared_template_reports to authenticated;

create or replace function public.set_shared_template_favorite(
  target_publication_id uuid,
  favorite boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.shared_template_publications publication
    where publication.id = target_publication_id and publication.status = 'approved'
  ) then
    raise exception 'shared template is unavailable' using errcode = 'P0002';
  end if;

  if favorite then
    insert into public.shared_template_favorites (publication_id, user_id)
    values (target_publication_id, current_user_id)
    on conflict do nothing;
  else
    delete from public.shared_template_favorites
    where publication_id = target_publication_id and user_id = current_user_id;
  end if;
  return favorite;
end;
$$;

revoke all on function public.set_shared_template_favorite(uuid, boolean) from public;
grant execute on function public.set_shared_template_favorite(uuid, boolean) to authenticated;

create or replace function private.record_shared_template_adoption(
  target_publication_id uuid,
  private_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.lesson_templates template
    where template.id = private_template_id
      and template.owner_user_id = (select auth.uid())
      and template.source_publication_id = target_publication_id
  ) then
    raise exception 'successful adoption required' using errcode = '42501';
  end if;

  insert into public.shared_template_adoptions (
    publication_id, user_id, first_private_template_id
  ) values (target_publication_id, (select auth.uid()), private_template_id)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    update public.shared_template_publications
    set adoption_count = adoption_count + 1
    where id = target_publication_id and status = 'approved';
  end if;
end;
$$;

revoke all on function private.record_shared_template_adoption(uuid, uuid) from public;
grant execute on function private.record_shared_template_adoption(uuid, uuid) to authenticated;

create or replace function public.save_shared_template_to_library(target_publication_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_workspace_id uuid;
  publication public.shared_template_publications%rowtype;
  new_template_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select profile.workspace_id into target_workspace_id
  from public.tutor_profiles profile where profile.user_id = current_user_id;
  if target_workspace_id is null then
    raise exception 'tutor workspace unavailable' using errcode = '42501';
  end if;
  if coalesce((select subscription.read_only from public.subscriptions subscription
      where subscription.teacher_id = current_user_id), true) then
    raise exception 'read-only account cannot save templates' using errcode = '42501';
  end if;
  select * into publication from public.shared_template_publications
  where id = target_publication_id and status = 'approved';
  if not found then
    raise exception 'shared template is unavailable' using errcode = 'P0002';
  end if;

  insert into public.lesson_templates (
    id, workspace_id, owner_user_id, title, description, subject, level,
    objective, estimated_duration_minutes, source_publication_id, source_attribution
  ) values (
    new_template_id, target_workspace_id, current_user_id, publication.title,
    publication.description, publication.subject, publication.level,
    publication.objective, publication.estimated_duration_minutes,
    publication.id, coalesce(publication.source_attribution, publication.author_name)
  );
  insert into public.lesson_template_sections (
    workspace_id, template_id, title, content, estimated_minutes, position
  ) select target_workspace_id, new_template_id, section.title, section.content,
    section.estimated_minutes, section.position
  from public.shared_template_sections section
  where section.publication_id = publication.id order by section.position;

  perform private.record_shared_template_adoption(publication.id, new_template_id);
  return new_template_id;
end;
$$;

create or replace function public.report_shared_template(
  target_publication_id uuid,
  report_reason text,
  report_explanation text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_explanation text := nullif(private.clean_community_template_text(report_explanation), '');
  new_report_id uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if report_reason not in ('copyright', 'inappropriate', 'personal_data', 'misleading', 'other')
    or length(coalesce(clean_explanation, '')) > 1000 then
    raise exception 'invalid report' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.shared_template_publications publication
    where publication.id = target_publication_id and publication.status = 'approved'
  ) then
    raise exception 'shared template is unavailable' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.shared_template_reports report
    where report.publication_id = target_publication_id
      and report.reporter_user_id = current_user_id and report.status = 'open'
  ) then
    raise exception 'report already submitted' using errcode = 'P0001';
  end if;
  if (select count(*) from public.shared_template_reports report
      where report.reporter_user_id = current_user_id
        and report.created_at >= now() - interval '1 hour') >= 5
    or (select count(*) from public.shared_template_reports report
      where report.reporter_user_id = current_user_id
        and report.created_at >= now() - interval '1 day') >= 15 then
    raise exception 'report rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.shared_template_reports (
    id, publication_id, reporter_user_id, reason, explanation
  ) values (
    new_report_id, target_publication_id, current_user_id,
    report_reason, clean_explanation
  );
  return new_report_id;
end;
$$;

revoke all on function public.report_shared_template(uuid, text, text) from public;
grant execute on function public.report_shared_template(uuid, text, text) to authenticated;

create or replace function public.set_shared_template_featured(
  target_publication_id uuid,
  featured boolean,
  display_order integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_platform_admin()) then
    raise exception 'platform administrator required' using errcode = '42501';
  end if;
  if featured and (display_order is null or display_order < 0) then
    raise exception 'featured order required' using errcode = '22023';
  end if;
  update public.shared_template_publications
  set is_featured = featured,
      featured_order = case when featured then display_order else null end,
      updated_at = now()
  where id = target_publication_id and status = 'approved';
  if not found then
    raise exception 'approved publication not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_shared_template_featured(uuid, boolean, integer) from public;
grant execute on function public.set_shared_template_featured(uuid, boolean, integer) to authenticated;

create or replace function public.resolve_shared_template_report(
  target_report_id uuid,
  resolution_action text,
  internal_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_publication_id uuid;
  clean_reason text := private.clean_community_template_text(internal_reason);
begin
  if not (select private.is_platform_admin()) then
    raise exception 'platform administrator required' using errcode = '42501';
  end if;
  if resolution_action not in ('dismiss', 'withdraw')
    or length(clean_reason) not between 1 and 1000 then
    raise exception 'invalid report resolution' using errcode = '22023';
  end if;
  select report.publication_id into target_publication_id
  from public.shared_template_reports report
  where report.id = target_report_id and report.status = 'open' for update;
  if not found then
    raise exception 'open report not found' using errcode = 'P0002';
  end if;

  if resolution_action = 'withdraw' then
    update public.shared_template_publications
    set status = 'withdrawn', is_featured = false, featured_order = null, updated_at = now()
    where id = target_publication_id and status = 'approved';
    update public.community_template_submissions
    set reviewed_by = (select auth.uid()), reviewed_at = now(),
        withdrawn_at = now(), withdrawal_kind = 'moderator'
    where publication_id = target_publication_id;
    update public.shared_template_reports
    set status = 'withdrawn', resolved_by = (select auth.uid()),
        resolution_reason = clean_reason, resolved_at = now()
    where publication_id = target_publication_id and status = 'open';
  else
    update public.shared_template_reports
    set status = 'dismissed', resolved_by = (select auth.uid()),
        resolution_reason = clean_reason, resolved_at = now()
    where id = target_report_id;
  end if;
end;
$$;

revoke all on function public.resolve_shared_template_report(uuid, text, text) from public;
grant execute on function public.resolve_shared_template_report(uuid, text, text) to authenticated;

-- Existing withdrawal paths must clear curation before the active-only check.
create or replace function public.withdraw_community_template(target_publication_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.community_template_submissions submission
    join public.shared_template_publications publication on publication.id = submission.publication_id
    where submission.publication_id = target_publication_id
      and submission.submitter_user_id = (select auth.uid())
      and publication.status = 'approved'
  ) then
    raise exception 'approved publication not found' using errcode = '42501';
  end if;
  update public.shared_template_publications
  set status = 'withdrawn', is_featured = false, featured_order = null, updated_at = now()
  where id = target_publication_id;
  update public.community_template_submissions
  set withdrawn_at = now(), withdrawal_kind = 'author'
  where publication_id = target_publication_id;
end;
$$;

-- Amend the moderator function's withdrawal branch without changing its API.
create or replace function public.moderate_community_template(
  target_publication_id uuid, moderation_action text, feedback text default null
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
  join public.community_template_submissions submission on submission.publication_id = publication.id
  where publication.id = target_publication_id and publication.source_kind = 'community' for update;
  if not found then raise exception 'community submission not found' using errcode = 'P0002'; end if;

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
    set status = 'withdrawn', is_featured = false, featured_order = null, updated_at = now()
    where id = target_publication_id;
  else
    raise exception 'invalid moderation transition' using errcode = '22023';
  end if;
  update public.community_template_submissions
  set moderation_feedback = clean_feedback, reviewed_by = (select auth.uid()), reviewed_at = now(),
      withdrawn_at = case when moderation_action = 'withdraw' then now() else withdrawn_at end,
      withdrawal_kind = case when moderation_action = 'withdraw' then 'moderator' else withdrawal_kind end
  where publication_id = target_publication_id;
end;
$$;
