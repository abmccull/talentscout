import { describe, expect, it, vi } from "vitest";
import type { GameState, NewGameConfig, Observation, StructuredReportInput } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { generatePlayer } from "@/engine/players/generation";
import { observePlayerLight } from "@/engine/scout/perception";
import { initializeFinances } from "@/engine/finance";
import { getFreshReportObservationIds } from "@/engine/reports/reportAccountability";
import { createReportActions } from "@/stores/actions/reportActions";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";
import { queueGameplayAutosave } from "@/stores/actions/persistGameplayAutosave";

vi.mock("@/stores/actions/persistGameplayAutosave", () => ({
  queueGameplayAutosave: vi.fn(), snapshotPersistedGameState: (state: GameState) => state,
}));

function setup() {
  const config: NewGameConfig = {
    scoutFirstName: "Test", scoutLastName: "Scout", scoutAge: 32, specialization: "youth",
    difficulty: "normal", worldSeed: "pass-submit", startingCountry: "england", selectedCountries: ["england"],
    skillAllocations: { technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1, tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1 },
  };
  const scout = { ...createScout(config, createRNG("pass-scout")), careerPath: "independent" as const };
  const player = generatePlayer(createRNG("pass-player"), { position: "CM", ageRange: [17, 17], abilityRange: [90, 90], nationality: "English", clubId: "", firstName: "Milo", lastName: "Vale" });
  const observation: Observation = { ...observePlayerLight(createRNG("pass-observation"), player, scout, "schoolMatch", []), week: 1, season: 1 };
  const finances = initializeFinances(scout, "independent", "normal");
  let store = {
    gameState: {
      seed: "pass-submit", currentWeek: 1, currentSeason: 1, difficulty: "normal", scout, finances,
      players: { [player.id]: player }, unsignedYouth: {}, retiredPlayers: {}, observations: { [observation.id]: observation },
      reports: {}, scoutingCases: {}, recommendationReviews: {}, playerMovementHistory: [], clubDecisions: {},
      discoveryRecords: [], clubResponses: [], systemFitCache: {}, predictions: [], inbox: [], clubs: {},
      youthRecruitmentBriefs: { "brief-a": { id: "brief-a", clubId: "club-a", status: "open" } },
      scoutingInfrastructure: { dataSubscription: "none", travelBudget: "economy", officeEquipment: "professional", investmentCosts: { weekly: 0, oneTime: 0 } },
      schedule: { activities: Array(7).fill(null) },
    },
    selectedPlayerId: player.id, currentScreen: "reportWriter", pendingListingReportId: null,
  } as unknown as GameStoreState;
  const get = (() => store) as GetState;
  const set = ((partial) => { store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) }; }) as SetState;
  const actions = createReportActions(get, set);
  const verdict = { verdict: "There is too little independent evidence to project confidently.", confidence: "low" as const, hypothesisIds: [], acknowledgedUncertainty: "Performance under pressure remains untested." };
  const input: StructuredReportInput = {
    briefId: "brief-a", intendedClubId: "club-a", intendedAudience: "academyDirector", recruitmentNeed: "A midfielder who can resist pressure",
    projectedRole: "boxToBox", recommendedAction: "pass", riskFactors: ["Limited context"], estimatedWeeklyWage: 200,
    decisionDeadlineWeek: 8, decisionDeadlineSeason: 1,
    categoryVerdicts: { potential: verdict, roleFit: verdict, characterRisk: verdict }, alternativePlayerIds: [],
  };
  return { get, set, actions, input, player, observation, scout, finances };
}

