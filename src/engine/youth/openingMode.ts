import type { NewGameConfig } from "@/engine/core/types";

export type ResolvedCareerOpeningMode = "tutorial" | "dynamic" | "desk";

/**
 * Resolve the opening independently from tutorial presentation state.
 *
 * `auto` is intentionally profile-aware: a new player receives the authored
 * teaching case once, while an experienced player receives a fresh generated
 * prologue. Explicit choices always win, including replaying the tutorial.
 */
export function resolveCareerOpeningMode(input: {
  requested?: NewGameConfig["openingMode"];
  specialization: NewGameConfig["specialization"];
  hasScenario: boolean;
  tutorialCompleted: boolean;
  tutorialsDismissed: boolean;
}): ResolvedCareerOpeningMode {
  if (input.specialization !== "youth" || input.hasScenario) return "desk";

  if (input.requested && input.requested !== "auto") {
    return input.requested;
  }

  return input.tutorialCompleted || input.tutorialsDismissed
    ? "dynamic"
    : "tutorial";
}
