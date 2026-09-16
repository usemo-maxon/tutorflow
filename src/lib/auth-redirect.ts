export const DEFAULT_APP_PATH = "/app/dzisiaj";

export function safeAppPath(value: string | null): string {
  return value?.startsWith("/app/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u001F\u007F]/.test(value)
    ? value
    : DEFAULT_APP_PATH;
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
