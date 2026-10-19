# Advanced public tutor profiles

## Implemented vertical slice

- Private, autosaved draft document and explicit published snapshot.
- Publish, republish, and unpublish operations. Draft edits never change public content.
- Stable canonical slugs with permanent redirects from previously published slugs.
- Two-panel profile studio with responsive preview switching and a completion score.
- Curated themes, accent colors, section visibility, titles, and ordering.
- Structured hero, subjects, specializations, audiences, teaching approach, experience/education, FAQ, and public links.
- YouTube privacy embed and direct MP4/WebM uploads to Supabase Storage.
- Certificate image/PDF upload, visibility, issuer/date/link metadata, and a clear user-provided disclaimer.
- Public metadata, canonical URL, robots directives, Open Graph/Twitter fields, and truthful Person/Offer structured data.
- Existing booking event types, calendar availability, analytics, and booking transaction remain authoritative.

## Storage

Migration `20261018201647_advanced_public_profiles.sql` creates the private `tutor-profile-media` bucket. Browser uploads use short-lived signed upload tokens and owner-scoped paths:

`{auth.uid()}/{video|certificate|poster}/{uuid}.{extension}`

The public server signs only paths present in the published snapshot. Upload limits are 100 MB for MP4/WebM video, 10 MB for certificate images/PDFs, and 5 MB for poster images. Files are served directly by Storage; video bytes do not pass through a Vercel function.

Apply the migration in each environment before deploying the application. No production migration, bucket change, or deployment was performed by this implementation.

## Entitlements

No new commercial restrictions were activated. This avoids retroactively restricting existing tutors. Recommended follow-up: add centralized entitlement keys for `profileVideoUpload`, `profileAdvancedThemes`, `profileCertificateLimit`, and `profileExtendedAnalytics`, then map Free/Pro/Founder/Owner Lifetime through the existing entitlement resolver.

## Current limitations / next phases

- Direct uploads show an indeterminate uploading state. True byte progress and resumability should use Supabase TUS with a pinned client dependency.
- Browser-compatible source files are accepted as-is; there is no transcoding, duration probe, thumbnail extraction, or caption editor.
- Certificate form supports the primary public fields; expiration, credential number, descriptions, fullscreen lightbox, and drag-and-drop sorting remain follow-up work.
- Timeline editing currently covers type, title, and institution; a richer date/description editor remains.
- Reviews were not introduced because there is no reviewed consent/moderation model yet. Private lesson feedback remains private.
- Cover-image upload, media orphan cleanup jobs, generated social images, sitemap enumeration, abuse reporting, and advanced analytics remain follow-up work.
- Media upload plan limits are intentionally not enforced until product approves the proposed entitlement model.

## Verification

Unit coverage is extended in `src/lib/public-profile.test.ts`. Database coverage for publication boundaries, RLS exposure, and slug redirects is in `supabase/tests/advanced_public_profiles.sql`.
