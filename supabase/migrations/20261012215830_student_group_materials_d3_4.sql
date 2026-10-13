-- D3.4 Persistent Student and Group material assignments. These joins point
-- at the canonical Materials Library and remain separate from lesson/template
-- material relationships.

create table public.student_material_assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  student_id uuid not null,
  material_id uuid not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (student_id, material_id),
  foreign key (student_id, workspace_id)
    references public.students(id, workspace_id) on delete cascade,
  foreign key (material_id, workspace_id)
    references public.materials(id, workspace_id) on delete restrict
);

create table public.group_material_assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  group_id uuid not null,
  material_id uuid not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (group_id, material_id),
  foreign key (group_id, workspace_id)
    references public.groups(id, workspace_id) on delete cascade,
  foreign key (material_id, workspace_id)
    references public.materials(id, workspace_id) on delete restrict
);

create index student_material_assignments_material_idx
  on public.student_material_assignments (workspace_id, material_id);
create index group_material_assignments_material_idx
  on public.group_material_assignments (workspace_id, material_id);

alter table public.student_material_assignments enable row level security;
alter table public.group_material_assignments enable row level security;

create policy student_material_assignments_select_member
  on public.student_material_assignments for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy student_material_assignments_insert_writable_member
  on public.student_material_assignments for insert to authenticated
  with check (
    assigned_by = (select auth.uid())
    and (select private.can_mutate_workspace(workspace_id))
  );
create policy student_material_assignments_delete_writable_member
  on public.student_material_assignments for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

create policy group_material_assignments_select_member
  on public.group_material_assignments for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy group_material_assignments_insert_writable_member
  on public.group_material_assignments for insert to authenticated
  with check (
    assigned_by = (select auth.uid())
    and (select private.can_mutate_workspace(workspace_id))
  );
create policy group_material_assignments_delete_writable_member
  on public.group_material_assignments for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

grant select, insert, delete on public.student_material_assignments to authenticated;
grant select, insert, delete on public.group_material_assignments to authenticated;
