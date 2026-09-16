import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_PATH,
  safeAppPath,
  safeRelativePath,
} from "./auth-redirect";

describe("authentication redirects", () => {
  it("keeps valid in-app destinations", () => {
    expect(safeAppPath("/app/kalendarz?view=week")).toBe(
      "/app/kalendarz?view=week",
    );
  });

  it("defaults invalid app destinations", () => {
    expect(safeAppPath("https://example.com")).toBe(DEFAULT_APP_PATH);
    expect(safeAppPath("//example.com/app")).toBe(DEFAULT_APP_PATH);
    expect(safeAppPath("/ustawienia")).toBe(DEFAULT_APP_PATH);
    expect(safeAppPath("/app/\\example.com")).toBe(DEFAULT_APP_PATH);
  });

  it("accepts relative callback destinations", () => {
    expect(safeRelativePath("/app/dzisiaj?welcome=1")).toBe(
      "/app/dzisiaj?welcome=1",
    );
  });

  it("rejects callback destinations that could escape the origin", () => {
    expect(safeRelativePath("https://example.com")).toBe(DEFAULT_APP_PATH);
    expect(safeRelativePath("//example.com")).toBe(DEFAULT_APP_PATH);
    expect(safeRelativePath("/\\example.com")).toBe(DEFAULT_APP_PATH);
    expect(safeRelativePath("/app\ndzisiaj")).toBe(DEFAULT_APP_PATH);
  });
});
