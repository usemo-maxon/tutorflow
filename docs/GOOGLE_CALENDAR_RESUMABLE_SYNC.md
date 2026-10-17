# Google Calendar resumable synchronization

## What changed

Google event imports are split into provider pages of 100 events. Each enabled
calendar owns its cursor, run identifier, counters, state and expiring lease.
A page cursor is persisted only after its database reconciliation succeeds; the
final Google `nextSyncToken` is persisted only after the final page succeeds.

Visible calendar ranges use `google_calendar_range_backfills`. These requests
use `timeMin`/`timeMax`, expand recurring instances with `singleEvents=true`,
and never read or write the global incremental token. Opening a month therefore
prioritizes that month without declaring the whole Google calendar complete.

Safe external events are mapping-prefetched and bulk-upserted/deleted per page.
Events linked to an easy4tutor Lesson retain the existing conflict resolution
and idempotent mapping behavior. Full-run cleanup happens only on the final page
and is suppressed if any item in the run was malformed.

## Production recovery

This procedure preserves imported events, mappings, visibility, busy settings,
colors, credentials and Google tokens.

1. Deploy the application and apply migration
   `20261017143131_google_calendar_resumable_sync.sql` using the normal
   production migration workflow. Do not reset the database.
2. Confirm the Google sync cron remains configured and `CRON_SECRET` is present.
3. In **Ustawienia → Integracje**, select **Synchronizuj teraz** once. The
   existing connection becomes pending and resumes from its durable page cursor.
4. Open the affected month (for example October 2026). This creates an
   independent bounded backfill for every enabled calendar. Keep the page open
   through the next automatic refresh, or revisit it after the worker finishes.
5. Verify, without changing data:

   ```sql
   select summary, sync_state, processed_event_count,
          last_attempted_sync_at, last_successful_sync_at,
          recoverable_failure, sync_page_token is not null as has_page_cursor
   from public.google_calendars
   where connection_id = '<connection-id>'
   order by is_primary desc, summary;

   select c.summary, b.range_start, b.range_end, b.state,
          b.processed_event_count, b.completed_at
   from public.google_calendar_range_backfills b
   join public.google_calendars c on c.id = b.calendar_id
   where b.connection_id = '<connection-id>'
   order by b.created_at desc;
   ```

6. A healthy enabled calendar ends in `idle`, has a non-null
   `last_successful_sync_at`, no page cursor, and `recoverable_failure = false`.
   The selected month is complete only when every enabled calendar has an `idle`
   range row for that exact range.
7. If a function is interrupted, do not clear tokens or delete the connection.
   Wait two minutes for the lease to expire, then use **Synchronizuj teraz** or
   let the authorized cron reclaim the work. Retries are idempotent.
8. Use **Połącz ponownie** only for `reconnect_required` (lost/invalid Google
   authorization), not for an ordinary recoverable import failure.

## Operational notes

- Hidden calendars continue synchronizing; `visible` only controls rendering.
- `sync_enabled` controls whether a calendar is imported.
- All-day rows retain Google's exclusive end date and do not block hourly
  availability.
- Logs contain calendar identifiers, page sizes, counts, durations and cursor
  transitions, but no descriptions, attendees or OAuth credentials.
