import { describe, expect, it, vi } from "vitest";
import type { GameState, NewGameConfig, Observation, StructuredReportInput } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { generatePlayer } from "@/engine/players/generation";
import { observePlayerLight } from "@/engine/scout/perception";
import { initializeFinances } from "@/engine/finance";
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

describe("public revision costs across private decisions", () => {
  it("keeps the last professional statement as the public-cost baseline without discarding private evidence linkage", () => {
    const { get, set, actions, input, observation } = setup();
    actions.submitReport("strongRecommend", "Professional recommendation A", [], [], { ...input, recommendedAction: "offerAcademyPlace" });
    const a = Object.values(get().gameState!.reports)[0];
    expect(a.decisionReceipt?.action).toBe("offerAcademyPlace");
    const afterA = get().gameState!.scout.reputation;
    const addObservation = (week: number) => {
      const fresh = { ...observation, id: `context-${week}`, week };
      set({ gameState: { ...get().gameState!, currentWeek: week, observations: { ...get().gameState!.observations, [fresh.id]: fresh } } });
    };
    addObservation(2);
    actions.submitReport("note", "Private pass B", [], [], input);
    const b = Object.values(get().gameState!.reports).find(report => report.id !== a.id)!;
    const receiptB = structuredClone(b.decisionReceipt);
    expect(b.decisionReceipt?.action).toBe("pass");
    expect(get().gameState!.scout.reputation).toBe(afterA);
    addObservation(3);
    actions.submitReport("recommend", "Changed professional recommendation C", [], [], { ...input, recommendedAction: "inviteForTrial" });
    const afterC = get().gameState!;
    const c = Object.values(afterC.reports).find(report => report.id !== a.id && report.id !== b.id)!;
    expect(c.supersedesReportId).toBe(b.id);
    expect(c.evidenceObservationIds).toContain("context-3");
    expect(afterC.reports[b.id].decisionReceipt).toEqual(receiptB);
    expect(c.reputationDelta).toBe(-3);
    expect(afterC.scout.reputation).toBe(afterA - 3);
  });

  it("charges no public revision cost when the first professional report follows only a private decision", () => {
    const { get, set, actions, input, observation } = setup();
    actions.submitReport("note", "Private first decision", [], [], input);
    const original = Object.values(get().gameState!.reports)[0];
    const fresh = { ...observation, id: "new-context", week: 2 };
    set({ gameState: { ...get().gameState!, currentWeek: 2, observations: { ...get().gameState!.observations, [fresh.id]: fresh } } });
    actions.submitReport("recommend", "First professional recommendation", [], [], { ...input, recommendedAction: "inviteForTrial" });
    const after = get().gameState!;
    const report = Object.values(after.reports).find(candidate => candidate.id !== original.id)!;
    expect(report.reputationDelta).toBeGreaterThanOrEqual(0);
    expect(after.inbox.some(message => message.title === "Public stance revised")).toBe(false);
    expect(after.scout.reportsSubmitted).toBe(1);
  });
});

