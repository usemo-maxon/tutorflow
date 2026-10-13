# Lesson templates — D3.3

## Scope

Lesson templates are reusable, workspace-private teaching plans available under **Materiały → Szablony lekcji**. They contain planned teaching content only. They do not contain a student, group, attendance, result, or continuity state.

## Template model

`lesson_templates` stores the title, optional description, subject, level, objective, private teacher preparation notes, estimated duration, archive timestamp, owner, workspace, and audit timestamps.

Related tables:

- `lesson_template_sections` — ordered lesson sections;
- `lesson_template_materials` — references to canonical `materials` rows;
- `lesson_template_tag_assignments` — references to the D3.2 `material_tags` vocabulary.

There is no template folder model in D3.3.

## Lesson sections

Each section has a title, optional instructions, optional estimated minutes, and a zero-based display position. The editor supports adding, editing, removing, and moving sections. This is intentionally a small ordered structure rather than a block editor.

When applied, a section becomes an independent `lesson_plan_items` row. Its copied content uses `Title — instructions`, or only the title when instructions are empty.

## Material relationships

Templates reference existing `materials` records. Files and material content are never duplicated. Archiving a material does not remove `lesson_template_materials`; the template preview labels that reference as archived so the tutor can remove or replace it manually.

Applying a template creates ordinary `lesson_materials` relationships. The same canonical material may therefore remain referenced by a template and by multiple lessons.

## Apply-to-lesson behavior

The lesson workspace exposes **Użyj szablonu** for writable, non-final lessons, including individual and group lessons. The picker shows active templates only.

Application is additive:

- template objective is appended to the lesson objectives note;
- template sections are appended after existing lesson plan items;
- teacher preparation notes are appended to the private general lesson note;
- material relationships are inserted without duplicates.

When the lesson already has content, the picker explicitly states that content will be added and nothing replaced. The database function `apply_lesson_template` performs these writes as one transaction.

## Copy semantics

Applying a template does not store a template ID on the lesson. It copies text into lesson-owned notes and plan rows and creates normal material relationships. Editing or archiving the template later cannot change an already prepared lesson.

This is intentionally:

```text
Template → copied lesson content
```

and never a mutable live dependency.

## Duplicate and archive

Duplicate creates a new template row and new section rows. Materials and tags are referenced again, but the template copy is independently editable.

Archive sets `archived_at`; it does not delete the template. Archived templates are available in the archive view and are excluded from the lesson picker.

## Student Memory boundary

Template data and applying a template do not write to Student Memory, student outcomes, attendance, lesson completion, or continuity tables. A planned objective is not evidence of completion or understanding. Only the existing completion/outcome flow updates historical student context.

## Security

All four template tables carry `workspace_id`, use composite workspace foreign keys, have RLS enabled, and grant access only to authenticated users subject to workspace membership policies. Writes use `private.can_mutate_workspace`, so read-only subscriptions can browse but cannot create, edit, duplicate, archive, or apply.

Database functions are `security invoker`; they do not bypass RLS. Cross-workspace material, tag, template, and lesson relationships are rejected. Public Data API grants are explicit and limited to the authenticated role.

## Mobile

The library becomes a single-column list and the editor becomes a bottom sheet around 390 × 844. Section controls remain reachable without horizontal scrolling; filtering, preview, editing, and lesson application remain available.

## Deferred

- AI generation, suggestions, and automatic selection;
- Student Memory recommendations;
- public marketplace or sharing;
- collaborative editing;
- course/curriculum builder;
- analytics and version history;
- template folders;
- student/group material assignment.
