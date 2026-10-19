# Public profile completion — implementation progress

Release boundary: local changes and local verification only. Production changes require approval.

## Initial implementation audit (2026-10-19)

Status is based on source inspection; existing functionality is not called tested until verification below.

| Area | Existing implementation | Gap / priority |
| --- | --- | --- |
| Identity, subjects, specializations, about, methods, links | Persistent draft and public renderer exist | Languages missing from editor; some methods are not editable |
| Draft / publication | Separate JSON snapshots and publish RPC exist | Save failures can leave pending UI; concurrent writes; equality compares operational metadata; published link follows draft slug |
| Preview / mobile | Two-panel studio and mobile switch exist | Return-to-editor control is inside hidden editor; needs browser QA |
| Section layout / themes | Four themes, color, titles/order/visibility exist | No entitlement enforcement; some read-only controls remain enabled |
| Education / experience | Persistent timeline and renderer exist | Dates and descriptions not editable |
| YouTube | Allowlisted ID and click-to-load privacy embed | URL validation and replacement UX need tightening |
| Hosted video | Direct signed upload and private Storage bucket exist | 100 MB instead of 75 MB; no duration validation, finalization, reservation quota, progress or cleanup |
| Certificates | Images/PDFs, basic fields and visibility exist | Hidden documents leak in public payload and receive signed URLs; no publication limit, reorder/replace workflow or cleanup |
| Public media authorization | Owner-scoped upload paths | Public signer accepts foreign-owner path from direct JSON writes; deletion can break published snapshot |
| Offers / prices | Existing booking event types are authoritative | No Free publication cap; ordering updates are not atomic |
| Booking | Existing availability, transaction, confirmation and management flow | Student conversion has separate capacity enforcement; prospect-side capacity semantics require further review |
| Reviews | No public review model | Consent, moderation and genuine review collection are missing; private feedback must remain private |
| SEO | Canonical, metadata, OG and Person/Offer JSON-LD exist | No advanced fields / gating |
| Analytics | First-party aggregate funnel and attribution exist | No basic/advanced split, time series or refresh deduplication; reporting errors become empty states |
| Entitlements | Central resolver; Founder, trial and verified lifetime grants | Public-profile registry missing; Free publicBooking flag contradicts currently usable booking |
| Billing | Existing PayU, shared prices, Owner checkout exclusion | Public labels still Pro; marketing and settings need final implemented-feature comparison |
| Database | RLS owner isolation; explicit snapshots; slug redirects | Direct JSON writes bypass application validation; redirect collision protection needs database-level verification |
| Performance | SSR and request memoization; aggregate analytics | One signing request per media item; needless signing of hidden assets |

## Capability contract

Existing Next.js 16.3 App Router / npm application; authenticated editor and anonymous public profile. No scaffolding. Supabase remains the identity, relational data and object storage provider. Existing PayU and calendar integrations remain authoritative. Local Docker Supabase is available for verification. `npm run dev`, `npm run build`, `.next` and existing browser tools are the development/preview/build path. Environment names follow `.env.example`; credentials are not copied into reports. Vercel deployment is outside this execution's release boundary.

## Work tracking

- [x] Initial source audit and priority matrix.
- [x] Register requested profile capabilities in the central TypeScript resolver, including Owner/Founder inheritance and Free booking.
- [x] Publication privacy, draft recovery, and expanded editor fields; automated coverage added (browser verification tracked below).
- [ ] Enforce profile capability registry across SQL, API, Storage and UI; concurrency tests.
- [ ] Media reservations, server verification (including video duration), quotas, progress, replacement/deletion and orphan cleanup.
- [x] Deterministic downgrade projection for offers/certificates/theme/hosted video, preserving stored snapshots and restoring access on upgrade.
- [ ] Reviews with consent and moderation.
- [ ] Advanced SEO, analytics split and time series, booking capacity verification.
- [ ] Free/Premium marketing and subscription comparison tied to implemented capabilities.
- [ ] Full browser, database, security and production build verification.

Profile publication limits are now guarded by database triggers, public projections, and local-store services. Storage quotas, full media finalization, advanced analytics/SEO and pricing presentation remain open. The complete eight-phase brief remains open; no entire product phase is declared complete.

## Infrastructure finding

Supabase documents a 50 MB global upload ceiling for its Free infrastructure plan. The requested 75 MB upload needs a compatible existing infrastructure plan/global setting. No paid upgrade is authorized or performed. Source: https://supabase.com/docs/guides/storage/uploads/file-limits (checked 2026-10-19).

## Verification and release

No production migrations, Storage configuration, billing changes, price changes or deployment have been performed.

