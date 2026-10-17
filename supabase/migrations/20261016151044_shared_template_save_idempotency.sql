-- A caller-provided UUID is both the private template id and the idempotency
-- key. Retrying the same save returns the same copy; intentionally creating a
-- second copy uses a fresh UUID and remains supported.
create or replace function public.save_shared_template_to_library(
  target_publication_id uuid,
  target_copy_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_workspace_id uuid;
  publication public.shared_template_publications%rowtype;
  inserted_template_id uuid;
  existing_template public.lesson_templates%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if target_copy_id is null then
    raise exception 'copy id is required' using errcode = '22023';
  end if;

  select profile.workspace_id into target_workspace_id
  from public.tutor_profiles profile
  where profile.user_id = current_user_id;

  if target_workspace_id is null then
    raise exception 'tutor workspace unavailable' using errcode = '42501';
  end if;

  if coalesce((
    select subscription.read_only
    from public.subscriptions subscription
    where subscription.teacher_id = current_user_id
  ), true) then
    raise exception 'read-only account cannot save templates' using errcode = '42501';
  end if;

  select * into publication
  from public.shared_template_publications
  where id = target_publication_id and status = 'approved';

  if not found then
    raise exception 'shared template is unavailable' using errcode = 'P0002';
  end if;

  insert into public.lesson_templates (
    id, workspace_id, owner_user_id, title, description, subject, level,
    objective, estimated_duration_minutes, source_publication_id,
    source_attribution
  ) values (
    target_copy_id, target_workspace_id, current_user_id, publication.title,
    publication.description, publication.subject, publication.level,
    publication.objective, publication.estimated_duration_minutes,
    publication.id,
    coalesce(publication.source_attribution, publication.author_name)
  )
  on conflict (id) do nothing
  returning id into inserted_template_id;

  if inserted_template_id is null then
    select * into existing_template
    from public.lesson_templates
    where id = target_copy_id;

    if not found
      or existing_template.workspace_id <> target_workspace_id
      or existing_template.owner_user_id <> current_user_id
      or existing_template.source_publication_id <> target_publication_id then
      raise exception 'copy id is already in use' using errcode = '23505';
    end if;

    return existing_template.id;
  end if;

  insert into public.lesson_template_sections (
    workspace_id, template_id, title, content, estimated_minutes, position
  )
  select target_workspace_id, inserted_template_id, section.title,
    section.content, section.estimated_minutes, section.position
  from public.shared_template_sections section
  where section.publication_id = publication.id
  order by section.position;

  return inserted_template_id;
end;
$$;

revoke all on function public.save_shared_template_to_library(uuid, uuid) from public;
grant execute on function public.save_shared_template_to_library(uuid, uuid) to authenticated;
