import { describe, expect, it } from "vitest";

import type {
  PlayerMoment,
  SessionPlayer,
} from "@/engine/observation/types";
import {
  buildObservationExperienceSnapshot,
  buildContextualScoutingQuestions,
  resolveObservationSignalAssessment,
} from "@/engine/observation/questions";
import { createSession } from "@/engine/observation/session";
import { selectMomentType } from "@/engine/observation/moments";
import { createObservationSituation } from "@/engine/observation/situations";
import { createRNG } from "@/engine/rng";
import type {
  Observation,
  ReflectionJournalEntry,
  ScoutCueReading,
} from "@/engine/core/types";

const PRESSING = {
  ...createObservationSituation({
    activityType: "youthTournament",
    seed: "question-variety-pressing",
    countryId: "england",
  }),
  tacticalFrame: "pressing" as const,
  stakes: "competitive" as const,
  repetitionKey: "youthTournament:academy:pressing:competitive",
};

const CENTRE_BACK: SessionPlayer = {
  playerId: "cb-1",
  name: "Case Defender",
  position: "CB",
  naturalRole: "ballPlayingDefender",
  isFocused: false,
  focusedPhases: [],
  focusHistory: [],
};

const STRIKER: SessionPlayer = {
  playerId: "st-1",
  name: "Case Forward",
  position: "ST",
  naturalRole: "advancedForward",
  isFocused: false,
  focusedPhases: [],
  focusHistory: [],
};

function cue(
  sessionId: string,
  momentId: string,
  clarity: ScoutCueReading["clarity"],
  confidence: number,
): ScoutCueReading {
  return {
    id: `cue:${sessionId}:${momentId}`,
    sessionId,
    momentId,
    playerId: STRIKER.playerId,
    phaseIndex: 0,
    minute: 12,
    questionId: "execution",
    lens: "technical",
    clarity,
    score: confidence,
    confidence,
    confidenceBand: confidence >= 0.76 ? "robust" : confidence >= 0.58 ? "supported" : confidence >= 0.38 ? "working" : "tentative",
    direction: "positive",
    summary: "A saved technical cue",
    detail: "The first touch created a clean next action.",
    suggestedClassifications: ["technicalExecution", "noConclusion"],
    attributesHinted: clarity === "missed" ? [] : ["firstTouch"],
    pressureContext: true,
    contextKey: PRESSING.repetitionKey,
    countryId: "england",
    regionalContext: "A known regional reference point.",
    factors: {
      domainSkill: 0.2,
      judgment: 0.1,
      focus: 0.2,
      questionAlignment: 0.15,
      eventSignal: 0.12,
      regionalContext: 0.04,
      fatigue: 0,
      conditions: 0,
      boundedUncertainty: 0,
    },
  };
}

function signalSession(clarity: ScoutCueReading["clarity"], confidence: number) {
  const base = createSession({
    activityType: "schoolMatch",
    specialization: "youth",
    playerPool: [{
      playerId: STRIKER.playerId,
      name: STRIKER.name,
      position: STRIKER.position,
      naturalRole: STRIKER.naturalRole,
    }],
    targetPlayerId: STRIKER.playerId,
    seed: `signal-${clarity}-${confidence}`,
    week: 2,
    season: 1,
    countryId: "england",
    observerContext: {
      skillByQuestion: { execution: confidence > 0.7 ? 18 : 10 },
      regionalKnowledgeLevel: confidence > 0.7 ? 80 : 50,
      priorObservationCount: confidence > 0.7 ? 2 : 0,
      priorIndependentContextCount: confidence > 0.7 ? 2 : 0,
      priorEvidenceQuality: confidence > 0.7 ? 0.72 : 0.5,
      priorContextKeys: confidence > 0.7 ? ["schoolMatch:school:routine:direct:standard"] : [],
    },
  }, createRNG(`signal-session-${clarity}-${confidence}`));
  const moment: PlayerMoment = {
    id: "moment-1",
    playerId: STRIKER.playerId,
    momentType: "technicalAction",
    quality: 7,
    attributesHinted: ["firstTouch"],
    description: "The player controlled a difficult pass and released it cleanly.",
    vagueDescription: "A controlled touch in traffic.",
    pressureContext: true,
    isStandout: false,
  };
  return {
    ...base,
    state: "complete" as const,
    situation: PRESSING,
    phases: base.phases.map((phase, index) => index === 0 ? { ...phase, moments: [moment] } : phase),
    flaggedMoments: [{
      id: "flag-1",
      phaseIndex: 0,
      moment,
      reaction: "promising" as const,
      minute: 12,
    }],
    cueReadings: [cue(base.id, moment.id, clarity, confidence)],
  };
}

