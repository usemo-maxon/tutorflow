# L0.12 — Final launch QA and production readiness

## Launch status

**READY WITH MANUAL PRODUCTION ACTIONS**

The representative local launch journey, critical responsive surfaces, launch
security boundaries, pricing configuration, and automated quality gate are
ready. Production still requires the provider, dashboard, environment, and
post-deploy checks listed below. No unresolved P0 or P1 product issue is known.

## Tested user journey

### New tutor

- Public landing, registration form, safe Google entry failure, password-reset
  entry, protected-route redirect, email/password login, and logout were
  exercised.
- A disposable file-backed tutor completed `/app/start`: profile ready → first
  student → first lesson → 3/3 required steps → Dzisiaj.
- Onboarding progress changed immediately after student and lesson creation.
- Completion redirected to `/app/dzisiaj`; the onboarding reminder disappeared.
- The test student used a long Polish name. Create, edit, profile, archive,
  archived view, and restore all worked without layout failure.
- A long-name group was created, opened, edited through the normal group UI,
  and given a member without corrupting the student profile.

### Existing tutor

- The seeded/onboarded tutor logged in directly to `/app/dzisiaj` and was not
  forced through onboarding.
- Global `+ Dodaj` exposed Lesson, Student, Group, Block time, Payment, and
  Package from Dzisiaj, Calendar, and Profile settings.
- The mobile search trigger and `Ctrl+K` opened the command palette. Navigation,
  create commands, student/group/lesson search, ArrowUp/ArrowDown, Enter, Escape,
  fresh query results, and focus return were verified. Search requests were made
  only after entering a query.

### Calendar and lesson workspace

- Calendar day/agenda rendering, event cards, creation entry points, dialogs,
  and scrolling were checked at the launch breakpoints.
- Calendar move, recurrence scope, range creation, block creation, and external
  Google read-only behavior remain covered by the focused calendar Vitest and
  pgTAP suites.
- A realistic lesson pass saved objectives, a private note, a student summary,
  homework, and a material link; marked both participants present; and completed
  the lesson.
- Completion stayed disabled until every participant had attendance. The
  completed state became historical and the previous-lesson link remained
  available.
- Completion created one 130 zł receivable for each of the two participants;
  no duplicate charge appeared.

### Finance

- Charges, totals, tabs, filters, search, payment dialog, package dialog, and
  archived-student candidates were inspected in the browser.
- The local file adapter intentionally rejects payment and package writes because
  those operations require transactional database RPCs. Partial/remainder
  allocation, idempotency, package charge/payment/consumption, archived debt,
  pagination totals, and read-only enforcement are covered by the finance
  Vitest and Supabase pgTAP suites.

### Integrations and subscription

- Google connected/error/reconnect copy, Telegram unavailable/locked copy, and
  PayU unavailable copy were safe and Polish; no provider code, token, HTTP 410,
  `invalid_grant`, `sync_token`, or watch-channel detail was rendered.
- The local adapter was not used to contact or mutate real providers.
- Landing and subscription settings showed Free 0 zł, Pro 44,99 zł monthly,
  Pro 399 zł annual, Founder 29,99 zł monthly, and a 14-day Pro trial.
- Checkout accepts only monthly/annual products and resolves the trusted amount
  on the server. Browser return state cannot activate a subscription; the signed
  PayU webhook remains authoritative.
- Trial expiry preserves account data and moves only the subscription to active
  Free. The server-side three-active-student Free limit and read-only mutation
  boundary are covered by regression tests.

## Fixed blockers

### P1 — lesson workspace overflow at the tablet breakpoint

- **Scenario:** `/app/lekcje/[lessonId]` at 768 × 1024.
- **Cause:** the lesson color panel retained four desktop columns at 768 px, so
  the `Zapisz kolor` button ended at x=815 and created page-level overflow.
- **Fix:** the panel now uses two minmax columns at widths up to 980 px; the
  existing one-column mobile rule still applies below 768 px.
- **Regression:** `src/lib/launch-responsive.test.ts` protects the breakpoint
  contract. Browser recheck measured document width 753 px in a 768 px viewport
  and the button entirely inside the viewport.

No unresolved P0/P1 issues.

## Known deferred issues

