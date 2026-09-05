import { describe, expect, it, vi } from "vitest";
import type { Activity, GameState, InitialAssessmentInput, NewGameConfig, ScoutingEvidenceCard } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { generatePlayer } from "@/engine/players/generation";
import { observePlayerLight } from "@/engine/scout/perception";
import { getEvidenceClaimOptions, getEvidenceNextTestOptions, getEvidenceUnknownOptions } from "@/engine/scout/evidenceModel";
import { initializeFinances } from "@/engine/finance";
import { bookOpeningFollowUp, openingFollowUpDayIndex } from "@/engine/youth/openingFollowUp";
import { createReportActions } from "@/stores/actions/reportActions";
import { createObservationActions } from "@/stores/actions/observationActions";
import { getInteractiveActivityCompletionKey } from "@/lib/activityCompletion";
import { queueGameplayAutosave } from "@/stores/actions/persistGameplayAutosave";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

vi.mock("@/stores/actions/persistGameplayAutosave", () => ({
  queueGameplayAutosave: vi.fn(), snapshotPersistedGameState: (state: GameState) => state,
}));

function setup(unknownKind: "pressure" | "level" = "level", corroborate = false) {
  const config: NewGameConfig = {
    scoutFirstName: "Next", scoutLastName: "Test", scoutAge: 32, specialization: "youth",
    difficulty: "normal", worldSeed: "followup-choice", startingCountry: "england", selectedCountries: ["england"],
    skillAllocations: { technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1, tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1 },
  };
  const scout = { ...createScout(config, createRNG("followup-scout")), careerPath: "independent" as const };
  const player = generatePlayer(createRNG("followup-player"), { position: "CM", ageRange: [17, 17], abilityRange: [90, 90], nationality: "English", clubId: "", firstName: "Milo", lastName: "Vale" });
  const observation = { ...observePlayerLight(createRNG("followup-observation"), player, scout, "schoolMatch", []), week: 1, season: 1 };
  const card: ScoutingEvidenceCard = {
    id: "card-1", sessionId: "session-1", momentId: "moment-1", playerId: player.id,
    phaseIndex: 0, minute: 25, questionId: "execution", lens: "technical", clarity: "strong", score: 75,
    confidence: 70, confidenceBand: "working", direction: "positive", summary: "A clean first touch under pressure.",
    detail: "He opens his body before receiving and finds a forward pass.", suggestedClassifications: ["technicalExecution"],
    attributesHinted: ["firstTouch", "passing"], pressureContext: true, contextKey: "schoolMatch", countryId: "england",
    factors: { domainSkill: 8, judgment: 8, focus: 8, questionAlignment: 8, eventSignal: 8, regionalContext: 8, fatigue: 0, conditions: 0, boundedUncertainty: 0 },
    version: 1, sourceType: "liveObservation", classification: "technicalExecution", independenceKey: "session-1",
  };
  const unknown = getEvidenceUnknownOptions(card).find((option) => option.id.endsWith(`:${unknownKind}`))!;
  const nextTest = getEvidenceNextTestOptions(unknown)[corroborate ? 1 : 0];
  const input: InitialAssessmentInput = {
    evidenceCardId: card.id, claimOptionId: getEvidenceClaimOptions(card)[0].id,
    unknownOptionId: unknown.id, nextTestId: nextTest.id, confidence: "tentative", recommendation: "monitor",
  };
  let store = {
    gameState: {
      seed: "followup-choice", currentWeek: 1, currentSeason: 1, difficulty: "normal", scout,
      finances: initializeFinances(scout, "independent", "normal"),
      players: { [player.id]: player }, unsignedYouth: { "youth-1": { id: "youth-1", player, placed: false, retired: false, observations: 1 } },
      retiredPlayers: {}, observations: { [observation.id]: observation },
      reports: {}, scoutingCases: {}, recommendationReviews: {}, playerMovementHistory: [], clubDecisions: {},
      discoveryRecords: [], clubResponses: [], systemFitCache: {}, predictions: [], inbox: [], clubs: {},
      fixtures: {}, contacts: {}, subRegions: {}, youthTournaments: {}, youthRecruitmentBriefs: {},
      regionalKnowledge: {}, leagues: {}, countries: {},
      reflectionJournal: { "session-1": { sessionId: "session-1", scoutId: scout.id, playerIds: [player.id], week: 1, season: 1, hypotheses: [], evidenceCards: [card] } },
      openingCase: { id: "opening-1", playerId: player.id, youthId: "youth-1", stage: "report" },
      scoutingInfrastructure: { dataSubscription: "none", travelBudget: "economy", officeEquipment: "professional", investmentCosts: { weekly: 0, oneTime: 0 } },
      schedule: { week: 1, season: 1, activities: Array(7).fill(null), completed: false },
    },
    selectedPlayerId: player.id, currentScreen: "reportWriter", pendingListingReportId: null,
  } as unknown as GameStoreState;
  const get = (() => store) as GetState;
  const set = ((partial) => { store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) }; }) as SetState;
  const actions = createReportActions(get, set);
  const submit = () => actions.submitReport("note", "", [], [], undefined, input);
  return { get, set, submit, input, nextTest, player };
}

