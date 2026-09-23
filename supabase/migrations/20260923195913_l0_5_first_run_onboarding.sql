alter table public.profiles
add column onboarding_completed_at timestamptz null;

-- Accounts present when L0.5 is deployed have already learned the product.
-- The column intentionally has no default, so profiles created by the existing
-- auth trigger after this statement remain incomplete until the tutor finishes.
update public.profiles
set onboarding_completed_at = transaction_timestamp()
where onboarding_completed_at is null;

comment on column public.profiles.onboarding_completed_at is
  'Set once, after server-side validation of the required first-run setup.';
