create table public.lesson_student_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  lesson_id uuid not null,
  student_id uuid not null,
  progress_summary text,
  difficulty_level text,
  difficulty_note text,
  next_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_student_outcomes_participant_fk
    foreign key (lesson_id, student_id, workspace_id)
    references public.lesson_participants(lesson_id, student_id, workspace_id)
    on delete restrict,
  constraint lesson_student_outcomes_difficulty_check
    check (difficulty_level is null or difficulty_level in ('easy', 'mixed', 'hard')),
  constraint lesson_student_outcomes_progress_length
    check (progress_summary is null or char_length(progress_summary) <= 2000),
  constraint lesson_student_outcomes_difficulty_note_length
    check (difficulty_note is null or char_length(difficulty_note) <= 2000),
  constraint lesson_student_outcomes_next_step_length
    check (next_step is null or char_length(next_step) <= 2000),
  constraint lesson_student_outcomes_lesson_student_key
    unique (workspace_id, lesson_id, student_id)
);

create index lesson_student_outcomes_student_idx
  on public.lesson_student_outcomes (workspace_id, student_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger lesson_student_outcomes_set_updated_at
before update on public.lesson_student_outcomes
for each row execute function private.set_updated_at();

alter table public.lesson_student_outcomes enable row level security;

create policy lesson_student_outcomes_select_member
on public.lesson_student_outcomes for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy lesson_student_outcomes_insert_member
on public.lesson_student_outcomes for insert to authenticated
with check ((select private.is_workspace_member(workspace_id)));

create policy lesson_student_outcomes_update_member
on public.lesson_student_outcomes for update to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

revoke all on table public.lesson_student_outcomes from anon, authenticated;
grant select, insert, update on table public.lesson_student_outcomes to authenticated;
