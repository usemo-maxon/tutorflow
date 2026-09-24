# L0.7 — Global search and command palette

## Purpose

The authenticated easy4tutor shell provides a focused command palette for fast navigation, existing creation workflows, and tutor-workspace entities. It is a productivity layer rather than a generic full-text search engine.

## Shortcut

`Cmd+K` on macOS and `Ctrl+K` on Windows/Linux open the same palette. The desktop sidebar and mobile header also expose visible search triggers.

## Data sources

- static navigation descriptors,
- the six existing L0.6 global create actions,
- server-side student search,
- server-side group search,
- server-side lesson search.

Navigation and create commands filter immediately in the browser. Entity data is loaded only after a trimmed two-character query.

## Search boundaries

Students match display name, first name, last name, email, phone, subject, and level. Groups match name, subject, and level. Archived students and groups remain available and are marked in the UI, while active matches win equivalent rankings.

Lessons match topic/title, subject, student name, or group name. The endpoint searches only from 90 days in the past through 180 days in the future and excludes cancelled lessons. Results prefer upcoming scheduled lessons, then recent historical lessons.

Response limits are six students, four groups, and six lessons. The response contains only palette labels, status, dates, IDs, and trusted application routes—never notes, financial records, credentials, tokens, or private lesson summaries.

## Performance

The AppShell does not call `useAppData` and does not preload the tutor workspace. Entity search is demand-driven through `GET /api/search`, starts at two characters, and is debounced by 200 ms. React Query passes an abort signal to `fetch`, so an obsolete request cannot replace a newer query. Production queries are workspace-scoped and bounded; lesson queries also enforce the date window and exclude cancelled rows.

## Security

The route derives the authenticated teacher on the server. The production adapter verifies the Supabase user again, derives `workspace_id` from the trusted `tutor_profiles` mapping, and applies that workspace to every entity query. No client-provided teacher or workspace ID is accepted. User text is passed through parameterized Supabase filters with LIKE metacharacters escaped; no raw PostgREST `.or()` expression is constructed.

The local file-backed adapter applies the same teacher isolation, date window, status exclusions, response shape, and limits.

## Create-action reuse

The palette descriptors use the existing `GlobalCreateAction` IDs and `getGlobalCreateRoute(...)`. AppShell passes the same L0.6 dispatcher to `GlobalCreateMenu` and `GlobalCommandPalette`, so lesson/student composers and group, calendar, payment, and package routes do not have duplicate routing logic.

## Read-only behavior

Read-only accounts retain navigation and entity search. All six mutation commands are omitted from palette generation, matching the existing disabled global create menu and preserving server-side mutation protection as the authority.

## Accessibility and focus

Radix Dialog supplies modal focus trapping and Escape/outside dismissal. The search input uses combobox/listbox semantics, a single stable selection model, and Arrow Up/Down, Home, End, and Enter controls. Dynamic states use live status messages. Ordinary dismissal restores the opening trigger; command activation suppresses that restoration so an existing Radix composer can receive focus.

## Deferred

- finance entity search,
- materials search,
- AI search,
- persistent search history,
- external search services,
- advanced fuzzy-search infrastructure.
