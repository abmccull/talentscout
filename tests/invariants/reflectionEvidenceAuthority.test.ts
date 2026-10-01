import { describe, expect, it, vi } from "vitest";
import { createSession } from "@/engine/observation/session";
import { checkGutFeelingTrigger, generateReflection, generateReflectionPrompts, getRetainedFlaggedMomentReaction, getRetainedFlaggedMomentAttributes } from "@/engine/observation/reflection";
import type { ObservationSession, SessionFlaggedMoment } from "@/engine/observation/types";
import { RNG } from "@/engine/rng";

describe("reflection evidence authority", () => {
  it("anchors instinct to the saved reaction and visible cue instead of inventing praise", () => {
    const session = createSession({
      activityType: "followUpSession", specialization: "youth",
      playerPool: [{ playerId: "p", name: "Ari Prospect", position: "CM" }],
      seed: "instinct-concern", week: 3, season: 1,
    }, new RNG("instinct-concern"));
    session.mode = "fullObservation";
    session.flaggedMoments = [{ reaction: "concerning", moment: {
      id: "marking", playerId: "p", momentType: "tacticalDecision", quality: 1,
      vagueDescription: "A defensive passage.", detailedDescription: "SECRET", attributesHinted: ["marking"],
    } }] as unknown as SessionFlaggedMoment[];
    session.cueReadings = [{ id: "cue", momentId: "marking", playerId: "p",
      clarity: "clear", score: 0.4, attributesHinted: ["marking"],
      detail: "Ari Prospect lost track of the runner.",
    }] as unknown as ObservationSession["cueReadings"];
    const read = (input: ObservationSession) => {
      const rng = new RNG("forced-instinct");
      vi.spyOn(rng, "chance").mockReturnValue(true);
      return checkGutFeelingTrigger(rng, input, 9, 1, { paEstimate: true });
    };
    const concern = read(session)!;
    expect(concern.narrative).toContain("concern you flagged");
    expect(concern.narrative).toContain("Ari Prospect lost track of the runner.");
    expect(concern.narrative).not.toMatch(/instinctive|right place|SECRET|thirty years|highest level/);
    expect(concern.paEstimate).toBeDefined();
    const restored = JSON.parse(JSON.stringify(session));
    restored.flaggedMoments[0].moment.quality = 10;
    expect(read(restored)).toEqual(concern);
    restored.evidenceDecisions = { cue: { cueId: "cue", classification: "noConclusion" } };
    expect(read(restored)?.narrative).toContain("saved read remains open");
    expect(read(restored)?.paEstimate).toBeUndefined();
    restored.evidenceDecisions = {};
    restored.cueReadings = [];
    expect(read(restored)?.paEstimate).toBeUndefined();
    session.flaggedMoments[0].reaction = "promising";
    expect(read(session)?.narrative).toContain("promising cue deserves another test");
  });

  it("retains only perceived attribute hints after restoration, with no hidden fallback", () => {
    const flagged = { reaction: "promising", moment: {
      id: "moment", playerId: "player", attributesHinted: ["composure", "dribbling"],
    } } as SessionFlaggedMoment;
    const session = { mode: "fullObservation", cueReadings: [{
      id: "cue", momentId: "moment", playerId: "player", clarity: "clear", attributesHinted: ["dribbling"],
    }], evidenceDecisions: {} } as unknown as ObservationSession;
    expect(getRetainedFlaggedMomentAttributes(JSON.parse(JSON.stringify(session)), flagged)).toEqual(["dribbling"]);
    session.evidenceDecisions = { cue: { cueId: "cue", classification: "noConclusion" } };
    expect(getRetainedFlaggedMomentAttributes(session, flagged)).toEqual([]);
    session.evidenceDecisions = {};
    for (const clarity of ["missed", "glimpse"] as const) {
      session.cueReadings![0].clarity = clarity;
      expect(getRetainedFlaggedMomentAttributes(session, flagged)).toEqual([]);
    }
    session.cueReadings = [];
    expect(getRetainedFlaggedMomentAttributes(session, flagged)).toEqual([]);
    expect(flagged.moment.attributesHinted).toEqual(["composure", "dribbling"]);
  });

  it("withdraws an initial positive flag when the final read is withheld or unreadable", () => {
    const flagged = { reaction: "promising", moment: { id: "moment", playerId: "player" } } as SessionFlaggedMoment;
    const session = { mode: "fullObservation", cueReadings: [{
      id: "cue", momentId: "moment", playerId: "player", clarity: "clear",
    }], evidenceDecisions: {} } as unknown as ObservationSession;
    expect(getRetainedFlaggedMomentReaction(session, flagged)).toBe("promising");
    session.evidenceDecisions = { cue: { cueId: "cue", classification: "noConclusion" } };
    expect(getRetainedFlaggedMomentReaction(JSON.parse(JSON.stringify(session)), flagged)).toBe("needs_more_data");
    session.evidenceDecisions = {};
    for (const clarity of ["missed", "glimpse"] as const) {
      session.cueReadings![0].clarity = clarity;
      expect(getRetainedFlaggedMomentReaction(session, flagged)).toBe("needs_more_data");
    }
    session.cueReadings = [];
    expect(getRetainedFlaggedMomentReaction(session, flagged)).toBe("needs_more_data");
  });

  it("does not invent match events, attention, or hypotheses for an empty watch", () => {
    const session = createSession({
      activityType: "schoolMatch", specialization: "youth",
      playerPool: [{ playerId: "player-1", name: "Ari Prospect", position: "CM" }],
      seed: "empty-watch", week: 1, season: 1,
    }, new RNG("empty-watch"));
    for (let seed = 0; seed < 30; seed++) {
      const prompts = generateReflectionPrompts(session, new RNG(String(seed))).join(" ");
      expect(prompts).toContain("did not retain a passage");
      expect(prompts).toContain("did not allocate focused attention");
      expect(prompts).not.toMatch(/referee|second half|formed 0|drifting into space|more than usual/);
    }
  });

  it("asks about recorded inquiry decisions after save restoration without inventing body language", () => {
    const session = createSession({
      activityType: "parentCoachMeeting", specialization: "youth",
      playerPool: [{ playerId: "player-1", name: "Ari Prospect", position: "CM" }],
      seed: "inquiry-prompts", week: 1, season: 1,
    }, new RNG("inquiry-prompts"));
    session.phases[0].dialogueChoiceResolutions = {
      question: { phaseIndex: 0, nodeId: "question", optionId: "dates", optionText: "Compare the dates", narrativeText: "Both accounts remain possible.", insightPointsAwarded: 3, relationshipDeltaApplied: 0 },
    };
    const restored = JSON.parse(JSON.stringify(session));
    const prompts = generateReflectionPrompts(restored, new RNG("restored"));
    expect(prompts.join(" ")).toContain("Compare the dates");
    expect(prompts.join(" ")).not.toMatch(/hesitation|body language|guarded|forthcoming/);
    expect(prompts).toEqual(generateReflectionPrompts(session, new RNG("other-seed")));
  });

  it("creates no legacy hypotheses or invisible hypothesis reward for a new session", () => {
    const session = createSession({
      activityType: "schoolMatch",
      specialization: "youth",
      playerPool: [{ playerId: "player-1", name: "Ari Prospect", position: "CM" }],
      targetPlayerId: "player-1",
      seed: "reflection-authority",
      week: 2,
      season: 1,
      countryId: "england",
    }, new RNG("reflection-authority-session"));

    const result = generateReflection(
      session,
      new RNG("reflection-authority-result"),
      0,
      1,
      { paEstimate: false },
    );

    expect(result.suggestedHypotheses).toEqual([]);
    expect(result.gutFeelingCandidate).toBeNull();
    expect(result.insightPointsFromReflection).toBe(5);
  });
});
