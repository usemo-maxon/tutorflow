import type { AppAction, AppData, AppError, MutationResponse } from "./domain";

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: AppError,
  ) {
    super(data.message);
  }
}

export async function fetchAppData(
  signal?: AbortSignal,
  range?: { start: string; end: string },
): Promise<AppData> {
  const timeout = AbortSignal.timeout(20_000);
  const params = range
    ? `?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`
    : "";
  const response = await fetch(`/api/app${params}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: "no-store",
  });
  return parseResponse<AppData>(response);
}

export async function mutateApp(action: AppAction): Promise<MutationResponse> {
  const response = await fetch("/api/app", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
  return parseResponse<MutationResponse>(response);
}

export async function authRequest(
  action:
    | "login"
    | "register"
    | "demo"
    | "logout"
    | "request-reset"
    | "update-password",
  body?: unknown,
): Promise<{
  teacher?: { id: string };
  requiresEmailConfirmation?: boolean;
  ok?: boolean;
}> {
  const response = await fetch(`/api/auth/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | AppError;
  if (!response.ok) throw new ClientApiError(response.status, data as AppError);
  return data as T;
}
