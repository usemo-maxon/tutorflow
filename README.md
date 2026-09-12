# TutorFlow

TutorFlow is a Next.js 16 App Router application for private teachers. The production stack is Vercel Hobby for the web/API/webhook runtime and Supabase for PostgreSQL, Auth, and private Storage. Scheduled execution is delegated to a trusted external scheduler.

Local development can use the existing file-backed demo store. It is deliberately disabled in `NODE_ENV=production`; production fails closed unless Supabase is configured.

## Development checks

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## Production deployment

### 1. GitHub

1. Create a private GitHub repository and push this directory, including `package-lock.json`, `supabase/`, and `vercel.json`.
2. Confirm no `.env*` file is tracked except `.env.example`: `git ls-files | grep -E '(^|/)\.env'` should print only `.env.example`.
3. Protect the production branch and require lint, typecheck, tests, and build in CI.

### 2. Supabase

1. Create a production project in an EU region appropriate for the GDPR data location decision.
2. Link the CLI and apply the committed migration:

```bash
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase db push
npx supabase migration list
```

The required migration is `supabase/migrations/20260912121318_production_foundation.sql`. It creates profiles, subscriptions, tenant aggregates, durable sync/reminder/payment queues, webhook idempotency records, private attachment metadata, RLS, and the private `attachments` bucket.

3. Run database policy tests against a local Supabase stack before production changes:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

4. Auth → URL Configuration:
   - Site URL: `https://YOUR_DOMAIN`
   - Redirect URLs: `https://YOUR_DOMAIN/api/auth/callback` and, for previews only, the exact trusted preview callback URL.
5. Auth → Providers → Google: enable Google and enter the Auth OAuth client credentials. In Google Cloud, the authorized redirect URI for this Supabase provider is `https://PROJECT_REF.supabase.co/auth/v1/callback`.
6. Keep email confirmation enabled. Configure production SMTP and edit confirmation/reset templates so links use the configured redirect URL.
7. Storage: verify `attachments` is private, file limit is 10 MB, MIME allow-list matches the migration, and no public object policy exists. Object keys must start with the authenticated teacher UUID (`TEACHER_UUID/...`). Serve downloads only with short-lived signed URLs.
8. Do not expose the `private` schema in Data API settings. Keep `public` exposed; RLS is enabled on every application table. Admins can read account/subscription rows, but RLS intentionally denies them access to `teacher_states`, attachments, integration credentials, and lesson/student content.
9. Enable daily backups/PITR according to the selected Supabase plan and configure project network restrictions where operational access allows it.

To create an SaaS admin manually, update `public.profiles.role` to `admin` for that already-created Auth user. Never put a role in user-editable `user_metadata` and never use an admin account to bypass private-content policies.

### 3. Google Calendar

Create a separate Google OAuth 2.0 Web Application client for Calendar and enable Google Calendar API. Add this exact authorized redirect URI:

`https://YOUR_DOMAIN/api/integrations/google/callback`

Add the canonical origin `https://YOUR_DOMAIN` as an authorized JavaScript origin if required by the consent configuration. Request only `https://www.googleapis.com/auth/calendar.events`. Configure and publish the OAuth consent screen. `GOOGLE_CLIENT_SECRET` is used only by Vercel Route Handlers and cron processing.

Google login through Supabase and Calendar access are intentionally separate OAuth clients/flows. The app login callback is `https://YOUR_DOMAIN/api/auth/callback`; Google Cloud redirects Supabase Auth through `https://PROJECT_REF.supabase.co/auth/v1/callback`.

### 4. Telegram

Create the centralized bot with BotFather and set its username/token in Vercel. Register:

```bash
curl -X POST "https://api.telegram.org/botBOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR_DOMAIN/api/webhooks/telegram","secret_token":"TELEGRAM_WEBHOOK_SECRET","allowed_updates":["message"]}'
```

The webhook URL is `https://YOUR_DOMAIN/api/webhooks/telegram`. The secret must contain only letters, digits, `_`, or `-`. Teacher chat IDs are encrypted at rest; one-time link codes and processed update IDs are stored in PostgreSQL.

### 5. PayU

Create/activate a PayU shop and REST API POS. Put the POS ID, OAuth client secret, and Second key (MD5) in Vercel. Production endpoints:

- `notifyUrl`: `https://YOUR_DOMAIN/api/webhooks/payu`
- `continueUrl`: `https://YOUR_DOMAIN/app/ustawienia/subskrypcja?payment=processing`

For preview testing set `PAYU_API_BASE_URL=https://secure.snd.payu.com` and use sandbox credentials. Production uses `https://secure.payu.com`. The notification handler validates `OpenPayu-Signature` against the raw request body and Second key, records an idempotency key, and atomically activates the subscription. The continue redirect never activates access.

### 6. Vercel

Import the GitHub repository and use:

- Framework Preset: `Next.js`
- Root Directory: repository root
- Node.js: `22.x`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: leave empty (Next.js default)
- Development Command: `npm run dev`
- Functions region: choose the closest available region to the Supabase project
- Production branch: the protected production branch

Add every variable from `.env.example` to Production. Use separate Supabase/Google/PayU sandbox credentials for Preview. Never set `TUTORFLOW_DATA_DIR` in Vercel. `NEXT_PUBLIC_SITE_URL` must be the canonical HTTPS custom domain, not a Vercel preview or localhost URL.

Attach and verify the custom domain in Vercel, make it primary, redirect the generated `*.vercel.app` hostname to it, and redeploy after setting the domain-dependent variables.

`vercel.json` intentionally contains no `crons` configuration, so the deployment is compatible with Vercel Hobby's daily-only cron restriction. Do not add a daily Vercel workaround: the endpoints below are invoked by an external scheduler.

#### External scheduler

The scheduler needs only the HTTPS endpoint and `CRON_SECRET`. It must not receive Supabase keys, Google credentials, the Telegram bot token, PayU secrets, or any teacher data. Business logic and idempotency remain in TutorFlow and PostgreSQL; the scheduler only triggers one processing pass.

##### Telegram reminders

- Method: `GET`
- URL: `https://YOUR_DOMAIN/api/cron/telegram-reminders`
- Header: `Authorization: Bearer CRON_SECRET`
- Recommended interval: `15 min`

##### Google Calendar sync

- Method: `GET`
- URL: `https://YOUR_DOMAIN/api/cron/google-sync`
- Header: `Authorization: Bearer CRON_SECRET`
- Recommended interval: `15 min`

##### Maintenance

- Method: `GET`
- URL: `https://YOUR_DOMAIN/api/cron/maintenance`
- Header: `Authorization: Bearer CRON_SECRET`
- Recommended interval: `daily`

All endpoints return `401` without the exact Bearer token. Successful responses contain only compact operational counters. Telegram deliveries and Google jobs are claimed from durable PostgreSQL state; repeated scheduler calls cannot send an already completed reminder or create another Google event for the same lesson. Maintenance transitions and cleanup operations are state-based and safe to repeat.

After deployment verify `GET https://YOUR_DOMAIN/api/health` returns HTTP 200 and `{ "status": "ok", "database": "reachable" }`.

### Environment variables

Public (included in the browser bundle): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Server-only: `SUPABASE_SECRET_KEY`, `INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `PAYU_POS_ID`, `PAYU_CLIENT_SECRET`, `PAYU_SECOND_KEY`, `PAYU_API_BASE_URL`.

Rotate a credential immediately if it has ever been committed. Rotating `INTEGRATION_ENCRYPTION_KEY` requires a planned re-encryption of stored provider credentials.