Only non-blocking/local-only items remain:

- The file-backed demo cannot persist finance payments or packages. Production
  uses the transactional Supabase RPC path.
- Invalid credentials in the file-backed adapter show the generic safe network
  message instead of the more specific invalid-credentials copy. The production
  Supabase branch returns the intended safe 401 message.
- The StudentComposer required-name error is visible and not color-only, but its
  input does not currently expose `aria-describedby` to the error element.
- Real Google OAuth, Telegram webhook delivery, and PayU order creation require
  production or intentionally configured sandbox credentials and remain manual.
- `README.md` still describes the older external-scheduler-only cron arrangement;
  `vercel.json` and this launch checklist describe the current Hobby-compatible
  daily Google sync cron.

## Responsive results

| Viewport | Result |
| --- | --- |
| 390 × 844 | PASS — landing, auth, Dzisiaj, Calendar mobile agenda, Students, student detail, lesson workspace, Payments, settings, subscription, onboarding, global create, command palette, and dialogs had no page-level horizontal overflow. |
| 768 × 1024 | PASS after the P1 fix — all critical pages fit; the lesson color panel no longer pushes controls off-screen. |
| 1440 × 900 | PASS — critical launch surfaces rendered with one logical page H1, no overlay, no invalid date/number placeholders, and no horizontal overflow. |

Long student/group names, a long note, dialog scrolling, fixed navigation, and
Polish wrapping were included in the pass.

## Accessibility results

- Representative pages had one logical H1; section headings followed it.
- Skip navigation, semantic links/buttons, labeled form controls, visible focus,
  and Radix dialog focus trapping were present.
- `+ Dodaj`, command palette, StudentComposer, LessonComposer, and finance dialogs
  were keyboard reachable. Escape closed the command palette and returned focus
  to the search trigger; closing StudentComposer returned focus to `Dodaj`.
- Required errors were visible in Polish and did not rely on color alone.
- Toasts and offline/read-only banners use status/alert live regions.
- No keyboard trap or launch-blocking contrast/focus issue was observed.

## Security smoke results

- Anonymous access to `/app/*` redirected to `/logowanie`; logout invalidated the
  local session. Invalid entity IDs returned safe Polish not-found states.
- Repository/service operations derive the tenant from the authenticated teacher;
  cross-workspace mutation and RLS behavior remain covered by Vitest and pgTAP.
- Finance rejects cross-site mutations before invoking the service layer. Other
  authenticated mutations use same-origin cookies and server-owned teacher IDs.
- Read-only state removes global create commands and server services reject
  direct mutation attempts; coverage includes finance and calendar paths.
- Rendered HTML on the final smoke routes contained no service-role key, Google
  client secret, refresh token, integration encryption key, `CRON_SECRET`, or
  PayU secret marker.
- Only `.env.example` is tracked. Production fails closed without Supabase.

## Production environment checklist

Use names only here; never copy values into tickets or logs.

