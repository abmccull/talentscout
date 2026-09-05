import { describe, expect, it } from "vitest";
import type { EvidenceClassificationId, Scout, ScoutingEvidenceCard, StructuredReportInput } from "@/engine/core/types";
import { MOMENT_ACTIONS } from "@/engine/observation/momentActions";
import { classifySessionEvidence, createSession } from "@/engine/observation/session";
import type { ObservationSession, PlayerMoment } from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";
import { getSupportedCueClassifications } from "@/engine/scout/cueSemantics";
import {
  SCOUTING_QUESTIONS, FORMAL_CATEGORY_UNKNOWN_OPTIONS, buildFormalAssessment,
  buildSessionEvidenceCards, getEvidenceClaimOptions, resolveSessionCueReadings,
} from "@/engine/scout/evidenceModel";

const skilledScout: Pick<Scout, "skills" | "attributes" | "fatigue"> = {
  fatigue: 0,
  skills: { technicalEye: 20, physicalAssessment: 20, psychologicalRead: 20, tacticalUnderstanding: 20,
    playerJudgment: 20, potentialAssessment: 20, dataLiteracy: 20 },
  attributes: { intuition: 20, endurance: 20, adaptability: 20, networking: 20, persuasion: 20, memory: 20 },
};

// Independent expectations: changing a question must never create a new event.
const expectedSemantics: Record<string, EvidenceClassificationId[]> = {
  "short-pass": ["technicalExecution"],
  "pressured-reception": ["technicalExecution", "pressureResponse"],
  "dribble-duel": ["technicalExecution"], "cross": ["technicalExecution"],
  "finish": ["technicalExecution"], "contested-header": ["technicalExecution"], "tackle": ["technicalExecution"],
  "recovery-sprint": ["physicalExecution"], "aerial-contest": ["physicalExecution"],
  "balance-challenge": ["physicalExecution"], "repeat-run": ["physicalRepeatability", "physicalExecution"],
  "change-direction": ["physicalExecution"], "decision-under-pressure": ["decisionMaking", "pressureResponse"],
  "unhurried-decision": ["decisionMaking"], "teammate-direction": [], "support-run": ["offBallMovement"],
  "press-trigger": ["offBallMovement"], "runner-marking": ["offBallMovement"], "cover-position": ["offBallMovement"],
  "shape-communication": [], "response-to-mistake": ["pressureResponse"], "response-to-instruction": [],
};

function retained(actionId: string, question = SCOUTING_QUESTIONS[0], quality = 3) {
  const action = MOMENT_ACTIONS.find((candidate) => candidate.id === actionId)!;
  const base = createSession({ activityType: "schoolMatch", specialization: "youth",
    playerPool: [{ playerId: "ryan", name: "Ryan Ashley", position: "CM" }], targetPlayerId: "ryan",
    countryId: "england", seed: "semantic-session", week: 2, season: 1 }, createRNG("semantic-session"));
  const moment: PlayerMoment = { id: `moment:${actionId}`, actionId, playerId: "ryan", momentType: action.momentType,
    attributesHinted: [...action.attributes], quality, pressureContext: action.pressure, isStandout: false,
    description: action.descriptions[quality <= 4 ? "low" : "high"].replace("{playerName}", "Ryan Ashley"),
    vagueDescription: action.vague };
  const session: ObservationSession = { ...base, state: "reflection", venueAtmosphere: undefined,
    phases: [{ ...base.phases[0], index: 0, minute: 24, moments: [moment] }],
    players: [{ playerId: "ryan", name: "Ryan Ashley", position: "CM", isFocused: true, focusedPhases: [0],
      focusHistory: [{ phaseIndex: 0, lens: question.lens }], currentLens: question.lens }],
    flaggedMoments: [{ id: "flag", phaseIndex: 0, minute: 24, moment, reaction: "interesting" }] };
  session.cueReadings = resolveSessionCueReadings({ session, scout: skilledScout, questionId: question.id, regionalKnowledgeLevel: 100 });
  return session;
}

