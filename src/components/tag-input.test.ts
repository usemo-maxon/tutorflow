import { describe, expect, it } from "vitest";
import { appendTags } from "./tag-input";

describe("appendTags", () => {
  it("separates tags entered with commas or new lines", () => {
    expect(appendTags([], "Online, Matura\n5 lat doświadczenia")).toEqual([
      "Online",
      "Matura",
      "5 lat doświadczenia",
    ]);
  });

  it("removes case-insensitive duplicates and respects the limit", () => {
    expect(appendTags(["Online"], "online, Matura, Cambridge", 2)).toEqual([
      "Online",
      "Matura",
    ]);
  });
});
