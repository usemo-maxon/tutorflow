# Material Organization D3.2

## Folders

Materials can belong to zero or one flat workspace folder. There is no parent
column and therefore no nested-folder model. Tutors can create, rename, open
and delete folders from `/app/materialy`, and can move a material from its
detail view or composer. A database trigger clears `materials.folder_id` before
a folder is deleted, so contained materials move to **Bez folderu** and are
never deleted.

## Tags

`material_tags` is a workspace-owned catalog and
`material_tag_assignments` is the many-to-many relation. The composer can
assign several existing tags, remove assignments, and create comma-separated
new tags inline. Tags are never shared between workspaces.

## Search

`search_material_library` performs the bounded library query in Postgres. It
searches title, description, subject, level, plain-text material content and tag
names with case-insensitive partial matching. It does not inspect binary file
contents and does not use AI, embeddings or semantic search. Trigram indexes
cover material metadata/content and tag names; results are capped at 200 by the
application (and 500 by the database function).

## Filtering

Folder, no-folder, material type, subject, level, tag, archive state and text
search are predicates in the same database query, so combinations are
predictable and remain workspace-scoped. Useful state is mirrored in query
parameters (`q`, `folder`, `type`, `subject`, `level`, `tag`, `view`). The UI
provides one **Wyczyść filtry** action. Desktop uses a lightweight folder rail;
mobile uses a compact folder select and a bottom filter dialog.

## Archive behavior

Normal queries return only active materials. The explicit **Archiwalne** view
returns archived materials. Archiving changes only `archived_at`; folder and
tag relations remain attached, as do historical `lesson_materials` references.

## Normalization

Folder and tag rows store a generated `name_key` built from trimmed,
whitespace-collapsed, lowercase text. A workspace-unique constraint on that key
prevents variants such as `Grammar`, `grammar` and ` GRAMMAR `. The first clean
display spelling is preserved.

## Existing materials

The migration adds only a nullable `folder_id`. Existing D3.1 material rows are
valid without a backfill and naturally start with no folder and no tag
assignments. The D3.1 `note`, `file` and `link` database types and lesson joins
are unchanged.

## Workspace isolation and read-only access

Every new row carries `workspace_id`. Composite foreign keys prevent a material
from referencing another workspace's folder or tag. RLS permits reads only to
workspace members and mutations only through `private.can_mutate_workspace`.
Server routes derive workspace authority from the authenticated tutor and do
not accept a workspace ID from the browser. Read-only members can browse,
search, filter, open folders and see tags, but database policy and server guards
both reject organization mutations.

## Deferred functionality

Nested folders, drag-and-drop trees, taxonomy administration, AI tagging,
automatic classification, semantic/vector search, OCR, binary indexing,
recommendations, public sharing, Google Drive sync and lesson templates remain
out of scope.