function formalInput(card: ScoutingEvidenceCard): StructuredReportInput {
  const claim = getEvidenceClaimOptions(card)[0];
  const unassessed = (category: keyof StructuredReportInput["categoryVerdicts"]): StructuredReportInput["categoryVerdicts"]["potential"] => {
    const unknown = FORMAL_CATEGORY_UNKNOWN_OPTIONS[category][0];
    return { verdict: "No reportable claim.", confidence: "low", hypothesisIds: [],
      acknowledgedUncertainty: unknown.statement, status: "notAssessed", evidenceIds: [], unknownOptionId: unknown.id };
  };
  const categoryVerdicts: StructuredReportInput["categoryVerdicts"] = {
    potential: unassessed("potential"), roleFit: unassessed("roleFit"), characterRisk: unassessed("characterRisk"),
  };
  categoryVerdicts[claim.category] = { ...categoryVerdicts[claim.category], status: "assessed", verdict: claim.statement,
    evidenceIds: [card.id], classification: claim.classification, claimSupport: claim.support };
  return { briefId: "brief", intendedClubId: "club", intendedAudience: "academyDirector", presentationApproach: "evidenceLed",
    recruitmentNeed: "A development midfielder.", projectedRole: "deepLyingPlaymaker", recommendedAction: "monitor",
    riskFactors: [], estimatedWeeklyWage: 300, decisionDeadlineWeek: 8, decisionDeadlineSeason: 1,
    categoryVerdicts, alternativePlayerIds: [], evidenceVersion: 1, evidenceIds: [card.id], riskAssessments: [] };
}

