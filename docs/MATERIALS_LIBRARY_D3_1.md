# Materials Library D3.1

## Material model

The library extends the existing `public.materials` relation. Existing IDs, the
`material_type` enum (`note`, `file`, `link`) and `lesson_materials` joins remain
unchanged. The product API presents `note` as the clearer user-facing type
`text`.

Practical metadata consists of title, optional description, subject and level,
type-specific content, archive timestamp, and the existing creation/update
timestamps. Text materials store plain text in `text_content`. File rows also
record the private object path, original filename, MIME type and byte size.

## Supported types

- File: PDF, JPG/JPEG, PNG, WEBP, DOC and DOCX, up to 10 MB.
- Link: an external HTTP or HTTPS URL. D3.1 does not scrape or import it.
- Text: plain reusable notes, questions, exercises or instructions, up to
  50,000 characters. No rich-text editor is introduced.

## Storage

Files use the private `material-files` Supabase Storage bucket. Object paths are
`<workspace>/<material>/<random>-<safe filename>`. The database stores that
path, not a public or expiring URL. `/api/materials/[materialId]/open` checks the
authenticated workspace and creates a 60-second signed URL. Replacing a file
uploads the replacement first, updates the same material row, and only then
removes the old object.

The bucket independently enforces the 10 MB limit and MIME allowlist. The API
also validates size, extension and MIME type before upload.

## Archive semantics and lesson compatibility

Archive is an `archived_at` update, never a normal destructive delete. Active
library queries hide archived rows. `lesson_materials` uses restrictive foreign
keys and is not changed during archive, so a material attached to a historical
lesson remains resolvable. The lesson workspace includes archived materials
when they are already attached, while excluding them from the attach-new list.

## Privacy and security

All reads derive the workspace from the authenticated tutor profile; clients do
not submit a workspace ID. Material RLS is workspace-scoped. Insert and update
policies additionally require `private.can_mutate_workspace`, which rejects a
read-only subscription and requires the authenticated owner identity. Storage
select is workspace-scoped, storage writes require a writable workspace member,
and the bucket is not public. No service-role credential reaches browser code.

Read-only accounts can list, search and open materials, but the UI, server
service, table RLS and storage policies all block mutation.

## Deferred functionality

D3.1 deliberately excludes AI generation/search, embeddings, automatic or
advanced tagging, lesson templates, recommendations, public sharing,
marketplace/collaboration, version history, and Google Drive or Dropbox sync.
