# Dzisiaj Action Center — D1.6

## Purpose

`Dzisiaj` is the tutor's daily operating screen. It prioritizes the next teaching moment, unfinished work, and reliable blockers without becoming an analytics dashboard or a general notification inbox.

## Information hierarchy

1. Current or next lesson today
2. Derived `Do zrobienia` actions
3. Today's lesson chronology
4. Upcoming lessons and quick actions
5. Existing monthly summary

On narrow screens the order is next lesson, actions, today's lessons, upcoming lessons, quick actions, and monthly summary.

## Next lesson

The top card selects a non-cancelled lesson that is currently within its scheduled interval; otherwise it selects the nearest future scheduled lesson today. It never promotes tomorrow's lesson into today's top card.

Only this lesson receives a D1.5 briefing preview. A 1:1 preview can show the latest progress, difficulty note, and next step. No prior memory is presented calmly as `Pierwsza lekcja z tym uczniem.` A group preview contains only the participant count and the number of participants with context; participant details remain in the lesson workspace.

## Today's lessons

Today's rows use the canonical lesson lifecycle: scheduled, needs completion, completed, cancelled, and no-show. `Teraz` is derived from the current time and scheduled interval; it is not persisted as another status. `needs_completion` routes to the existing lesson completion flow. Completed lessons remain visible but de-emphasized.

## Derived actions

Actions are a typed discriminated union with stable IDs. Nothing is persisted in a task or notification table.

- `unfinished:<lessonId>` — a recent lesson in `needs_completion`
- `continuity:<lessonId>` — a recent completed lesson where at least one participant lacks a meaningful outcome
- `overdue:<studentId>:<currency>` — canonical overdue balance, aggregated per student and currency
- `package:<lessonId>:<studentId>` — a future package-billed lesson without an eligible active package balance
- `google:reconnect` — entitled Google Calendar integration in reconnect-required or persistent error state
- `onboarding:complete` — incomplete onboarding

An outcome provides useful continuity when at least one of `progressSummary`, `difficultyLevel`, `difficultyNote`, or `nextStep` is meaningful. Optional blank fields do not create an action when another meaningful field exists.

## Priority rules

Ordering is deterministic and category-based:

1. Package problem blocking a future lesson
2. Unfinished lesson
3. Google reconnect or persistent sync error
4. Overdue finance
5. Missing continuity
6. Onboarding reminder

There is no numeric product score or AI ranking. The initial view shows five actions and reports how many additional actions remain.

## Time windows

- Unfinished lessons: previous 14 teacher-local calendar days
- Missing continuity: previous 7 teacher-local calendar days
- Upcoming lessons: next 14 teacher-local calendar days, with seven returned to the dashboard
- Today's lessons: capped at 24

These constants live in `src/lib/dashboard.ts`. Repository queries also have explicit row limits.

## Timezone

Today, month, cutoff, and upcoming boundaries come from the teacher timezone. Each local midnight is converted independently to UTC, so DST transition days are not assumed to last 24 hours. Displayed lesson times use the same teacher timezone.

## Group behavior

A group lesson produces one missing-continuity action per lesson, including an aggregate `N z M` count. The next-lesson card reports only aggregate readiness. It never renders one participant's outcome, difficulty, homework, or next step in the shared group preview.

## Privacy

Detailed D1.5 context remains in the authenticated lesson workspace. The dashboard response includes a compact 1:1 preview only for the selected next lesson, and aggregate counts for a group.

## Finance and packages

Finance attention uses `charge_balances.is_overdue`; a future-due outstanding amount is not an alert. Totals are grouped by student and currency, with no FX conversion. Package attention is limited to scheduled package-billed lessons whose participant has no active, date-eligible package with a positive canonical balance. Low package balances are not warnings.

## Integrations

Google attention uses canonical connection and sync state. `pending` and `syncing` do not produce actions. A Free account without the Google entitlement never receives a reconnect action merely because its preserved connection cannot currently be used. Telegram disconnection is not surfaced.

## Performance

The browser issues one no-store dashboard request. Server composition uses bounded parallel queries for today's lessons, recent unfinished and completed lessons, upcoming lessons, finance, packages, and integration state. Detailed briefing composition runs only for the selected current/next lesson; no browser per-card memory requests are made. Auxiliary briefing, actions, and monthly-summary failures are isolated from the core lesson plan where possible.

## Deferred

- Notification center
- Custom tasks
- AI prioritization or summaries
- Push alerts
- Automatic lesson planning
- Action dismissal persistence

No migration is required for D1.6.
