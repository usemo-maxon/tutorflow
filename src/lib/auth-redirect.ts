export const DEFAULT_APP_PATH = "/app/dzisiaj";
export const ONBOARDING_APP_PATH = "/app/start";

export function safeAppPath(value: string | null): string {
  return value?.startsWith("/app/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u001F\u007F]/.test(value)
    ? value
    : DEFAULT_APP_PATH;
}

export function authAppDestination(
  mode: "login" | "register",
  returnTo: string | null,
): string {
  return mode === "register" ? ONBOARDING_APP_PATH : safeAppPath(returnTo);
}

export function safeRelativePath(
  value: string | null,
  fallback = DEFAULT_APP_PATH,
): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return fallback;
  }

  return value;
}
