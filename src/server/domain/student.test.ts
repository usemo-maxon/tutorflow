import { describe, expect, it } from "vitest";
import { findProbableDuplicateIds, studentDisplayName } from "./student";

describe("student duplicate detection", () => {
  const candidates = [
    {
      id: "one",
      displayName: "Zosia Kowalska",
      email: "rodzina@example.test",
      phone: "+48 600 100 200",
    },
  ];

  it("normalizes names, e-mail and phone without blocking unrelated people", () => {
    expect(
      findProbableDuplicateIds(
        { firstName: " zosia ", lastName: "KOWALSKA" },
        candidates,
      ),
    ).toEqual(["one"]);
    expect(
      findProbableDuplicateIds(
        {
          firstName: "Hania",
          lastName: "Nowak",
          email: "RODZINA@example.test",
        },
        candidates,
      ),
    ).toEqual(["one"]);
    expect(
      findProbableDuplicateIds(
        { firstName: "Adam", lastName: "Nowak", phone: "+48 600-100-200" },
        candidates,
      ),
    ).toEqual(["one"]);
    expect(
      findProbableDuplicateIds(
        { firstName: "Julia", lastName: "Mazur" },
        candidates,
      ),
    ).toEqual([]);
  });

  it("uses an explicit display name when supplied", () => {
    expect(
      studentDisplayName({
        firstName: "Aleksandra",
        lastName: "Wysocka",
        displayName: "Ola",
      }),
    ).toBe("Ola");
  });
});
