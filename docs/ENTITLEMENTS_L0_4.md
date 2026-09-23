# L0.4 — Centralized entitlements

## Principles

- `src/lib/entitlements.ts` is the single source of truth for product capabilities.
- Subscription tier and billing interval are separate. Billing cadence never changes capabilities.
- The server derives authorization from trusted subscription data; browser values are presentation only.
- A trial receives the complete Pro capability set for the existing 14-day trial period.
- Founder and Pro have identical product capabilities. Founder differs only commercially.
- `subscription.readOnly` remains a separate lifecycle/mutation rule and is not part of entitlement resolution.

## Matrix

| Capability | Free | Trial | Pro | Founder |
| --- | ---: | ---: | ---: | ---: |
| Active students | 3 | Unlimited | Unlimited | Unlimited |
| Core calendar | Yes | Yes | Yes | Yes |
| Lessons | Yes | Yes | Yes | Yes |
| Homework | Yes | Yes | Yes | Yes |
| Payments/packages | Yes | Yes | Yes | Yes |
| Google Calendar | No | Yes | Yes | Yes |
| Telegram reminders | No | Yes | Yes | Yes |
| Advanced statistics | No | Yes | Yes | Yes |
| Automations | No | Yes | Yes | Yes |
| Public booking | No | Yes | Yes | Yes |
| Student portal | No | Yes | Yes | Yes |
| AI | No | Yes | Yes | Yes |

Advanced statistics is reserved for a future clean split between basic statistics and advanced analytics. The current Statistics page remains available. Automations, public booking, Student Portal, and AI are entitlement flags only; no routes, navigation, or placeholder features were added.

## Enforcement points

- Local/file-backed `performAction`: checks capacity before creating an active student or restoring an archived student.
- Relational Supabase `mutatePeopleDomain`: reads the canonical subscription and active-student count before the same two mutations.
- Google OAuth connect/reconnect route: requires `googleCalendar`.
- Google manual-sync route: requires `googleCalendar` before queuing work.
- Google connection maintenance and outbound-job workers: filter work by the trusted subscription before processing.
- Telegram connect route: requires `telegramReminders` before creating a link code.
- Telegram reminder worker: filters deliveries by the trusted subscription before claiming or sending them.

All plan failures use HTTP 403 with `PLAN_REQUIRED` or `PLAN_LIMIT_REACHED`. PayU checkout, PayU webhooks, subscription settings, basic statistics, calendar, lessons, and finance are not gated.

## Student-limit and concurrency behavior

Archived students do not count. Creating student 1, 2, or 3 is allowed for active Free; creating student 4 is rejected. Restoring an archived student is rejected when three active students already exist. Editing and archiving remain allowed.

Pre-existing Free accounts with more than three active students are grandfathered: no student is changed or deleted, but creating or restoring another active student remains blocked until the active count falls below three.

The relational path performs the count and mutation as separate server operations. This is the safest minimal guard in the current repository, but two truly simultaneous requests could both observe available capacity. A small transactional database RPC is recommended as a focused follow-up if strict race-proof enforcement is required; L0.4 does not introduce a broader entitlement migration or weaken RLS.

## Downgrade behavior

Google and Telegram connection records, encrypted credentials, mappings, and external events are preserved after downgrade. Active Free accounts are omitted from new Google sync/maintenance work and Telegram reminder delivery. Pending work remains durable and is not mislabeled as an OAuth/provider failure, so an upgrade can resume processing.

Students above the Free limit remain intact. No automatic archive or deletion occurs.

## Deferred

- L0.5 onboarding
- L0.11 pricing, landing, trial, and subscription UX
- Future advanced statistics separation
- Future booking, Student Portal, AI, and automations