describe("action-grounded cue classifications", () => {
  it.each(MOMENT_ACTIONS.map((action) => action.id))("keeps %s semantics fixed across all six questions and both outcome directions", (actionId) => {
    expect(Object.keys(expectedSemantics)).toHaveLength(22);
    for (const quality of [3, 8]) for (const question of SCOUTING_QUESTIONS) {
      const session = retained(actionId, question, quality);
      const cue = session.cueReadings![0];
      expect(["usable", "strong", "exceptional"]).toContain(cue.clarity);
      expect(cue.questionId).toBe(question.id);
      expect(cue.suggestedClassifications).toEqual([...expectedSemantics[actionId], "noConclusion"]);
      const [card] = buildSessionEvidenceCards(JSON.parse(JSON.stringify(session)));
      expect(card.actionId).toBe(actionId);
      expect(card.classification).toBe(expectedSemantics[actionId][0] ?? "noConclusion");
      expect(card.direction).toBe(quality === 3 ? "negative" : "positive");
      expect(card.detail).toContain(session.phases[0].moments[0].description);
      expect(getEvidenceClaimOptions(card)[0].classification).toBe(card.classification);
    }
  });

  it("does not turn a failed supporting run into scanning before receiving", () => {
    const session = retained("support-run", SCOUTING_QUESTIONS.find((question) => question.id === "decisions")!);
    const [card] = buildSessionEvidenceCards(session);
    expect(card.summary).toContain("off-ball movement");
    expect(card.summary).not.toMatch(/pre-receive|pressure/);
    expect(card.detail).toContain("left the ball carrier isolated");
    expect(card.pressureContext).toBe(false);
    expect(getEvidenceClaimOptions(card)[0].statement).toContain("ineffective");
    expect(getEvidenceClaimOptions(card).map((claim) => claim.statement).join(" ")).not.toMatch(/scann|receiv|pressure/i);
  });

  it("retains an unhurried poor decision even when the scout asks about pressure", () => {
    const session = retained("unhurried-decision", SCOUTING_QUESTIONS.find((question) => question.id === "pressure")!);
    const [card] = buildSessionEvidenceCards(session);
    expect(card.questionId).toBe("pressure");
    expect(card.pressureContext).toBe(false);
    expect(card.summary).toContain("decision-making");
    expect(card.detail).toContain("had time to survey the options");
    expect(card.suggestedClassifications).not.toContain("pressureResponse");
    expect(getEvidenceClaimOptions(card)[0].statement).toContain("ineffective option");
    expect(getEvidenceClaimOptions(card).map((claim) => claim.statement).join(" ")).not.toMatch(/scann|receiv|pressure/i);
  });

  it("keeps the question as a clarity tradeoff, without changing outcomes or classifications", () => {
    const relevant = retained("support-run", SCOUTING_QUESTIONS.find((question) => question.id === "movement")!);
    const unrelated = retained("support-run", SCOUTING_QUESTIONS.find((question) => question.id === "pressure")!);
    expect(relevant.phases).toEqual(unrelated.phases);
    expect(relevant.cueReadings![0].factors.questionAlignment).toBeGreaterThan(unrelated.cueReadings![0].factors.questionAlignment);
    expect(relevant.cueReadings![0].score).toBeGreaterThan(unrelated.cueReadings![0].score);
    expect(relevant.cueReadings![0].suggestedClassifications).toEqual(unrelated.cueReadings![0].suggestedClassifications);
    expect(resolveSessionCueReadings({ session: relevant, scout: skilledScout, questionId: "movement", regionalKnowledgeLevel: 100 })).toEqual(relevant.cueReadings);
  });

  it("does not infer repeatability from a single physical action", () => {
    const [single] = buildSessionEvidenceCards(retained("recovery-sprint", SCOUTING_QUESTIONS[4], 8));
    const [repeated] = buildSessionEvidenceCards(retained("repeat-run", SCOUTING_QUESTIONS[4], 8));
    expect(single.classification).toBe("physicalExecution");
    expect(single.suggestedClassifications).not.toContain("physicalRepeatability");
    expect(getEvidenceClaimOptions(single)[0].statement).toContain("repeatability remains untested");
    expect(repeated.classification).toBe("physicalRepeatability");
    expect(getEvidenceClaimOptions(repeated)[0].statement).toContain("sustained the repeated effort");
  });

  it("retains withholding judgment in both reflection and the durable card heading", () => {
    const session = retained("support-run");
    const cue = session.cueReadings![0];
    const updated = classifySessionEvidence(session, cue.id, "noConclusion");
    const [card] = buildSessionEvidenceCards(updated);
    expect(card.classification).toBe("noConclusion");
    expect(card.summary).toBe("Observed behavior; interpretation open");
    expect(card.detail).toContain(session.phases[0].moments[0].description);
    expect(getEvidenceClaimOptions(card)[0].support).toBe("withheld");
  });

  it.each(["glimpse", "missed"] as const)("%s cannot grant trait interpretations even with a known action", (clarity) => {
    const session = retained("pressured-reception");
    session.cueReadings![0] = { ...session.cueReadings![0], clarity, attributesHinted: [] };
    const cue = session.cueReadings![0];
    expect(getSupportedCueClassifications(cue)).toEqual(["noConclusion"]);
    expect(classifySessionEvidence(session, cue.id, "pressureResponse")).toBe(session);
    const [card] = buildSessionEvidenceCards(session);
    expect(card.classification).toBe("noConclusion");
    expect(card.detail).not.toContain(session.phases[0].moments[0].description);
    expect(getEvidenceClaimOptions(card)[0].support).toBe("withheld");
  });

  it("refuses unsupported legacy advertised options and stale persisted decisions", () => {
    const session = retained("unhurried-decision");
    delete session.phases[0].moments[0].actionId;
    delete session.flaggedMoments[0].moment.actionId;
    const cue = { ...session.cueReadings![0], actionId: undefined, attributesHinted: ["decisionMaking"] as const,
      suggestedClassifications: ["pressureResponse", "preReceiveDecision", "physicalRepeatability"] as EvidenceClassificationId[] };
    session.cueReadings = [{ ...cue, attributesHinted: [...cue.attributesHinted] }];
    for (const classification of cue.suggestedClassifications) {
      expect(classifySessionEvidence(session, cue.id, classification)).toBe(session);
    }
    expect(classifySessionEvidence(session, cue.id, "noConclusion").evidenceDecisions?.[cue.id].classification).toBe("noConclusion");
    session.evidenceDecisions = { [cue.id]: { cueId: cue.id, classification: "pressureResponse" } };
    const [card] = buildSessionEvidenceCards(session);
    expect(card.classification).toBe("decisionMaking");
    expect(card.summary).not.toMatch(/pressure|pre-receive/);
    const forgedCard = { ...card, classification: "pressureResponse" as const };
    expect(getEvidenceClaimOptions(forgedCard)[0]).toMatchObject({ classification: "noConclusion", support: "withheld" });
    const valid = formalInput(card);
    expect(buildFormalAssessment(valid, [card]).valid).toBe(true);
    const forged = { ...valid, categoryVerdicts: { ...valid.categoryVerdicts,
      roleFit: { ...valid.categoryVerdicts.roleFit, classification: "pressureResponse" as const,
        verdict: "The player remained composed under pressure." } } };
    expect(buildFormalAssessment(forged, [forgedCard])).toMatchObject({ valid: false,
      errors: expect.arrayContaining(["roleFit asserts an interpretation that its saved action does not support."]) });
  });

  it("does not trust an unknown or inconsistent catalog identity", () => {
    const cue = retained("support-run").cueReadings![0];
    expect(getSupportedCueClassifications({ ...cue, actionId: "future-unrecognized-action" })).toEqual(["noConclusion"]);
    expect(getSupportedCueClassifications({ ...cue, actionId: "pressured-reception" })).toEqual(["noConclusion"]);
    expect(getSupportedCueClassifications({ ...cue, attributesHinted: ["finishing"] })).toEqual(["noConclusion"]);
    expect(getSupportedCueClassifications({ ...cue, attributesHinted: [] })).toEqual(["noConclusion"]);
    expect(getSupportedCueClassifications({ ...cue, attributesHinted: undefined as never })).toEqual(["noConclusion"]);
  });
});
