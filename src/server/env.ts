import "server-only";

import { z } from "zod";

const optionalUrl = z.string().url().optional();

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(43),
  CRON_SECRET: z.string().min(16),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().min(1),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().url(),
  GOOGLE_CALENDAR_WEBHOOK_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  PAYU_POS_ID: z.string().min(1),
  PAYU_CLIENT_SECRET: z.string().min(1),
  PAYU_SECOND_KEY: z.string().min(1),
  PAYU_API_BASE_URL: optionalUrl,
});

export type ServerEnv = z.infer<typeof schema>;

function vercelProductionUrl(): string | undefined {
  const value = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!value) return undefined;
  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

function normalizedEnv() {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY:
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL:
      process.env.NEXT_PUBLIC_SITE_URL || vercelProductionUrl(),
  };
}

export function serverEnv(): ServerEnv {
  const parsed = schema.safeParse(normalizedEnv());
  if (!parsed.success) {
    throw new Error(
      `Invalid server configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

export function siteUrl(): string {
  const configured = (
    process.env.NEXT_PUBLIC_SITE_URL || vercelProductionUrl()
  )?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY),
  );
}