### Local verification results (2026-10-19)

- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm test`: 98 files, 531 tests pass. Final run used a dedicated temporary store.
- `npm run build`: pass, optimized Next.js build and TypeScript checks complete.
- `git diff --check`: pass.
- Complete SQL suite: 35 files, 792 assertions pass, including the final projection and direct booking-insert guard.
- `supabase db lint --local --schema public,private --level error --fail-on error`: no findings.
- `npm run test:browser:public-profile`: pass for draft loading, real autosave retaining unfinished FAQ, keyboard activation of preview at 390×844, return-to-editor click, no horizontal overflow, publish and unpublish. Initial pointer activation after viewport resizing was inconsistent in agent-browser, while keyboard activation and subsequent return/publish clicks passed. Manual mobile touch/pointer QA remains outstanding; this is not a full accessibility certification.
- Supabase/website-studio guidance informed the private data boundary, explicit capability contract, retention-first downgrade projection and isolated browser verification. No design-system replacement or production infrastructure change was made.

## Implemented vertical slices

### Publication privacy and editor recovery

- Public database responses use an explicit allowlist, omit hidden certificates/FAQ/section content, and remove arbitrary client-provided media URLs. Only paths belonging to the published tutor can reach the privileged signer. Owner media signing is batched; public URLs expire after five minutes.
- Authenticated profile writes validate the complete request shape, reject cross-origin requests and enforce existing read-only state, while preserving verified lifetime-owner access. Restrictive database policies also guard direct writes.
- Draft content stays separate from the published snapshot. The share link uses the published slug even while a new draft slug is being edited. Incomplete FAQ entries survive autosave. Content equality ignores operational timestamps and temporary signed URLs.
- Saves are serialized; failures clear the pending state, keep edits in memory and offer retry. Loading failures no longer masquerade as an empty profile. Autosave does not disable the form or overwrite edits made during a request; explicit publication temporarily locks profile fields.
- Languages, full teaching-method fields, timeline dates/descriptions, certificate expiry/descriptions/preview links and list reordering are editable. Multi-value fields use the existing tag-input component. Mobile preview has a return control within the preview panel.

### Plan-aware publication

- One TypeScript registry defines profile capabilities; a parity test compares its values to the SQL snapshot.
- Database triggers enforce direct JSON publication/customization and offer activation limits. A tutor-row lock serializes offer-cap checks. A concurrent-request stress test is still outstanding.
- Free's public projection selects two offers (display order, then ID) and the first visible certificate. Premium retains a technical 500-offer safety bound and ten public certificates. Existing excess records are not deleted on downgrade.
- The availability wrapper and booking-insert trigger prevent new bookings for over-limit offers, while reusing the existing scheduling engine. Existing bookings are not rewritten. Booking still creates a booking/prospect, not a Student; the existing separate student-capacity rules remain unchanged.
- Free falls back to the default theme and no hosted video. Hidden-section privacy choices remain hidden. Stored Premium customization/media and original certificates/offers return after upgrade.
- Editor preview uses effective plan projection. Premium customization is disabled with a subscription link on Free; new over-limit offers/documents start hidden. Publication-limit errors are actionable API responses.
- Media preparation now checks read-only access, origin, Premium eligibility for hosted video/posters, and the declared 75 MB ceiling. This is NOT server verification of uploaded bytes or duration; direct Storage bypasses remain a release blocker.

## Capability matrix: configured versus enforced

| Capability | Free | Premium / Founder / trial / verified Owner | Status |
| --- | --- | --- | --- |
| Active students | 3 | Unlimited | Existing resolver/creation enforcement retained; no new conversion audit |
| Public offers | 2 | Unlimited plan allowance, 500 safety bound | SQL + local store + public reads + availability/new bookings |
| Public certificates | 1 | 10 | SQL + local store + public projection; upload/storage quotas still missing |
| YouTube | Yes | Yes | Existing ID-only embed retained; non-HTTP URL schemes rejected |
| Hosted video | No | 75 MB / 90 seconds target | API eligibility/declared byte limit and public projection only; actual byte/duration finalization missing |
| Theme/personalization | Default professional | All four existing themes/customization | Database write guard, public projection and UI guard |
| Basic analytics | 30-day target | Yes | Registry only; existing reporting still needs plan split |
| Advanced analytics | No | 7/30/90-day target | Registry only; enforcement/time series/deduplication still missing |
| Advanced SEO | No | Yes | Registry only; custom fields/enforcement still missing |
| Public booking | Yes | Yes | Existing engine retained, over-limit offers excluded |

Internal `pro`/`founder` identifiers and PayU monetary amounts are unchanged. Verified Owner Lifetime wins over ordinary expiration. Founder and active trial inherit Premium profile rights. Platform administration is not an entitlement source; deliberate valid subscription overrides remain supported. Existing non-profile lifecycle behavior has not been rewritten.

## File and route inventory

- New pure policy: `src/lib/profile-entitlements.ts` and parity/downgrade tests.
- New server helpers: `src/server/public-profile-request.ts`, `src/server/profile-entitlements.ts`.
- New service/API tests: `src/server/public-profile.test.ts`, `src/app/api/public-profile/route.test.ts`.
- New browser regression: `scripts/test-public-profile-browser.mjs` (isolated temporary store, dedicated port 3218).
- Modified routes: `/api/public-profile` GET/PUT/POST/DELETE, `/api/public-profile/photo` POST, `/api/public-profile/media` POST/DELETE.
- Shared service changes affect public profile rendering, booking offer creation/update, public availability and booking creation. Their route signatures remain unchanged.
- Existing editor components, public-profile normalization, entitlement resolver and editor fieldset CSS updated. No new framework or paid service introduced.

## Migrations and Storage

1. `20261019071954_public_profile_publication_privacy.sql`: private allowlist/projection helpers, owner-media-path protection, replacement public profile RPC, restrictive write policies.
2. `20261019115436_public_profile_plan_publication.sql`: capability registry/resolver, public plan projection, profile/offer guards, wrapper around existing availability function and new-booking eligibility guard.

Both were applied only to local Docker Supabase and recorded in local migration history. New helpers use fixed empty search paths and revoked client execution privileges. No Storage bucket/policy/global-limit changes were made. Existing signed URLs cannot be immediately revoked by unpublishing; previously issued public URLs may survive for up to their five-minute lease (older URLs can have their original longer lease).

## Outstanding work / release blockers

1. Server-verified media finalization, actual bytes/MIME/duration validation, reservations, total-storage quotas, concurrent upload abuse tests, progress/cancel/replacement, reference-aware deletion and orphan cleanup. Existing public photo bucket and direct Storage policies require a separate privacy review. Client validation is not a security boundary.
2. Reviews: genuine collection, consent, moderation and publication. No private feedback has been exposed or repurposed.
3. Advanced SEO fields and guarded public metadata; basic/advanced analytics split, time series, deduplication, owner/bot exclusion, and trusted booking-completion events.
4. Complete Free/Premium pricing/subscription UI based only on shipped functionality; actual prices must remain unchanged without approval.
5. Complete cross-browser, keyboard/screen-reader, mobile media upload and failure/retry QA; concurrent cap tests, suspended-account/public visibility audit and all direct Storage mutation paths.
6. Full slug/redirect collision audit and file-replacement races. The existing legacy local-store test suite also contains unrelated tests that write to its default store; the new profile tests now isolate their store before module import.

## Deployment checklist (not executed; explicit approval required)

The full feature is not production-ready. Do not advertise the target matrix as completely shipped.

1. Finish the release blockers above or explicitly approve a narrower privacy/publication-only release. Review all changes and confirm the production project ID without printing credentials.
2. Take and verify a database backup; inventory current profile/media usage and published offer/certificate counts. Record affected downgraded tutors and communicate visibility changes.
3. Re-run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, the browser regression, `supabase test db --local`, and `supabase db lint --local --schema public,private --level error --fail-on error`.
4. On an approved staging project, inspect `supabase db push --linked --dry-run`; verify only reviewed migrations are pending. Apply migrations there, deploy matching app code, and test real authenticated/anonymous paths, redirects, signed media, Free/Premium/Founder/Owner and booking conflicts.
5. Obtain separate approval for production database migrations, deployment and any Storage/global-limit changes. A 75 MB upload may require already-compatible paid infrastructure; do not create or upgrade a plan without approval.
6. Apply reviewed production migrations in timestamp order **before** deploying the matching application. Do not run `migration repair` as a substitute for executing production SQL. Confirm private helper grants, RLS and availability wrapper signatures.
7. Deploy the tested application through the existing deployment process. Preserve environment variables, internal billing IDs and PayU amounts; no new secrets are required by these two slices.
8. Smoke-test draft isolation, hidden documents, foreign paths, publication/unpublication, Free caps, downgrade retention, lifetime access and a real booking in the approved environment. Monitor publication/booking errors and Storage egress.
9. If verification fails, stop rollout. Prefer a reviewed forward fix; do not drop guards or destroy profile/media data. A full database restore requires separate approval and a data-loss assessment.