describe("authored opening follow-up choices", () => {
  it.each([
    { unknown: "pressure" as const, corroborate: false, type: "followUpSession", slots: 1, question: "pressure" },
    { unknown: "level" as const, corroborate: false, type: "youthTournament", slots: 2, question: "execution" },
    { unknown: "level" as const, corroborate: true, type: "parentCoachMeeting", slots: 1, question: "execution" },
  ])("files and autosaves $type with its actual duration and authored question", ({ unknown, corroborate, type, slots, question }) => {
    const { get, submit, player, nextTest } = setup(unknown, corroborate);
    submit();
    const filed = get().gameState!;
    const report = Object.values(filed.reports)[0];
    expect(report?.evidenceAssessment?.nextTest).toEqual(nextTest);
    expect(filed.schedule.activities[0]).toMatchObject({
      type, slots, targetId: player.id, scoutingQuestionId: question, scoutingQuestionIds: [question],
      instanceId: "opening-followup-opening-1",
    });
    expect(filed.schedule.activities[0]?.description).toContain(nextTest.contextRequirement);
    expect(filed.schedule.activities[0]?.description).toContain(nextTest.description);
    expect(filed.schedule.activities.filter(Boolean)).toHaveLength(slots);
    if (slots === 2) expect(filed.schedule.activities[1]).toBe(filed.schedule.activities[0]);
    expect(openingFollowUpDayIndex(filed)).toBe(0);
    expect(get().currentScreen).toBe("calendar");
    expect(queueGameplayAutosave).toHaveBeenCalledWith(filed, expect.any(Function));
    expect(bookOpeningFollowUp(filed)).toBe(filed);
    submit();
    expect(get().gameState!.schedule).toEqual(filed.schedule);
    expect(Object.keys(get().gameState!.reports)).toHaveLength(1);
  });

  it("searches past an isolated free day for a complete tournament block without overwriting commitments", () => {
    const { get, set, submit } = setup();
    const rest: Activity = { type: "rest", slots: 1, description: "Prior commitment" };
    const activities = [null, rest, null, null, rest, null, rest];
    set({ gameState: { ...get().gameState!, schedule: { ...get().gameState!.schedule, activities } } });
    submit();
    const filed = get().gameState!;
    expect(openingFollowUpDayIndex(filed)).toBe(2);
    expect(filed.schedule.activities[0]).toBeNull();
    expect(filed.schedule.activities[2]?.type).toBe("youthTournament");
    expect(filed.schedule.activities[3]).toBe(filed.schedule.activities[2]);
    for (const index of [1, 4, 6]) expect(filed.schedule.activities[index]).toBe(rest);
    expect(activities[2]).toBeNull();
  });

  it.each(["full", "fragmented", "completed", "exhausted"])("files safely when the calendar is %s without substituting a shorter test", (condition) => {
    const { get, set, submit, nextTest } = setup();
    const rest: Activity = { type: "rest", slots: 1, description: "Prior commitment" };
    const state = get().gameState!;
    const schedule = { ...state.schedule,
      activities: Array.from({ length: 7 }, (_, index) => condition === "full" || (condition === "fragmented" && index % 2 === 1) ? rest : null),
      completed: condition === "completed",
    };
    set({ gameState: { ...state, schedule, scout: { ...state.scout, fatigue: condition === "exhausted" ? 100 : 0 } } });
    submit();
    const filed = get().gameState!;
    expect(Object.values(filed.reports)[0]?.evidenceAssessment?.nextTest).toEqual(nextTest);
    expect(filed.schedule).toBe(schedule);
    expect(openingFollowUpDayIndex(filed)).toBe(-1);
    expect(bookOpeningFollowUp(filed)).toBe(filed);
  });

  it("never books a private pass even when the helper is called directly", () => {
    const { get, submit, input } = setup();
    input.recommendation = "pass";
    submit();
    const filed = get().gameState!;
    expect(Object.values(filed.reports)[0]?.recommendedAction).toBe("pass");
    expect(filed.schedule.activities.every((activity) => activity === null)).toBe(true);
    expect(bookOpeningFollowUp(filed)).toBe(filed);
    expect(get().currentScreen).toBe("reportHistory");
  });

  it.each([false, true])("launches the authored question from a real day completion key (independent view: %s)", (corroborate) => {
    const { get, set, submit, player } = setup("level", corroborate);
    submit();
    const activity = get().gameState!.schedule.activities[0]!;
    // A deliberately different open question makes fallback-only behavior fail.
    // Both the tournament's second day and a meeting use the real UI key shape.
    activity.scoutingQuestionId = "movement";
    activity.scoutingQuestionIds = ["movement"];
    const dayIndex = activity.slots - 1;
    const completionKey = getInteractiveActivityCompletionKey(activity, dayIndex);
    createObservationActions(get, set).startObservationSession(
      activity.type,
      [{ playerId: player.id, name: `${player.firstName} ${player.lastName}`, position: player.position }],
      player.id,
      { activityInstanceId: completionKey, returnScreen: "weekSimulation" },
    );
    const session = get().activeSession;
    expect(session?.activityInstanceId).toBe(completionKey);
    expect(session?.scoutingQuestionId).toBe("movement");
    expect(session?.observerContext?.openQuestionIds).toContain("movement");
    expect(session?.mode).toBe(corroborate ? "investigation" : "fullObservation");
    expect(session?.players.some((entry) => entry.playerId === player.id)).toBe(true);
    expect(get().currentScreen).toBe("observation");
  });

  it("does not schedule an unavailable authored activity or an unavailable youth", () => {
    const { get, submit } = setup();
    submit();
    const filed = get().gameState!;
    const report = Object.values(filed.reports)[0];
    const unavailable = { ...filed,
      schedule: { ...filed.schedule, activities: Array(7).fill(null) },
      reports: { [report.id]: { ...report, evidenceAssessment: { ...report.evidenceAssessment!, nextTest: { ...report.evidenceAssessment!.nextTest, activityType: "academyTrialDay" as const } } } },
    };
    expect(bookOpeningFollowUp(unavailable)).toBe(unavailable);
    for (const status of ["placed", "retired"] as const) {
      const unavailableYouth = { ...filed, schedule: unavailable.schedule,
        unsignedYouth: { "youth-1": { ...filed.unsignedYouth["youth-1"], [status]: true } },
      };
      expect(bookOpeningFollowUp(unavailableYouth)).toBe(unavailableYouth);
    }
  });
});
