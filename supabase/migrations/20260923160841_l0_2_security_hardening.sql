-- L0.2: keep browser-writable integration queues bound to the authenticated
-- tutor, and prevent a tutor profile from being moved to a workspace the
-- caller cannot access.

drop policy if exists tutor_profiles_update_self_or_manager
  on public.tutor_profiles;
create policy tutor_profiles_update_self_or_manager
  on public.tutor_profiles for update to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and (
      user_id = (select auth.uid())
      or (select private.can_manage_workspace(workspace_id))
    )
  )
  with check (
    (select private.is_workspace_member(workspace_id))
    and (
      user_id = (select auth.uid())
      or (select private.can_manage_workspace(workspace_id))
    )
  );

drop policy if exists google_sync_jobs_workspace_select
  on public.google_sync_jobs;
drop policy if exists google_sync_jobs_workspace_insert
  on public.google_sync_jobs;
drop policy if exists google_sync_jobs_workspace_update
  on public.google_sync_jobs;
create policy google_sync_jobs_owner_select
  on public.google_sync_jobs for select to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );
create policy google_sync_jobs_owner_insert
  on public.google_sync_jobs for insert to authenticated
  with check (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );
create policy google_sync_jobs_owner_update
  on public.google_sync_jobs for update to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  )
  with check (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );

drop policy if exists reminder_deliveries_workspace_select
  on public.reminder_deliveries;
drop policy if exists reminder_deliveries_workspace_insert
  on public.reminder_deliveries;
drop policy if exists reminder_deliveries_workspace_update
  on public.reminder_deliveries;
drop policy if exists reminder_deliveries_workspace_delete
  on public.reminder_deliveries;
create policy reminder_deliveries_owner_select
  on public.reminder_deliveries for select to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );
create policy reminder_deliveries_owner_insert
  on public.reminder_deliveries for insert to authenticated
  with check (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );
create policy reminder_deliveries_owner_update
  on public.reminder_deliveries for update to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  )
  with check (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );
create policy reminder_deliveries_owner_delete
  on public.reminder_deliveries for delete to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_workspace_member(workspace_id))
  );
