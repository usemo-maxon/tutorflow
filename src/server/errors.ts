import type { AppError } from "@/lib/domain";

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly body: AppError,
  ) {
    super(body.message);
  }
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
    ? error.name
    : "Error";
}

export function logServerError(
  scope: string,
  error: unknown,
  correlationId = crypto.randomUUID(),
): string {
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      correlationId,
      errorName: safeErrorName(error),
    }),
  );
  return correlationId;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiFailure) {
    return Response.json(error.body, { status: error.status });
  }
  const correlationId = logServerError("api_request", error);
  return Response.json(
    {
      code: "INTERNAL_ERROR",
      message: "Nie udało się wykonać działania. Spróbuj ponownie.",
      retryable: true,
      correlationId,
    },
    { status: 500 },
  );
}
