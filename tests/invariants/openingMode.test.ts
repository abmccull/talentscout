import { describe, expect, it } from "vitest";
import { resolveCareerOpeningMode } from "@/engine/youth/openingMode";

describe("career opening mode", () => {
  it("teaches a new youth player once and gives veterans a dynamic prologue", () => {
    expect(resolveCareerOpeningMode({
      requested: "auto",
      specialization: "youth",
      hasScenario: false,
      tutorialCompleted: false,
      tutorialsDismissed: false,
    })).toBe("tutorial");

    expect(resolveCareerOpeningMode({
      requested: "auto",
      specialization: "youth",
      hasScenario: false,
      tutorialCompleted: true,
      tutorialsDismissed: false,
    })).toBe("dynamic");
  });

  it("honors explicit desk, dynamic, and tutorial replay choices", () => {
    for (const requested of ["desk", "dynamic", "tutorial"] as const) {
      expect(resolveCareerOpeningMode({
        requested,
        specialization: "youth",
        hasScenario: false,
        tutorialCompleted: true,
        tutorialsDismissed: true,
      })).toBe(requested);
    }
  });

  it("keeps scenarios and non-youth specializations in their authored starts", () => {
    expect(resolveCareerOpeningMode({
      requested: "dynamic",
      specialization: "youth",
      hasScenario: true,
      tutorialCompleted: true,
      tutorialsDismissed: false,
    })).toBe("desk");
    expect(resolveCareerOpeningMode({
      requested: "tutorial",
      specialization: "data",
      hasScenario: false,
      tutorialCompleted: false,
      tutorialsDismissed: false,
    })).toBe("desk");
  });
});
