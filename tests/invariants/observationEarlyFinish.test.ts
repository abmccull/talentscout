import { expect, it } from "vitest";
import type { ObservationSession, PlayerMoment } from "@/engine/observation/types";
import { generateSessionSummary } from "@/engine/observation/reflection";
import { finishObservationEarly } from "@/engine/observation/session";

it("takes only visited passages and their evidence into early reflection", () => {
  const moments = Array.from({ length: 8 }, (_, i) => ({ id: `m-${i}`, playerId: "player" } as PlayerMoment));
  const session = { state: "active", mode: "fullObservation", scoutingQuestionId: "technicalSecurity",
    currentPhaseIndex: 3, phases: moments.map((moment, index) => ({ index, moments: [moment] })),
    flaggedMoments: moments.map(moment => ({ moment })), cueReadings: moments.map(moment => ({ momentId: moment.id })),
    insightPointsEarned: 7, activityInstanceId: "scheduled-school-match",
  } as unknown as ObservationSession;
  const before = structuredClone(session);
  const result = finishObservationEarly(session);
  expect(result.state).toBe("reflection");
  expect(generateSessionSummary({ ...result, activityType: "schoolMatch", players: [], hypotheses: [], flaggedMoments: [] })).toContain("4 of 8 phases");
  expect(result.phases).toHaveLength(4);
  expect(result.plannedPhaseCount).toBe(8);
  expect(result.flaggedMoments.map(f => f.moment.id)).toEqual(["m-0", "m-1", "m-2", "m-3"]);
  expect(result.cueReadings?.map(c => c.momentId)).toEqual(["m-0", "m-1", "m-2", "m-3"]);
  expect(result.activityInstanceId).toBe(session.activityInstanceId);
  expect(result.insightPointsEarned).toBe(7);
  expect(finishObservationEarly(result)).toBe(result);
  expect(session).toEqual(before);
  expect(finishObservationEarly({ ...session, state: "setup" }).state).toBe("setup");
});