### Supabase

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `SUPABASE_SECRET_KEY`
- [ ] If using the Vercel Supabase integration instead, verify accepted aliases:
      `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Confirm `TUTORFLOW_DATA_DIR` is absent in Production.

### Application and Google Calendar

- [ ] `NEXT_PUBLIC_SITE_URL`
- [ ] `GOOGLE_CALENDAR_CLIENT_ID`
- [ ] `GOOGLE_CALENDAR_CLIENT_SECRET`
- [ ] `GOOGLE_CALENDAR_REDIRECT_URI`
- [ ] `GOOGLE_CALENDAR_WEBHOOK_URL`
- [ ] `INTEGRATION_ENCRYPTION_KEY`

### PayU

- [ ] `PAYU_POS_ID`
- [ ] `PAYU_CLIENT_SECRET`
- [ ] `PAYU_SECOND_KEY`
- [ ] `PAYU_API_BASE_URL`

### Telegram and cron

- [ ] `TELEGRAM_BOT_TOKEN`
- [ ] `TELEGRAM_BOT_USERNAME`
- [ ] `TELEGRAM_WEBHOOK_SECRET`
- [ ] `CRON_SECRET`

## Provider dashboard checklist

### Supabase Auth

- [ ] Set Site URL to the canonical production HTTPS origin.
- [ ] Allow only intended production/preview callbacks, including
      `/auth/callback` and `/api/auth/callback`.
- [ ] Enable/configure the Google provider when Google login is offered.
- [ ] Confirm email confirmation and production SMTP/templates.
- [ ] Confirm minimum password policy and leaked-password protection where the
      selected Supabase plan supports it.

### Google Cloud

- [ ] Enable Google Calendar API.
- [ ] Configure the Calendar OAuth client authorized redirect URI to the exact
      production `GOOGLE_CALENDAR_REDIRECT_URI`.
- [ ] Publish/configure the OAuth consent app and request only the required
      Calendar events scope.
- [ ] Confirm `GOOGLE_CALENDAR_WEBHOOK_URL` is public HTTPS and points to
      `/api/webhooks/google-calendar`.
- [ ] Separately verify the Supabase Google-login callback URI when Google login
      is enabled; it is not the Calendar integration callback.

### PayU

- [ ] Choose production or sandbox deliberately; set `PAYU_API_BASE_URL` to the
      matching endpoint.
- [ ] Verify POS/merchant configuration and OAuth client credentials.
- [ ] Configure notification URL `/api/webhooks/payu` and continue URL
      `/app/ustawienia/subskrypcja?payment=processing` on the canonical domain.
- [ ] Verify Second key/signature configuration. Never infer success from the
      continue URL; confirm a signed webhook changes the subscription.

### Telegram

- [ ] Register `/api/webhooks/telegram` on the canonical HTTPS domain.
- [ ] Set the same `TELEGRAM_WEBHOOK_SECRET` in Telegram and Vercel.
- [ ] Confirm the configured bot username matches `TELEGRAM_BOT_USERNAME`.

## Database and migration checklist

- [x] L0.12 changes no SQL; no database reset, push, or advisor run was needed.
- [x] Local migration filenames are ordered and include L0.10 finance hardening
      after the L0.9 Google and L0.5 onboarding migrations.
- [ ] Link the intended production Supabase project and compare migration history.
- [ ] Apply committed migrations with the Supabase CLI from a reviewed deployment
      context; do not reset or truncate production.
- [ ] Run `npx supabase db reset` and `npx supabase test db` against a local stack
      before applying any later SQL change.
- [ ] Confirm private attachment storage, RLS, backups/PITR, and that the private
      schema is not exposed through the Data API.

## Deployment checklist

- [ ] Point Vercel at the protected production branch and canonical domain.
- [ ] Use Node.js 22.x, `npm ci`, and `npm run build`.
- [ ] Add all required Production variables and separate sandbox values for
      Preview; redeploy after domain-dependent variables are final.
- [ ] Keep the current Hobby-compatible daily cron in `vercel.json`:
      `/api/cron/google-sync` at 03:00 UTC. Verify `CRON_SECRET` is available to
      the route and Vercel sends the cron authorization header.
- [ ] Configure any higher-frequency Telegram/Google processing through the
      trusted external scheduler only if the launch operating model requires it;
      give that scheduler only endpoint URLs and `CRON_SECRET`.
- [ ] Confirm the latest production deployment is healthy and
      `/api/health` reports a reachable database.

## Post-deploy smoke checklist

- [ ] Open landing and verify current pricing.
- [ ] Register one disposable test tutor and complete email confirmation.
- [ ] Log in, create one test student, and create one test lesson.
- [ ] Open Dzisiaj, Calendar, Payments, Integrations, and Subscription.
- [ ] Start monthly and annual PayU sandbox checkout without completing a real
      charge; verify neither cancel nor return state activates Pro.
- [ ] Test real Google OAuth only when production credentials and consent status
      are intentionally ready.
- [ ] Remove only the disposable fixtures created by the launch operator.
- [ ] Verify there are no critical browser-console or server errors.

## Immediate launch monitoring

Use existing Vercel/Supabase/provider logs; do not add a new platform for L0.12.
Watch:

- 5xx rate and auth callback failures;
- Google reconnect, webhook, incremental-sync, and watch-renewal failures;
- PayU webhook signature/confirmation failures;
- finance RPC and idempotency failures;
- cron authorization/execution failures;
- unexpected `PLAN_LIMIT_REACHED` or `READ_ONLY` responses.