describe("contextual observation questions", () => {
  it("changes the recommended question and prompt with the player's tactical role", () => {
    const defender = buildContextualScoutingQuestions({
      player: CENTRE_BACK,
      activityType: "youthTournament",
      situation: PRESSING,
    });
    const striker = buildContextualScoutingQuestions({
      player: STRIKER,
      activityType: "youthTournament",
      situation: PRESSING,
    });

    expect(defender[0].id).toBe("decisions");
    expect(striker[0].id).toBe("execution");
    expect(defender[0].prompt).toContain("holds the line");
    expect(striker[0].prompt).toContain("finishing action");
    expect(defender).toHaveLength(6);
    expect(defender.filter((question) => question.recommended)).toHaveLength(1);
  });

  it("uses opponent, prior questions, and open unknowns to avoid a formulaic repeat", () => {
    const options = buildContextualScoutingQuestions({
      player: STRIKER,
      activityType: "youthTournament",
      situation: PRESSING,
      opponent: {
        name: "Northbridge Academy",
        relativeStrength: "stronger",
        tacticalFrame: "pressing",
        familiarity: "unfamiliar",
      },
      observer: {
        priorObservationCount: 3,
        priorQuestionIds: ["execution", "execution", "movement"],
        openQuestionIds: ["pressure"],
        skillByQuestion: { pressure: 14 },
        regionalKnowledgeLevel: 65,
        priorEvidenceQuality: 0.42,
      },
    });

    expect(options[0].id).toBe("pressure");
    expect(options[0].reason).toContain("uncertainty already open on the case");
    expect(options[0].contextAngle).toContain("Northbridge Academy");
    expect(options.find((option) => option.id === "execution")?.reason).toContain("asked this before");
  });

  it("builds skill, regional, prior-observation, and evidence-quality context from canonical records", () => {
    const observations = ["session-a", "session-b"].map((sourceSessionId, index) => ({
      id: `observation-${index}`,
      playerId: STRIKER.playerId,
      scoutId: "scout-1",
      sourceSessionId,
      week: index + 1,
      season: 1,
      context: index === 0 ? "schoolMatch" : "youthTournament",
      attributeReadings: [{
        attribute: "firstTouch",
        perceivedValue: 13,
        confidence: index === 0 ? 0.5 : 0.7,
        observationCount: 1,
      }],
      notes: [],
      flaggedMoments: [],
      situation: { ...PRESSING, repetitionKey: `${PRESSING.repetitionKey}:${index}` },
    })) satisfies Observation[];
    const reflectionEntries = [{
      id: "reflection-1",
      sessionId: "session-a",
      activityType: "schoolMatch",
      week: 1,
      season: 1,
      playerIds: [STRIKER.playerId],
      notes: [],
      hypotheses: [],
      scoutingQuestionId: "execution",
      evidenceCards: [],
      createdAt: 1,
    }] satisfies ReflectionJournalEntry[];
    const snapshot = buildObservationExperienceSnapshot({
      scout: {
        skills: {
          technicalEye: 18,
          physicalAssessment: 12,
          psychologicalRead: 10,
          tacticalUnderstanding: 16,
          dataLiteracy: 8,
          playerJudgment: 14,
          potentialAssessment: 15,
        },
      },
      playerId: STRIKER.playerId,
      observations,
      reflectionEntries,
      regionalKnowledgeLevel: 72,
      openQuestionIds: ["pressure", "pressure"],
    });

    expect(snapshot).toMatchObject({
      skillByQuestion: { execution: 16, pressure: 12 },
      regionalKnowledgeLevel: 72,
      priorObservationCount: 2,
      priorIndependentContextCount: 2,
      priorEvidenceQuality: 0.6,
      priorQuestionIds: ["execution"],
      openQuestionIds: ["pressure"],
    });
    expect(snapshot.priorContextKeys).toHaveLength(2);
  });

  it("keeps youth sessions short while persisting contextual options", () => {
    const session = createSession({
      activityType: "schoolMatch",
      specialization: "youth",
      playerPool: [{
        playerId: CENTRE_BACK.playerId,
        name: CENTRE_BACK.name,
        position: CENTRE_BACK.position,
        naturalRole: CENTRE_BACK.naturalRole,
      }],
      targetPlayerId: CENTRE_BACK.playerId,
      seed: "short-contextual-session",
      week: 1,
      season: 1,
    }, createRNG("short-contextual-session"));

    expect(session.phases.length).toBeGreaterThanOrEqual(5);
    expect(session.phases.length).toBeLessThanOrEqual(8);
    expect(session.questionOptions).toHaveLength(6);
    expect(session.players[0].naturalRole).toBe("ballPlayingDefender");
  });

  it("changes the mix of observable moments with role and tactical context", () => {
    const defenderRng = createRNG("role-moment-stream");
    const strikerRng = createRNG("role-moment-stream");
    const defenderCounts = { technicalAction: 0, tacticalDecision: 0 };
    const strikerCounts = { technicalAction: 0, tacticalDecision: 0 };

    for (let index = 0; index < 1_500; index += 1) {
      const defenderMoment = selectMomentType(defenderRng, "youthTournament", CENTRE_BACK, PRESSING);
      const strikerMoment = selectMomentType(strikerRng, "youthTournament", STRIKER, PRESSING);
      if (defenderMoment === "technicalAction" || defenderMoment === "tacticalDecision") defenderCounts[defenderMoment] += 1;
      if (strikerMoment === "technicalAction" || strikerMoment === "tacticalDecision") strikerCounts[strikerMoment] += 1;
    }

    expect(defenderCounts.tacticalDecision).toBeGreaterThan(strikerCounts.tacticalDecision);
    expect(strikerCounts.technicalAction).toBeGreaterThan(defenderCounts.technicalAction);
  });
});

describe("observation signal outcomes", () => {
  it("can produce a clear cross-context lead from strong, well-framed evidence", () => {
    const result = resolveObservationSignalAssessment(signalSession("strong", 0.82));
    expect(result).toMatchObject({
      outcome: "clear",
      cueCount: 1,
      usableCueCount: 1,
      comparisonReady: true,
      contextChanged: true,
    });
  });

  it("preserves a weak lead without turning it into a conclusion", () => {
    const result = resolveObservationSignalAssessment(signalSession("usable", 0.42));
    expect(result.outcome).toBe("weak");
    expect(result.summary).toContain("too fragile");
  });

  it("allows the scout to record that a seemingly strong passage proved nothing", () => {
    const session = signalSession("strong", 0.82);
    const cueId = session.cueReadings[0].id;
    const result = resolveObservationSignalAssessment({
      ...session,
      evidenceDecisions: { [cueId]: { cueId, classification: "noConclusion" } },
    });
    expect(result.outcome).toBe("noSignal");
    expect(result.reasons).toContain("1 cue was deliberately left without a conclusion.");
  });
});
