import { afterEach, describe, expect, it, vi } from "vitest";
import { errorResponse, logServerError } from "./errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("privacy-safe server errors", () => {
  it("logs correlation metadata without the error message, stack or payload", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const privateText = "Anna Kowalska — notatka z lekcji";

    const correlationId = logServerError(
      "lesson_completion",
      new Error(privateText),
      "test-correlation-id",
    );

    expect(correlationId).toBe("test-correlation-id");
    const output = spy.mock.calls.flat().join(" ");
    expect(output).toContain("lesson_completion");
    expect(output).toContain("test-correlation-id");
    expect(output).not.toContain(privateText);
    expect(output).not.toContain("stack");
  });

  it("returns the same safe correlation id to the client", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new Error("student@example.test"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      code: "INTERNAL_ERROR",
      correlationId: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain("student@example.test");
  });
});
