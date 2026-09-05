import { describe, expect, it } from "vitest";

import type {
  InitialAssessmentInput,
  Scout,
  ScoutingEvidenceCard,
  StructuredReportInput,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  addReflectionNote,
  advanceSessionPhase,
  createSession,
  setSessionHalftimeApproach,
} from "@/engine/observation/session";
import type {
  ObservationSession,
  PlayerMoment,
  SessionFlaggedMoment,
  SessionPhase,
} from "@/engine/observation/types";
import { getPerceivedFlaggedMomentDescription } from "@/engine/observation/reflection";
import { createRNG } from "@/engine/rng";
import {
  buildInitialAssessment,
  buildFormalAssessment,
  buildSessionEvidenceCards,
  FORMAL_CATEGORY_UNKNOWN_OPTIONS,
  getEvidenceClaimOptions,
  getEvidenceNextTestOptions,
  getEvidenceUnknownOptions,
  resolveSessionCueReadings,
} from "@/engine/scout/evidenceModel";
import { validateStructuredReportInput } from "@/engine/reports/structuredYouthReport";

function scout(skill: number, fatigue = 0): Pick<Scout, "skills" | "attributes" | "fatigue"> {
  return {
    fatigue,
    skills: {
      technicalEye: skill,
      physicalAssessment: skill,
      psychologicalRead: skill,
      tacticalUnderstanding: skill,
      playerJudgment: skill,
      potentialAssessment: skill,
      dataLiteracy: skill,
    },
    attributes: {
      intuition: 10,
      endurance: 10,
      adaptability: 10,
      networking: 10,
      persuasion: 10,
      memory: 10,
    },
  };
}

function liveSession(momentOverrides: Partial<PlayerMoment> = {}): ObservationSession {
  const base = createSession({
    activityType: "schoolMatch",
    specialization: "youth",
    playerPool: [{ playerId: "player-1", name: "Milo Vale", position: "CM" }],
    targetPlayerId: "player-1",
    countryId: "england",
    seed: "structured-evidence-session",
    week: 2,
    season: 1,
  }, createRNG("structured-evidence-session"));
  const moment: PlayerMoment = {
    id: "moment-1",
    playerId: "player-1",
    momentType: "technicalAction",
    quality: 7,
    attributesHinted: ["firstTouch", "passing"],
    description: "Milo opens his body and plays through the first press.",
    vagueDescription: "Milo moves the ball forward under pressure.",
    pressureContext: true,
    isStandout: false,
    ...momentOverrides,
  };
  const phase: SessionPhase = {
    ...base.phases[0],
    index: 0,
    minute: 24,
    description: "First-half passage",
    moments: [moment],
  };
  return {
    ...base,
    state: "active",
    phases: [phase],
    players: [{
      playerId: "player-1",
      name: "Milo Vale",
      position: "CM",
      isFocused: true,
      focusedPhases: [0],
      focusHistory: [{ phaseIndex: 0, lens: "technical" }],
      currentLens: "technical",
    }],
  };
}

function firstCue(
  session: ObservationSession,
  ability: Pick<Scout, "skills" | "attributes" | "fatigue">,
  questionId: "execution" | "movement" = "execution",
  regionalKnowledgeLevel = 40,
) {
  const cue = resolveSessionCueReadings({
    session,
    scout: ability,
    questionId,
    regionalKnowledgeLevel,
  })[0];
  if (!cue) throw new Error("Expected a cue reading");
  return cue;
}

