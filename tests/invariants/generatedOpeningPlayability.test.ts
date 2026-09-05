import { afterEach, describe, expect, it, vi } from "vitest";
import type { InitialAssessmentInput } from "@/engine/core/types";
import {
  SCOUTING_QUESTIONS,
  buildInitialAssessment,
  buildSessionEvidenceCards,
  getEvidenceClaimOptions,
  getEvidenceNextTestOptions,
  getEvidenceUnknownOptions,
} from "@/engine/scout/evidenceModel";
import { useGameStore } from "@/stores/gameStore";
import { useTutorialStore } from "@/stores/tutorialStore";
import { resetGameplayAutosaveWatermark } from "@/stores/actions/persistGameplayAutosave";
import { buildReportWriterStatus } from "@/components/game/reportWriterStatus";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: { toArray: async () => [] },
    leaderboard: { put: async () => undefined, clear: async () => undefined },
  },
}));

afterEach(() => {
  resetGameplayAutosaveWatermark();
  useGameStore.setState({ gameState: null, activeSession: null, lastReflectionResult: null });
});

describe("generated opening playability", () => {
  it("lets a focused glimpse become a tentative private pass when halftime attention is not renewed", async () => {
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Opening", scoutLastName: "Scout", scoutAge: 24,
      specialization: "youth", difficulty: "normal", worldSeed: "opening-identity-0",
      selectedCountries: ["england"], startingCountry: "england", nationality: "English",
      skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
      originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"],
      openingMode: "tutorial", guideFirstHour: true,
    });
    const opening = useGameStore.getState().gameState!.openingCase!;
    const setup = useGameStore.getState().activeSession!;
    const question = SCOUTING_QUESTIONS.find((entry) => entry.id === setup.scoutingQuestionId)!;
    useGameStore.getState().beginSession();
    for (let step = 0; step < setup.phases.length; step += 1) {
      let session = useGameStore.getState().activeSession!;
      const phase = session.phases[session.currentPhaseIndex];
      if (step === 0) useGameStore.getState().allocateSessionFocus(opening.playerId, question.lens);
      if (phase.isHalfTime) useGameStore.getState().setSessionHalftimeApproach("challenge");
      session = useGameStore.getState().activeSession!;
      const moment = phase.moments.find((entry) => entry.playerId === opening.playerId)!;
      const cue = session.cueReadings!.find((entry) => entry.momentId === moment.id)!;
      expect(["glimpse", "missed"]).toContain(cue.clarity);
      expect(session.players.find((entry) => entry.playerId === opening.playerId)?.isFocused).toBe(step === 0);
      useGameStore.getState().flagSessionMoment(moment.id, "needs_more_data");
      useGameStore.getState().advanceSessionPhase();
    }
    const reflection = useGameStore.getState().activeSession!;
    expect(reflection.state).toBe("reflection");
    for (const card of buildSessionEvidenceCards(reflection)) {
      useGameStore.getState().classifySessionEvidence(card.id, card.classification);
    }
    useGameStore.getState().endObservationSession();
    expect(useGameStore.getState().activeSession === null).toBe(true);
    const completed = useGameStore.getState().gameState!;
    const observations = Object.values(completed.observations).filter((entry) => entry.playerId === opening.playerId);
    expect(observations).toHaveLength(1);
    expect(observations[0].attributeReadings).toEqual([]);
    expect(observations[0].abilityReading).toBeUndefined();
    expect(observations[0].revealedPersonalityTrait).toBeUndefined();
    expect(observations[0].updatedPersonalityProfile).toBeUndefined();
    const cards = Object.values(completed.reflectionJournal).flatMap((entry) => entry.evidenceCards ?? [])
      .filter((card) => card.playerId === opening.playerId);
    expect(cards.every((card) => card.attributesHinted.length === 0)).toBe(true);
    const card = cards[0];
    const unknown = getEvidenceUnknownOptions(card)[0];
    const assessment: InitialAssessmentInput = {
      evidenceCardId: card.id, claimOptionId: getEvidenceClaimOptions(card)[0].id,
      unknownOptionId: unknown.id, nextTestId: getEvidenceNextTestOptions(unknown)[0].id,
      confidence: "tentative", recommendation: "pass",
    };
    const result = buildInitialAssessment(assessment, cards);
    expect(result.valid).toBe(true);
    expect(result.assessment?.claims[0].support).toBe("withheld");
    expect(buildReportWriterStatus({
      mode: "opening", hasObservations: observations.length > 0, hasFreshEvidence: observations.length > 0,
      hasSummary: Boolean(result.assessment?.generatedSummary), initialAssessmentReady: result.valid, openingDecisionCount: 0,
    }).canSubmit).toBe(true);
    useGameStore.getState().resolveOpeningDiscoveryChoice("protect");
    const beforeFiling = useGameStore.getState().gameState!;
    useGameStore.getState().submitReport("note", "", [], [], undefined, assessment);
    const afterFiling = useGameStore.getState().gameState!;
    const reports = Object.values(afterFiling.reports).filter((report) => report.playerId === opening.playerId);
    expect(reports).toHaveLength(1);
    expect(reports[0].recommendedAction).toBe("pass");
    expect(reports[0].attributeAssessments).toEqual([]);
    expect(reports[0].perceivedCAStars).toBeUndefined();
    expect(reports[0].perceivedPARange).toBeUndefined();
    expect(afterFiling.scout.reputation).toBe(beforeFiling.scout.reputation);
    expect(afterFiling.scout.skills).toEqual(beforeFiling.scout.skills);
    expect(afterFiling.scout.skillXp).toEqual(beforeFiling.scout.skillXp);
    expect(useGameStore.getState().pendingListingReportId).toBeNull();
    expect(afterFiling.openingCase?.stage).toBe("complete");
    expect(useTutorialStore.getState().currentGuidedTask).toBe("advancedWeek");
    useGameStore.getState().setScreen("calendar");
    expect(useGameStore.getState().currentScreen).toBe("calendar");
    useGameStore.getState().submitReport("note", "", [], [], undefined, assessment);
    expect(Object.values(useGameStore.getState().gameState!.reports).filter((report) => report.playerId === opening.playerId)).toHaveLength(1);
  }, 30_000);

  it.each(Array.from({ length: 20 }, (_, index) => `opening-identity-${index}`))(
    "%s preserves honest evidence and reaches an initial report through real actions",
    async (worldSeed) => {
      await useGameStore.getState().startNewGame({
        scoutFirstName: "Opening", scoutLastName: "Scout", scoutAge: 24,
        specialization: "youth", difficulty: "normal", worldSeed,
        selectedCountries: ["england"], startingCountry: "england", nationality: "English",
        skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
        originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"],
        openingMode: "tutorial", guideFirstHour: true,
      });
      const opening = useGameStore.getState().gameState!.openingCase!;
      const setup = useGameStore.getState().activeSession!;
      expect(opening.stage).toBe("observation");
      expect(setup.mode).toBe("fullObservation");
      const moments = setup.phases.flatMap((phase) => phase.moments);
      expect(new Set(moments.map((moment) => moment.id)).size).toBe(moments.length);
      const question = SCOUTING_QUESTIONS.find((entry) => entry.id === setup.scoutingQuestionId)!;
      expect(question).toBeDefined();

      // Choose from the offered scouting question, never the player's hidden ability
      // or the quality of a future generated passage.
      useGameStore.getState().beginSession();
      const trace: unknown[] = [];
      let halftimeRefocused = false;
      for (let step = 0; step < setup.phases.length; step += 1) {
        let session = useGameStore.getState().activeSession!;
        expect(session.state).toBe("active");
        const phase = session.phases[session.currentPhaseIndex];
        if (phase.isHalfTime) {
          expect(session.players.find((entry) => entry.playerId === opening.playerId)?.isFocused).toBe(false);
          useGameStore.getState().setSessionHalftimeApproach("challenge");
          halftimeRefocused = true;
        }
        if (!session.players.find((entry) => entry.playerId === opening.playerId)?.isFocused) {
          useGameStore.getState().allocateSessionFocus(opening.playerId, question.lens);
        }
        session = useGameStore.getState().activeSession!;
        const moment = phase.moments.find((entry) => entry.playerId === opening.playerId)!;
        expect(moment).toBeDefined();
        const cue = session.cueReadings?.find((entry) => entry.momentId === moment.id)!;
        expect(cue).toBeDefined();
        trace.push({ phase: phase.index, type: moment.momentType, quality: moment.quality, clarity: cue.clarity, direction: cue.direction });
        useGameStore.getState().flagSessionMoment(moment.id,
          cue.direction === "negative" ? "concerning" : cue.direction === "positive" ? "promising" : "needs_more_data");
        expect(useGameStore.getState().activeSession!.flaggedMoments.some((flag) => flag.moment.id === moment.id)).toBe(true);
        useGameStore.getState().advanceSessionPhase();
        const after = useGameStore.getState().activeSession!;
        expect(after.state === "reflection" || after.currentPhaseIndex > session.currentPhaseIndex,
          `${worldSeed}: phase did not advance; ${JSON.stringify(trace)}`).toBe(true);
      }
      expect(halftimeRefocused).toBe(true);
      const reflection = useGameStore.getState().activeSession!;
      expect(reflection.state).toBe("reflection");
      for (const card of buildSessionEvidenceCards(reflection)) {
        useGameStore.getState().classifySessionEvidence(card.id, card.classification);
      }
      useGameStore.getState().endObservationSession();
      expect(useGameStore.getState().activeSession === null, JSON.stringify(trace)).toBe(true);
      const completed = useGameStore.getState().gameState!;
      const observations = Object.values(completed.observations).filter((entry) => entry.playerId === opening.playerId);
      const cards = Object.values(completed.reflectionJournal).flatMap((entry) => entry.evidenceCards ?? [])
        .filter((card) => card.playerId === opening.playerId);
      const diagnostics = `${worldSeed}: observations=${observations.length}, cards=${cards.length}, stage=${completed.openingCase?.stage}; ${JSON.stringify(trace)}`;
      // These are the real profile/report gates. A weak opening must either satisfy
      // them honestly or gain an explicit recovery path instead of forced signal.
      expect(observations.length, diagnostics).toBeGreaterThan(0);
      expect(cards.length, diagnostics).toBeGreaterThan(0);
      expect(completed.openingCase?.stage).toBe("decision");
      useGameStore.getState().resolveOpeningDiscoveryChoice("verify");
      expect(useGameStore.getState().currentScreen).toBe("reportWriter");

      const card = cards.find((entry) => entry.clarity !== "glimpse" && entry.clarity !== "missed") ?? cards[0];
      const unknown = getEvidenceUnknownOptions(card)[0];
      const assessment: InitialAssessmentInput = {
        evidenceCardId: card.id,
        claimOptionId: getEvidenceClaimOptions(card)[0].id,
        unknownOptionId: unknown.id,
        nextTestId: getEvidenceNextTestOptions(unknown)[0].id,
        confidence: "tentative", recommendation: "monitor",
      };
      expect(buildInitialAssessment(assessment, cards).valid, diagnostics).toBe(true);
      useGameStore.getState().submitReport("note", "", [], [], undefined, assessment);
      const reports = Object.values(useGameStore.getState().gameState!.reports)
        .filter((report) => report.playerId === opening.playerId);
      expect(reports, diagnostics).toHaveLength(1);
    },
    30_000,
  );
});
