import { createBrowserClient } from "@supabase/ssr";

type BrowserClient = ReturnType<typeof createBrowserClient>;
type PublicConfig = { url: string; key: string };

let browserClient: BrowserClient | undefined;
let browserClientPromise: Promise<BrowserClient> | undefined;

function validConfig(value: unknown): value is PublicConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<PublicConfig>;

  try {
    const url = new URL(config.url ?? "");
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      url.hostname,
    );
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && isLoopback)) &&
      typeof config.key === "string" &&
      config.key.length > 0 &&
      !config.key.startsWith("sb_secret_")
    );
  } catch {
    return false;
  }
}

async function loadPublicConfig(): Promise<PublicConfig> {
  const bundledConfig = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  if (validConfig(bundledConfig)) return bundledConfig;

  const response = await fetch("/api/auth/config", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Supabase public configuration is missing");

  const config: unknown = await response.json();
  if (!validConfig(config)) {
    throw new Error("Supabase public configuration is invalid");
  }

  return config;
}

export async function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  if (browserClientPromise) return browserClientPromise;

  browserClientPromise = loadPublicConfig().then(({ url, key }) => {
    browserClient = createBrowserClient(url, key);
    return browserClient;
  });

  try {
    return await browserClientPromise;
  } catch (error) {
    browserClientPromise = undefined;
    throw error;
  }
}
