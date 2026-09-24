import { describe, expect, it } from "vitest";
import {
  availableGlobalCreateCommands,
  filterGlobalCommands,
  GLOBAL_CREATE_COMMANDS,
  GLOBAL_NAVIGATION_COMMANDS,
  normalizeGlobalSearch,
} from "./global-search";

describe("global search normalization", () => {
  it("normalizes whitespace, case, and Polish diacritics", () => {
    expect(normalizeGlobalSearch("  ŁUKASZ   Żółć  ")).toBe("lukasz zolc");
  });
});

describe("global command filtering", () => {
  it("matches KAL to Kalendarz", () => {
    expect(
      filterGlobalCommands(GLOBAL_NAVIGATION_COMMANDS, "KAL").map(
        (command) => command.label,
      ),
    ).toEqual(["Kalendarz"]);
  });

  it.each(["uczen", "uczeń"])("matches student commands for %s", (query) => {
    expect(
      filterGlobalCommands(GLOBAL_CREATE_COMMANDS, query).map(
        (command) => command.id,
      ),
    ).toContain("student");
  });

  it("matches payment navigation and creation commands", () => {
    expect(
      filterGlobalCommands(GLOBAL_NAVIGATION_COMMANDS, "plat").map(
        (command) => command.id,
      ),
    ).toEqual(["payments"]);
    expect(
      filterGlobalCommands(GLOBAL_CREATE_COMMANDS, "plat").map(
        (command) => command.id,
      ),
    ).toEqual(["payment"]);
  });

  it("protects the required navigation routes", () => {
    expect(
      Object.fromEntries(
        GLOBAL_NAVIGATION_COMMANDS.map((command) => [
          command.label,
          command.href,
        ]),
      ),
    ).toEqual({
      Dzisiaj: "/app/dzisiaj",
      Kalendarz: "/app/kalendarz",
      Uczniowie: "/app/uczniowie",
      Grupy: "/app/uczniowie/grupy",
      Płatności: "/app/platnosci",
      Statystyki: "/app/statystyki",
      Ustawienia: "/app/ustawienia/profil",
    });
  });

  it("reuses exactly the six L0.6 action IDs and routes", () => {
    expect(GLOBAL_CREATE_COMMANDS.map((command) => command.id)).toEqual([
      "lesson",
      "student",
      "group",
      "block",
      "payment",
      "package",
    ]);
    expect(
      Object.fromEntries(
        GLOBAL_CREATE_COMMANDS.map((command) => [command.id, command.href]),
      ),
    ).toEqual({
      lesson: null,
      student: null,
      group: "/app/uczniowie/grupy?action=new",
      block: "/app/kalendarz?action=block",
      payment: "/app/platnosci?action=payment",
      package: "/app/platnosci?action=package",
    });
  });

  it("removes all mutation commands for read-only accounts", () => {
    expect(availableGlobalCreateCommands(true)).toEqual([]);
    expect(availableGlobalCreateCommands(false)).toHaveLength(6);
    expect(GLOBAL_NAVIGATION_COMMANDS).toHaveLength(7);
  });
});
