import { expect, test } from "vitest";

import type { Observation } from "@/engine/core/types";
import {
  deriveObservationObjective,
  rankObservationContextsForObjective,
  summarizeObservationComparison,
} from "@/engine/observation/objectives";

function observation(
  id: string,
  context: Observation["context"],
): Observation {
  return {
    id,
    playerId: "player-1",
    scoutId: "scout-1",
    week: 1,
    season: 1,
    context,
    attributeReadings: [],
    notes: [],
    flaggedMoments: [],
  };
}

test("role objectives defer to canonical context authority instead of meetings", () => {
  const objective = deriveObservationObjective({
    id: "role-1",
    family: "role",
    prompt: "Can he function as an inverted full back?",
    existingContexts: ["schoolMatch"],
  });

  const ranked = rankObservationContextsForObjective(objective);

  expect(["trainingGround", "trialMatch", "academyTrialDay", "deepVideoAnalysis", "oppositionAnalysis"]).toContain(ranked[0].context);
  expect(ranked.find((entry) => entry.context === "parentCoachMeeting")?.score).toBeLessThan(
    ranked.find((entry) => entry.context === "trainingGround")?.score ?? 100,
  );
});

test("repeated contexts lose value using raw observation history, not deduped labels", () => {
  const objective = deriveObservationObjective({
    id: "pathway-1",
    family: "pathway",
    prompt: "What support evidence would change the recommendation?",
    existingObservations: [
      observation("meeting-1", "parentCoachMeeting"),
      observation("meeting-2", "parentCoachMeeting"),
    ],
  });

  const ranked = rankObservationContextsForObjective(objective);
  const meeting = ranked.find((entry) => entry.context === "parentCoachMeeting");
  const followUp = ranked.find((entry) => entry.context === "followUpSession");

  expect(meeting?.repeated).toBe(true);
  expect((meeting?.score ?? 0)).toBeLessThan((followUp?.score ?? 100));
});

test("comparison summary names both contexts and the objective family", () => {
  const objective = deriveObservationObjective({
    id: "compare-1",
    family: "readiness",
    prompt: "Is the player ready now?",
    existingContexts: ["academyTrialDay"],
  });

  expect(
    summarizeObservationComparison(objective, "academyTrialDay", "trialMatch"),
  ).toContain("academyTrialDay");
  expect(
    summarizeObservationComparison(objective, "academyTrialDay", "trialMatch"),
  ).toContain("trialMatch");
});

test("role and position context change the recommendation rather than only its copy", () => {
  const generic = deriveObservationObjective({
    id: "role-generic",
    family: "role",
    prompt: "Can this player execute the brief?",
  });
  const invertedFullBack = deriveObservationObjective({
    id: "role-specific",
    family: "role",
    prompt: "Can this player execute the brief?",
    player: { position: "RB", secondaryPositions: ["LB"] },
    preferredRole: "invertedFullBack",
  });

  const genericTraining = rankObservationContextsForObjective(generic)
    .find((entry) => entry.context === "trainingGround")!;
  const specificTraining = rankObservationContextsForObjective(invertedFullBack)
    .find((entry) => entry.context === "trainingGround")!;

  expect(specificTraining.score).toBeGreaterThan(genericTraining.score);
  expect(specificTraining.reason).toContain("inverted full back");
  expect(invertedFullBack.prompt).toContain("invertedFullBack");
});
