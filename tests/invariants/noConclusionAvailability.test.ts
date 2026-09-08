import { describe, expect, it } from "vitest";
import type { Scout } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { createSession, classifySessionEvidence } from "@/engine/observation/session";
import { SCOUTING_QUESTIONS, resolveSessionCueReadings, buildSessionEvidenceCards } from "@/engine/scout/evidenceModel";

function observer(skill: number, fatigue: number): Pick<Scout, "skills" | "attributes" | "fatigue"> {
  return {
    fatigue,
    skills: { technicalEye: skill, physicalAssessment: skill, psychologicalRead: skill,
      tacticalUnderstanding: skill, playerJudgment: skill, potentialAssessment: skill, dataLiteracy: skill },
    attributes: { intuition: 10, endurance: 10, adaptability: 10, networking: 10, persuasion: 10, memory: 10 },
  };
}

function exampleSession(seed = "no-conclusion") {
  const session = createSession({
    activityType: "schoolMatch", specialization: "youth",
    playerPool: [{ playerId: "prospect", name: "Ari Vale", position: "CM" }],
    targetPlayerId: "prospect", seed, week: 1, season: 1,
  }, createRNG(seed));
  session.phases = [{
    ...session.phases[0], index: 0, minute: 24,
    moments: [2, 5, 8, 9].map((quality, index) => ({
      id: `moment-${index}`, playerId: "prospect", momentType: "technicalAction" as const,
      quality, attributesHinted: ["passing" as const],
      description: "A passing action under pressure.", vagueDescription: "An action at the edge of the view.",
      pressureContext: true, isStandout: quality >= 8,
    })),
  }];
  return session;
}

describe("no-conclusion availability", () => {
  it("always offers noConclusion for generated cues, and offers only that interpretation for unreadable cues", () => {
    const clarities = new Set<string>();
    let checked = 0;
    for (const question of SCOUTING_QUESTIONS) {
      for (const [skill, fatigue, focused] of [[1, 100, false], [1, 90, true], [20, 0, true]] as const) {
        const session = exampleSession(`no-conclusion-${question.id}-${skill}-${fatigue}`);
        session.players[0] = {
          ...session.players[0], isFocused: focused,
          focusedPhases: focused ? session.phases.map((phase) => phase.index) : [],
          currentLens: question.lens, focusHistory: [{ phaseIndex: 0, lens: question.lens }],
        };
        const cues = resolveSessionCueReadings({ session, scout: observer(skill, fatigue), questionId: question.id });
        for (const cue of cues) {
          checked += 1;
          clarities.add(cue.clarity);
          expect(cue.suggestedClassifications).toContain("noConclusion");
          expect(cue.suggestedClassifications.length).toBeLessThanOrEqual(4);
          if (cue.clarity === "glimpse" || cue.clarity === "missed") {
            expect(cue.suggestedClassifications).toEqual(["noConclusion"]);
            expect(cue.attributesHinted).toEqual([]);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(clarities.has("glimpse")).toBe(true);
    expect(clarities.has("missed")).toBe(true);
    expect([...clarities].some((clarity) => !["glimpse", "missed"].includes(clarity))).toBe(true);
  });

  it("records noConclusion through the real reflection action and preserves it in the saved evidence card", () => {
    const session = exampleSession();
    session.state = "reflection";
    session.players[0] = { ...session.players[0], isFocused: true, focusedPhases: [0],
      currentLens: "technical", focusHistory: [{ phaseIndex: 0, lens: "technical" }] };
    session.cueReadings = resolveSessionCueReadings({ session, scout: observer(20, 0), questionId: "execution" });
    const cue = session.cueReadings[0];
    const phase = session.phases.find((entry) => entry.index === cue.phaseIndex)!;
    const moment = phase.moments.find((entry) => entry.id === cue.momentId)!;
    session.flaggedMoments = [{ id: "flag", phaseIndex: phase.index, minute: phase.minute,
      moment, reaction: "needs_more_data" }];
    const classified = classifySessionEvidence(session, cue.id, "noConclusion");
    expect(classified.evidenceDecisions?.[cue.id]?.classification).toBe("noConclusion");
    expect(buildSessionEvidenceCards(JSON.parse(JSON.stringify(classified)))[0].classification).toBe("noConclusion");
  });

  it.each(["glimpse", "missed"] as const)("keeps legacy %s cards inconclusive even if an old decision claimed a trait", (clarity) => {
    const session = exampleSession();
    session.players[0].focusedPhases = session.phases.map((phase) => phase.index);
    session.cueReadings = resolveSessionCueReadings({ session, scout: observer(20, 0), questionId: "execution" });
    const cue = session.cueReadings[0];
    cue.clarity = clarity;
    cue.attributesHinted = [];
    session.evidenceDecisions = { [cue.id]: { cueId: cue.id, classification: "technicalExecution" } };
    const phase = session.phases.find((entry) => entry.index === cue.phaseIndex)!;
    session.flaggedMoments = [{ id: "old-flag", phaseIndex: phase.index, minute: phase.minute,
      moment: phase.moments.find((entry) => entry.id === cue.momentId)!, reaction: "promising" }];
    expect(buildSessionEvidenceCards(session)[0].classification).toBe("noConclusion");
  });
});
