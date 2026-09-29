# Next Lesson Briefing — D1.5

## Purpose

Prepare the tutor in seconds inside the existing lesson workspace. The briefing is deterministic, derived, and read-only; it is not stored separately.

## Sources

- Student Memory (D1.3) for historical continuity
- target lesson for participants, topic, and objective
- student profile for name, level, and long-term goal

## Fields

- **Ostatnio** — newest completed lesson topic, date, and participant-specific progress summary when present
- **Problem** — latest explicit difficulty level and note from Student Memory
- **Praca domowa** — canonical latest homework and supported due date
- **Następny krok** — latest non-empty historical next step, with source lesson provenance
- **Cel na dziś** — current lesson objective, falling back to the current lesson topic; never inferred from historical memory

`nextStep` is the historical intention recorded in previous context. `todayGoal` is current lesson planning data. They remain separate even when their wording is similar.

## Group behavior

The endpoint uses the target lesson's `lesson_participants` snapshot, preserving its stable order. The workspace displays compact keyboard-operable tabs and one participant's detail at a time. Shared lesson-level homework can legitimately appear for multiple participants.

## Privacy

Each participant briefing is composed from that student's D1.3 memory. Participant-specific progress, difficulty, and next step are never merged into a group narrative. Lesson ownership is checked using the authenticated tutor/workspace before participant memory is resolved.

## First lesson / legacy behavior

With no completed history the UI shows a single first-lesson message, plus student goal and current goal when present. A legacy completed lesson can still show date/topic; absent outcomes are omitted rather than fabricated.

## Performance

The browser performs one briefing request per lesson, never one request per participant. On the server, participant memories are resolved directly and in parallel using the bounded D1.3 history limits (5 completed lessons and 10 attendance events); no full workspace history is preloaded and no server-to-server HTTP calls are made. Responses use `private, no-store`; the client uses one canonical React Query key and a short 30-second stale window.

## Lifecycle and failure isolation

The briefing is requested only for `scheduled` and `needs_completion` lessons. Completed, cancelled, and no-show lessons retain their lifecycle-specific UI. Loading and failure are local to the briefing, so the lesson workspace remains usable.

## Migration

No migration required. No briefing table, cache column, or duplicate memory persistence was added.

## Deferred

- AI-generated lesson plans
- automatic recommendations
- Dzisiaj briefing surface / Action Center
- group-level synthesized briefing