describe("Pass for now submission authority", () => {
  it("persists one private decision without earning reputation, XP, client credit, or booking a follow-up", () => {
    const { get, set, actions, input, player, scout, finances } = setup();
    set({ gameState: { ...get().gameState!, openingCase: { id: "opening-a", playerId: player.id, stage: "report" } as GameState["openingCase"] } });
    actions.submitReport("tablePound", "Not enough evidence to pursue this prospect now.", [], [], input);
    const after = get().gameState!;
    const report = Object.values(after.reports)[0];
    expect(report).toMatchObject({ recommendedAction: "pass", conviction: "note", reputationDelta: 0, decisionReceipt: { action: "pass" } });
    expect(after.scout.reputation).toBe(scout.reputation);
    expect(after.scout.reportsSubmitted).toBe(scout.reportsSubmitted);
    expect(after.scout.skillXp).toEqual(scout.skillXp);
    expect(after.finances).toEqual(finances);
    expect(after.discoveryRecords).toEqual([]);
    expect(after.schedule.activities.every((activity) => activity == null)).toBe(true);
    expect(get().pendingListingReportId).toBeNull();
    expect(after.openingCase?.stage).toBe("complete");
    expect(Object.values(after.recommendationReviews)).toHaveLength(2);
    expect(queueGameplayAutosave).toHaveBeenCalledWith(after, expect.any(Function));
    actions.submitReport("tablePound", "Not enough evidence to pursue this prospect now.", [], [], input);
    expect(Object.values(get().gameState!.reports)).toHaveLength(1);
    expect(Object.values(get().gameState!.recommendationReviews)).toHaveLength(2);
    expect(get().gameState!.inbox.filter((message) => message.id.startsWith("pass-filed"))).toHaveLength(1);
  });

  it("requires fresh evidence to reconsider, preserves the original receipt, and awards the first professional report once", () => {
    const { get, set, actions, input, player, observation, scout } = setup();
    actions.submitReport("note", "Pass for now.", [], [], input);
    const original = Object.values(get().gameState!.reports)[0];
    const receipt = structuredClone(original.decisionReceipt);
    const reconsidered = { ...input, recommendedAction: "inviteForTrial" as const };
    actions.submitReport("recommend", "New evidence supports a trial.", [], [], reconsidered);
    expect(Object.values(get().gameState!.reports)).toHaveLength(1);
    expect(get().gameState!.inbox.some((message) => message.title === "Report revision needs new evidence")).toBe(true);
    const nextObservation = { ...observation, id: "fresh-context-observation", week: 2, context: "trainingGround" as Observation["context"] };
    set({ gameState: { ...get().gameState!, currentWeek: 2, observations: { ...get().gameState!.observations, [nextObservation.id]: nextObservation } } });
    actions.submitReport("recommend", "New evidence supports a trial.", [], [], reconsidered);
    const after = get().gameState!;
    expect(Object.values(after.reports)).toHaveLength(2);
    expect(after.reports[original.id].decisionReceipt).toEqual(receipt);
    const revision = Object.values(after.reports).find((report) => report.id !== original.id)!;
    expect(revision).toMatchObject({ supersedesReportId: original.id, recommendedAction: "inviteForTrial", revision: 2 });
    expect(revision.evidenceObservationIds).toContain(nextObservation.id);
    expect(after.scoutingCases[revision.caseId!].status).toBe("reported");
    expect(after.scout.reportsSubmitted).toBe(scout.reportsSubmitted + 1);
    expect(after.reports[original.id].playerId).toBe(player.id);
    actions.submitReport("recommend", "New evidence supports a trial.", [], [], reconsidered);
    expect(get().gameState!.scout.reportsSubmitted).toBe(scout.reportsSubmitted + 1);
  });
});

describe("private decision cross-brief boundary", () => {
  it("requires new observation before reconsidering the same player under another brief", () => {
    const { get, set, actions, input, observation } = setup();
    actions.submitReport("note", "Pass for now.", [], [], input);
    const before = get().gameState!;
    expect(Object.values(before.reports)).toHaveLength(1);
    set({ gameState: { ...before, currentWeek: 2, youthRecruitmentBriefs: {
      ...before.youthRecruitmentBriefs,
      "brief-b": { ...before.youthRecruitmentBriefs["brief-a"], id: "brief-b" },
    } } });
    actions.submitReport("recommend", "The same evidence under another brief.", [], [],
      { ...input, briefId: "brief-b", recommendedAction: "inviteForTrial" });
    expect(Object.values(get().gameState!.reports)).toHaveLength(1);
    expect(get().gameState!.scout.reportsSubmitted).toBe(before.scout.reportsSubmitted);
    expect(get().gameState!.inbox.some((message) => message.title === "Reconsideration needs new evidence")).toBe(true);
    const original = Object.values(before.reports)[0];
    const receipt = structuredClone(original.decisionReceipt);
    const fresh = { ...observation, id: "new-brief-fresh-observation", week: 2 };
    set({ gameState: { ...get().gameState!, observations: { ...before.observations, [fresh.id]: fresh } } });
    actions.submitReport("recommend", "Fresh evidence under another brief.", [], [],
      { ...input, briefId: "brief-b", recommendedAction: "inviteForTrial" });
    expect(Object.values(get().gameState!.reports)).toHaveLength(2);
    expect(get().gameState!.scout.reportsSubmitted).toBe(before.scout.reportsSubmitted + 1);
    expect(get().gameState!.reports[original.id].decisionReceipt).toEqual(receipt);
  });

  it("uses immutable private receipts while preserving unrelated and legacy scopes", () => {
    const { get, actions, input, observation } = setup();
    actions.submitReport("note", "Pass for now.", [], [], input);
    const original = Object.values(get().gameState!.reports)[0];
    const edited = { ...original, evidenceObservationIds: [], recommendedAction: "inviteForTrial" as const };
    expect(getFreshReportObservationIds([observation], undefined, [edited])).toEqual([]);
    expect(getFreshReportObservationIds([observation], edited)).toEqual([]);
    expect(getFreshReportObservationIds([observation], undefined,
      [{ ...edited, scoutId: "another-scout" }])).toEqual([observation.id]);
    expect(getFreshReportObservationIds([observation], undefined,
      [{ ...edited, playerId: "another-player" }])).toEqual([observation.id]);
    expect(getFreshReportObservationIds([observation], undefined,
      [{ ...original, decisionReceipt: undefined }])).toEqual([observation.id]);
  });
});
