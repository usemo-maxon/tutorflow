import type { AppError } from "@/lib/domain";

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly body: AppError,
  ) {
    super(body.message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiFailure) {
    return Response.json(error.body, { status: error.status });
  }
  const correlationId = crypto.randomUUID();
  console.error(`[${correlationId}]`, error);
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
