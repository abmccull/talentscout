import { expect, it } from "vitest";
import type { ObservationSession, SessionPlayer } from "@/engine/observation/types";
import { generateSessionSummary } from "@/engine/observation/reflection";

function session(counts: number[]): ObservationSession {
  return {
    mode: "fullObservation", activityType: "schoolMatch", currentPhaseIndex: 4,
    phases: Array.from({ length: 5 }, (_, index) => ({ index, moments: [] })),
    players: counts.map((count, index) => ({ playerId: `p${index}`, name: ["Alex", "Ben", "Chris"][index],
      currentLens: "technical", focusedPhases: Array.from({ length: count }, (_, phase) => phase),
    } as SessionPlayer)), flaggedMoments: [], hypotheses: [],
  } as unknown as ObservationSession;
}

it("describes actual attention rather than roster order without mutating the session", () => {
  for (const counts of [[1, 4], [1, 2, 4]]) {
    const value = session(counts), before = structuredClone(value);
    const summary = generateSessionSummary(value);
    const primary = counts.length === 2 ? "Ben" : "Chris";
    if (counts.length === 2) expect(summary).toContain(`Most of your attention stayed on ${primary}`);
    else expect(summary).toContain(`${primary} drew the longest look`);
    expect(value).toEqual(before);
  }
});

it("does not invent a primary subject when attention was tied", () => {
  for (const counts of [[3, 3], [3, 3, 1]]) {
    const summary = generateSessionSummary(session(counts));
    expect(summary).not.toMatch(/Most of your attention|secondary focus|drew the longest look/);
    expect(summary).toContain("Alex");
    expect(summary).toContain("Ben");
  }
});