describe("structured scouting evidence model", () => {
  it("gives equally visible success and failure equal clarity without changing their direction", () => {
    const success = firstCue(liveSession({ quality: 9, isStandout: true }), scout(15));
    const failure = firstCue(liveSession({ quality: 2, isStandout: false }), scout(15));
    expect(success.score).toBe(failure.score);
    expect(success.confidence).toBe(failure.confidence);
    expect(success.direction).toBe("positive");
    expect(failure.direction).toBe("negative");
  });

  it("makes a specialist lens a better answer to its question than general focus", () => {
    const specialist = liveSession();
    const general = structuredClone(specialist);
    general.players[0].currentLens = "general";
    general.players[0].focusHistory = [{ phaseIndex: 0, lens: "general" }];
    expect(firstCue(specialist, scout(12)).score).toBeGreaterThan(firstCue(general, scout(12)).score);
    expect(specialist.phases).toEqual(general.phases);
  });

  it("turns a negative action into a contextual concern rather than a supported strength", () => {
    const cue = firstCue(liveSession({ quality: 2 }), scout(20), "execution", 100);
    const card: ScoutingEvidenceCard = {
      ...cue, version: 1, sourceType: "liveObservation", classification: "technicalExecution",
      independenceKey: `session:${cue.sessionId}:negative`,
    };
    const [measured, stretch] = getEvidenceClaimOptions(card);
    expect(measured.statement).toContain("broke down");
    expect(measured.statement).not.toContain("clean technical execution");
    expect(stretch.statement).toContain("recurring limitation");
    const unknown = getEvidenceUnknownOptions(card)[0];
    const result = buildInitialAssessment({
      evidenceCardId: card.id, claimOptionId: measured.id,
      unknownOptionId: unknown.id, nextTestId: getEvidenceNextTestOptions(unknown)[0].id,
      confidence: "working", recommendation: "monitor",
    }, [card]);
    expect(result.valid).toBe(true);
    expect(result.assessment?.score.claimEvidenceFit).toBe(20);
    expect(result.assessment?.generatedSummary).toContain("broke down");
  });

  it("does not call an unreadable glimpse a supported trait claim", () => {
    const cue = firstCue(liveSession({ quality: 2 }), scout(1, 100), "movement", 0);
    const card: ScoutingEvidenceCard = {
      ...cue, version: 1, sourceType: "liveObservation", classification: "technicalExecution",
      independenceKey: `session:${cue.sessionId}:glimpse`,
    };
    expect(getEvidenceClaimOptions(card)[0]).toMatchObject({ support: "withheld", classification: "noConclusion" });
  });
  it("keeps a flagged missed read vague through reflection and serialization", () => {
    const session = liveSession({ quality: 1, isStandout: false });
    session.players = session.players.map((player) => ({
      ...player, isFocused: false, focusedPhases: [], focusHistory: [],
    }));
    const cue = firstCue(session, scout(1, 100), "movement", 0);
    expect(cue.clarity).toBe("missed");
    session.cueReadings = [cue];
    const flagged: SessionFlaggedMoment = {
      id: "missed-flag", phaseIndex: 0, minute: 24,
      moment: session.phases[0].moments[0], reaction: "promising",
    };
    const restored = JSON.parse(JSON.stringify({ session, flagged }));
    const description = getPerceivedFlaggedMomentDescription(restored.session, restored.flagged);
    expect(description).toContain(flagged.moment.vagueDescription);
    expect(description).toContain("could not isolate a defensible cue");
    expect(description).not.toContain(flagged.moment.description);
  });

  it("retains earned detailed evidence when a clearly read moment is flagged", () => {
    const session = liveSession({ quality: 10, isStandout: true });
    const cue = firstCue(session, scout(20), "execution", 100);
    expect(["usable", "strong", "exceptional"]).toContain(cue.clarity);
    session.cueReadings = [cue];
    const flagged: SessionFlaggedMoment = {
      id: "clear-flag", phaseIndex: 0, minute: 24,
      moment: session.phases[0].moments[0], reaction: "promising",
    };
    expect(getPerceivedFlaggedMomentDescription(session, flagged)).toContain(flagged.moment.description);
  });

  it("does not invent detailed evidence when a legacy flag has no saved cue", () => {
    const session = liveSession();
    const flagged: SessionFlaggedMoment = {
      id: "legacy-flag", phaseIndex: 0, minute: 24,
      moment: session.phases[0].moments[0], reaction: "interesting",
    };
    session.cueReadings = undefined;
    expect(getPerceivedFlaggedMomentDescription(session, flagged)).toBe(flagged.moment.vagueDescription);
  });

  it("is deterministic for the same save state and player decisions", () => {
    const session = liveSession();
    const input = {
      session,
      scout: scout(12),
      questionId: "execution" as const,
      regionalKnowledgeLevel: 55,
    };

    expect(resolveSessionCueReadings(input)).toEqual(resolveSessionCueReadings(input));
  });

  it("rewards relevant skill and question alignment while fatigue degrades the read", () => {
    const session = liveSession();
    const lowSkill = firstCue(session, scout(4));
    const highSkill = firstCue(session, scout(18));
    const misaligned = firstCue(session, scout(18), "movement");
    const fatigued = firstCue(session, scout(18, 90));

    expect(highSkill.score).toBeGreaterThan(lowSkill.score);
    expect(highSkill.score).toBeGreaterThan(misaligned.score);
    expect(fatigued.score).toBeLessThan(highSkill.score);
    expect(highSkill.confidence).toBeLessThan(1);
  });

  it("uses regional knowledge as bounded context rather than a truth reveal", () => {
    const session = liveSession();
    const unfamiliar = firstCue(session, scout(12), "execution", 0);
    const familiar = firstCue(session, scout(12), "execution", 100);

    expect(familiar.score).toBeGreaterThan(unfamiliar.score);
    expect(familiar.confidence - unfamiliar.confidence).toBeLessThan(0.2);
    expect(familiar.regionalContext).toMatch(/reference|context/i);
    expect(familiar.regionalContext).toMatch(/not predict|provisional|comparison/i);
    expect(familiar).not.toHaveProperty("trueValue");
  });

  it("preserves cue provenance and the player's classification in durable evidence", () => {
    const active = liveSession();
    const cue = firstCue(active, scout(14));
    const reflection: ObservationSession = {
      ...active,
      state: "reflection",
      cueReadings: [cue],
      flaggedMoments: [{
        id: "flag-1",
        moment: active.phases[0].moments[0],
        phaseIndex: 0,
        minute: 24,
        reaction: "promising",
      }],
      evidenceDecisions: {
        [cue.id]: { cueId: cue.id, classification: "noConclusion" },
      },
    };

    const [card] = buildSessionEvidenceCards(reflection);
    expect(card).toMatchObject({
      id: cue.id,
      sessionId: reflection.id,
      momentId: "moment-1",
      playerId: "player-1",
      classification: "noConclusion",
      sourceType: "liveObservation",
      version: 1,
    });
    expect(card.independenceKey).toContain(reflection.id);
  });

  it("builds report copy only from structured choices and exposes overclaiming", () => {
    const cue = firstCue(liveSession({ quality: 4 }), scout(5), "execution", 0);
    const card: ScoutingEvidenceCard = {
      ...cue,
      version: 1,
      sourceType: "liveObservation",
      classification: cue.suggestedClassifications[0],
      independenceKey: `session:${cue.sessionId}:${cue.playerId}:test`,
    };
    const claim = getEvidenceClaimOptions(card).find((option) => option.support === "stretch")!;
    const unknown = getEvidenceUnknownOptions(card)[0];
    const nextTest = getEvidenceNextTestOptions(unknown)[0];
    const input: InitialAssessmentInput = {
      evidenceCardId: card.id,
      claimOptionId: claim.id,
      unknownOptionId: unknown.id,
      nextTestId: nextTest.id,
      confidence: "robust",
      recommendation: "offerAcademyPlace",
    };

    const first = buildInitialAssessment(input, [card], "Milo Vale");
    const second = buildInitialAssessment(input, [card], "Milo Vale");
    expect(first).toEqual(second);
    expect(first.valid).toBe(true);
    expect(first.assessment?.overclaimCount).toBeGreaterThan(0);
    expect(first.assessment?.generatedSummary).toContain("Milo Vale");
    expect(first.assessment?.generatedSummary).not.toMatch(/\bthe game\b/i);
    expect(first.assessment?.claims[0].evidenceIds).toEqual([card.id]);
    expect(first.assessment?.nextTest.id).toBe(nextTest.id);
  });

  it("builds a formal report from provenance while allowing honest unassessed categories", () => {
    const cue = firstCue(liveSession(), scout(14), "execution", 60);
    const card: ScoutingEvidenceCard = {
      ...cue,
      version: 1,
      sourceType: "liveObservation",
      classification: "technicalExecution",
      independenceKey: `session:${cue.sessionId}:${cue.playerId}:technicalExecution`,
    };
    const claim = getEvidenceClaimOptions(card)[0];
    const potentialUnknown = getEvidenceUnknownOptions(card)[0];
    const input: StructuredReportInput = {
      briefId: "brief-1",
      intendedClubId: "club-1",
      intendedAudience: "academyDirector",
      presentationApproach: "evidenceLed",
      recruitmentNeed: "A development midfielder for the current pathway.",
      projectedRole: "deepLyingPlaymaker",
      recommendedAction: "inviteForTrial",
      riskFactors: ["Competition translation remains untested"],
      estimatedWeeklyWage: 300,
      decisionDeadlineWeek: 8,
      decisionDeadlineSeason: 1,
      categoryVerdicts: {
        potential: {
          verdict: claim.statement,
          confidence: "medium",
          hypothesisIds: [],
          acknowledgedUncertainty: potentialUnknown.statement,
          status: "assessed",
          evidenceIds: [card.id],
          classification: claim.classification,
          claimSupport: claim.support,
          unknownOptionId: potentialUnknown.id,
        },
        roleFit: {
          verdict: "No reportable claim is being made from the available evidence.",
          confidence: "low",
          hypothesisIds: [],
          acknowledgedUncertainty: FORMAL_CATEGORY_UNKNOWN_OPTIONS.roleFit[0].statement,
          status: "notAssessed",
          evidenceIds: [],
          unknownOptionId: FORMAL_CATEGORY_UNKNOWN_OPTIONS.roleFit[0].id,
        },
        characterRisk: {
          verdict: "No reportable claim is being made from the available evidence.",
          confidence: "low",
          hypothesisIds: [],
          acknowledgedUncertainty: FORMAL_CATEGORY_UNKNOWN_OPTIONS.characterRisk[0].statement,
          status: "notAssessed",
          evidenceIds: [],
          unknownOptionId: FORMAL_CATEGORY_UNKNOWN_OPTIONS.characterRisk[0].id,
        },
      },
      alternativePlayerIds: [],
      evidenceVersion: 1,
      evidenceIds: [card.id],
      riskAssessments: [{
        id: "competitionTranslation",
        label: "Competition translation",
        status: "untested",
        evidenceIds: [],
      }],
    };
    const brief = {
      id: "brief-1",
      clubId: "club-1",
      status: "open",
    } as YouthRecruitmentBrief;

    expect(validateStructuredReportInput(input, brief, new Set([card.id]))).toEqual({
      valid: true,
      errors: [],
    });
    const first = buildFormalAssessment(input, [card], "Milo Vale", "Northbridge Academy");
    expect(first.valid).toBe(true);
    expect(first.assessment?.kind).toBe("formal");
    expect(first.assessment?.claims).toHaveLength(1);
    expect(first.assessment?.unknowns).toHaveLength(3);
    expect(first.assessment?.generatedSummary).toContain("Northbridge Academy");
    expect(first.assessment?.generatedSummary).not.toMatch(/\bthe game\b/i);

    const contradictory = buildFormalAssessment(input, [{ ...card, direction: "negative" }]);
    expect(contradictory.assessment?.score.claimEvidenceFit).toBe(0);
    expect(contradictory.assessment!.score.total).toBeLessThan(first.assessment!.score.total);

    const repeatedUnknown = "The same pressure question remains unanswered.";
    const repeatedUnknownInput: StructuredReportInput = {
      ...input,
      categoryVerdicts: Object.fromEntries(
        Object.entries(input.categoryVerdicts).map(([category, verdict]) => [
          category,
          { ...verdict, acknowledgedUncertainty: repeatedUnknown },
        ]),
      ) as StructuredReportInput["categoryVerdicts"],
    };
    const deduplicated = buildFormalAssessment(
      repeatedUnknownInput,
      [card],
      "Milo Vale",
      "Northbridge Academy",
    );
    expect(deduplicated.assessment?.unknowns).toHaveLength(1);
    expect(deduplicated.assessment?.score.unknownHandling).toBe(3);
    expect(deduplicated.assessment?.generatedSummary.match(/same pressure question/gi)).toHaveLength(1);

    const unsupportedRisk: StructuredReportInput = {
      ...input,
      riskAssessments: [{
        id: "injuryAvailability",
        label: "Availability or injury",
        status: "observed",
        evidenceIds: [],
      }],
    };
    expect(validateStructuredReportInput(unsupportedRisk, brief, new Set([card.id])).valid).toBe(false);

    const contradictoryRisk: StructuredReportInput = {
      ...input,
      riskAssessments: [
        {
          id: "noMaterialSignal",
          label: "No material risk signal",
          status: "noSignal",
          evidenceIds: [],
        },
        {
          id: "physicalDevelopment",
          label: "Physical development",
          status: "untested",
          evidenceIds: [],
        },
      ],
    };
    expect(validateStructuredReportInput(contradictoryRisk, brief, new Set([card.id]))).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "No material risk signal cannot be combined with a specific risk.",
      ]),
    });
  });

  it("keeps private notes mechanically inert", () => {
    const session = { ...liveSession(), state: "reflection" as const, insightPointsEarned: 17 };
    const updated = addReflectionNote(session, "Watch his shoulder checks next time.");

    expect(updated.reflectionNotes).toEqual(["Watch his shoulder checks next time."]);
    expect(updated.insightPointsEarned).toBe(17);
  });

  it("requires a deliberate halftime adjustment before the second half", () => {
    const base = liveSession();
    const firstHalf: SessionPhase = {
      ...base.phases[0],
      index: 0,
      minute: 32,
      description: "First half",
      isHalfTime: false,
    };
    const halftime: SessionPhase = {
      ...base.phases[0],
      index: 1,
      minute: 45,
      description: "Half-time",
      isHalfTime: undefined,
      moments: [],
    };
    const secondHalf: SessionPhase = {
      ...base.phases[0],
      index: 2,
      minute: 55,
      description: "Second half",
      isHalfTime: false,
      moments: [],
    };
    const session = { ...base, phases: [firstHalf, halftime, secondHalf], currentPhaseIndex: 1 };

    expect(advanceSessionPhase(session)).toBe(session);
    const adjusted = setSessionHalftimeApproach(session, "challenge", []);
    expect(adjusted.halftimeApproach).toBe("challenge");
    expect(advanceSessionPhase(adjusted).currentPhaseIndex).toBe(2);
  });
});
