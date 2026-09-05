import { describe, expect, it, vi } from "vitest";
import { RNG } from "@/engine/rng";
import type { ScoutCueReading } from "@/engine/core/types";
import { createSession } from "@/engine/observation/session";
import type { ObservationSession, SessionFlaggedMoment } from "@/engine/observation/types";
import { generateReflection, generateReflectionPrompts, generateSessionSummary } from "@/engine/observation/reflection";

function negativeWatch(): ObservationSession {
  const session = createSession({
    activityType: "schoolMatch", specialization: "youth", seed: "negative-watch",
    week: 1, season: 1,
    playerPool: ["lead", "other"].map((playerId) => ({ playerId, name: playerId === "lead" ? "Milo Vale" : "Other Player", position: "CM" })),
  }, new RNG("negative-watch"));
  const details = ["A usable aerial control.", "Poor movement off the ball.", "A misplaced short pass."];
  const flaggedMoments = details.map((detail, phaseIndex) => ({
    id: `flag-${phaseIndex}`, phaseIndex, minute: phaseIndex * 45,
    reaction: phaseIndex === 0 ? "needs_more_data" : "concerning",
    moment: { id: `moment-${phaseIndex}`, playerId: "lead", momentType: "technicalAction", quality: phaseIndex === 0 ? 5 : 2, vagueDescription: detail, description: detail, attributesHinted: ["passing"], pressureContext: false },
  })) as SessionFlaggedMoment[];
  return {
    ...session, state: "reflection", currentPhaseIndex: 2, phases: session.phases.slice(0, 3),
    players: session.players.map((player) => player.playerId === "lead"
      ? { ...player, isFocused: true, currentLens: "mental", focusedPhases: [0, 1, 2], focusHistory: [0, 1, 2].map((phaseIndex) => ({ phaseIndex, lens: "mental" })) }
      : player),
    flaggedMoments,
    cueReadings: flaggedMoments.map((flag, index) => ({
      id: `cue-${index}`, momentId: flag.moment.id, playerId: "lead", phaseIndex: index,
      direction: index === 0 ? "mixed" : "negative", clarity: "usable", score: index === 0 ? 0.5 : 0.25,
      detail: details[index], summary: details[index], attributesHinted: ["passing"], pressureContext: false,
    })) as ScoutCueReading[],
    venueAtmosphere: { venueType: "schoolMatch", chaosLevel: 0.1, amplifiedAttributes: [], dampenedAttributes: [], crowdIntensity: 0.1, description: "A quiet school pitch." },
  };
}

function reflect(session: ObservationSession, seed: string) {
  const rng = new RNG(seed);
  vi.spyOn(rng, "chance").mockReturnValue(true);
  return generateReflection(session, rng, 12, 1, { paEstimate: true });
}

describe("reflection follows the watch actually completed", () => {
  it("keeps a one-player negative watch truthful across every narrative draw", () => {
    const session = negativeWatch();
    for (let index = 0; index < 40; index += 1) {
      const result = reflect(session, `negative-${index}`);
      expect(result.gutFeelingCandidate?.narrative).toMatch(/concern/i);
      expect(result.gutFeelingCandidate?.triggerReason).toContain("2 concerning");
      expect(result.gutFeelingCandidate?.triggerReason).toContain("1 inconclusive");
      expect(result.reflectionPrompts.join(" ")).toContain("Milo Vale");
      expect(result.reflectionPrompts.join(" ")).not.toMatch(/spread thin|narrowing to two|referee|quieter in the second half|consistently drifting|under pressure and at rest/);
      expect(result.gutFeelingCandidate?.narrative).not.toMatch(/right, every time|effortless|first touch|referee|ceiling nobody/);
      expect(result.sessionSummary).toContain("Milo Vale through a mental lens");
    }
  });

  it("treats disagreement between the scout's flag and a visible cue as unresolved", () => {
    const session = negativeWatch();
    session.flaggedMoments = session.flaggedMoments.map((flag) => ({ ...flag, reaction: "promising" }));
    const result = reflect(session, "conflicting-read");
    expect(result.gutFeelingCandidate?.narrative).toMatch(/conflict|mixed|disagree/i);
    expect(result.gutFeelingCandidate?.narrative).not.toMatch(/right, every time|effortless/);
  });

  it("never uses hidden execution quality to change a reflection or projection when visible evidence is unchanged", () => {
    const session = negativeWatch();
    session.cueReadings = [];
    const altered = { ...session, flaggedMoments: session.flaggedMoments.map((flag) => ({ ...flag, moment: { ...flag.moment, quality: 10 } })) };
    expect(reflect(altered, "same-visible-watch")).toEqual(reflect(session, "same-visible-watch"));
  });

  it("only recommends narrower focus for actual broad coverage and names the longest watch correctly", () => {
    const session = negativeWatch();
    session.players = [0, 1, 2, 3].map((index) => ({ ...session.players[0], playerId: `player-${index}`, name: `Player ${index}`, focusedPhases: index === 3 ? [0, 1, 2] : [0], focusHistory: [] }));
    expect(generateReflectionPrompts(session, new RNG("broad")).join(" ")).toMatch(/4 players/);
    expect(generateSessionSummary(session)).toMatch(/Player 3.*longest|longest.*Player 3/);
  });

  it("only discusses recorded pressure when a visible flagged cue establishes that context", () => {
    const session = negativeWatch();
    expect(generateReflectionPrompts(session, new RNG("pressure")).join(" ")).not.toContain("came under pressure");
    session.cueReadings![0] = { ...session.cueReadings![0], pressureContext: true };
    expect(generateReflectionPrompts(session, new RNG("pressure")).join(" ")).toContain("came under pressure");
    session.cueReadings![0] = { ...session.cueReadings![0], clarity: "missed" };
    expect(generateReflectionPrompts(session, new RNG("pressure")).join(" ")).not.toContain("came under pressure");
  });

  it.each(["investigation", "analysis"] as const)("does not invent %s episodes from mode alone", (mode) => {
    const session = { ...negativeWatch(), mode, venueAtmosphere: undefined };
    for (let index = 0; index < 30; index += 1) {
      expect(generateReflectionPrompts(session, new RNG(`mode-${index}`)).join(" "))
        .not.toMatch(/body language shift|hesitation|unusually forthcoming|trend line|was tense|skewed towards|patchy today/);
    }
  });
});
