import { describe, expect, it } from "vitest";
import type {
  ConsultingContract,
  FinancialRecord,
  GameState,
  Player,
  StaffScoutingWorkProduct,
} from "@/engine/core/types";
import { createFinanceActions } from "@/stores/actions/financeActions";
import type { GameStoreState } from "@/stores/gameStoreTypes";
import type { GetState, SetState } from "@/stores/actions/types";

function playerFixture(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    firstName: "Mika",
    lastName: "Rowe",
    age: 18,
    dateOfBirth: { day: 1, month: 1, year: 2008 },
    nationality: "English",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    clubId: "club-origin",
    contractClubId: "club-origin",
    contractExpiry: 3,
    wage: 500,
    marketValue: 125_000,
    attributes: {} as Player["attributes"],
    currentAbility: 85,
    potentialAbility: 130,
    developmentProfile: "steadyGrower",
    wonderkidTier: "qualityPro",
    form: 0,
    morale: 7,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
    ...overrides,
  };
}

function staffWorkFixture(
  overrides: Partial<StaffScoutingWorkProduct> = {},
): StaffScoutingWorkProduct {
  return {
    id: "staff-work:employee-1:player-1:s1w2",
    playerId: "player-1",
    employeeId: "employee-1",
    employeeName: "Taylor Analyst",
    clientClubId: "club-client",
    createdWeek: 2,
    createdSeason: 1,
    status: "awaitingReview",
    qualityScore: 60,
    signals: [],
    limitation: "Staff lead only.",
    suggestedConviction: "investigate",
    ...overrides,
  };
}

function consultingFixture(
  overrides: Partial<ConsultingContract> = {},
): ConsultingContract {
  return {
    id: "consult-1",
    clubId: "club-client",
    type: "youthAudit",
    fee: 7_500,
    deadline: 4,
    deadlineSeason: 1,
    status: "active",
    deliverables: [
      { type: "reports", description: "Reports", required: 2, delivered: 1 },
      { type: "analysis", description: "Analysis", required: 1, delivered: 0 },
      { type: "presentation", description: "Presentation", required: 1, delivered: 0 },
    ],
    offeredWeek: 1,
    offeredSeason: 1,
    deliveredReportIds: [],
    ...overrides,
  };
}

function financesFixture(
  overrides: Partial<FinancialRecord> = {},
): FinancialRecord {
  return {
    staffWorkProducts: [],
    retainerContracts: [],
    consultingContracts: [],
    transactions: [],
    employees: [],
    reportListings: [],
    clientRelationships: [],
    office: {
      tier: "home",
      monthlyCost: 0,
      qualityBonus: 0,
      maxEmployees: 0,
    },
    ...overrides,
  } as FinancialRecord;
}

function gameStateFixture(
  overrides: Partial<GameState> = {},
): GameState {
  const player = playerFixture();
  return {
    seed: "staff-work-review-actions",
    currentWeek: 4,
    currentSeason: 1,
    fixtures: {},
    players: { [player.id]: player },
    reports: {},
    inbox: [],
    watchlist: [],
    scout: {
      id: "scout-1",
      fatigue: 20,
      reportsSubmitted: 5,
      careerPath: "independent",
    } as GameState["scout"],
    finances: financesFixture({
      staffWorkProducts: [staffWorkFixture()],
      consultingContracts: [consultingFixture()],
    }),
    ...overrides,
  } as GameState;
}

function createStoreHarness(initialState: GameState) {
  let store = { gameState: initialState } as unknown as GameStoreState;
  const get: GetState = () => store;
  const set: SetState = (partial) => {
    const update = typeof partial === "function" ? partial(store) : partial;
    store = { ...store, ...update };
  };
  return {
    get,
    set,
    read: () => store.gameState as GameState,
  };
}

describe("staff work review actions", () => {
  it("uses signed-off quality for client delivery and preserves personal report metrics", () => {
    const harness = createStoreHarness(gameStateFixture());
    const actions = createFinanceActions(harness.get, harness.set);

    actions.approveStaffWorkProduct("staff-work:employee-1:player-1:s1w2");

    const state = harness.read();
    const stored = state.finances!.staffWorkProducts[0];
    const consulting = state.finances!.consultingContracts[0];

    expect(stored).toMatchObject({
      status: "approved",
      reviewPriority: "critical",
      reviewDebtPenalty: 12,
      signedOffQualityScore: 48,
      reviewerId: "scout-1",
      reviewedWeek: 4,
      reviewedSeason: 1,
    });
    expect(consulting.deliveredReportIds).toEqual([]);
    expect(state.scout.reportsSubmitted).toBe(5);
    expect(Object.keys(state.reports)).toHaveLength(0);
    expect(state.watchlist).toEqual(["player-1"]);
    expect(state.inbox.at(-1)?.body).toContain("48/100");
  });

  it("delivers an eligible lead exactly once even if approval is replayed", () => {
    const harness = createStoreHarness(gameStateFixture({
      currentWeek: 2,
      finances: financesFixture({
        staffWorkProducts: [staffWorkFixture({
          id: "staff-work:employee-1:player-1:s1w2-clean",
          createdWeek: 2,
          qualityScore: 70,
        })],
        consultingContracts: [consultingFixture({
          deadline: 5,
          deliveredReportIds: [],
        })],
      }),
    }));
    const actions = createFinanceActions(harness.get, harness.set);

    actions.approveStaffWorkProduct("staff-work:employee-1:player-1:s1w2-clean");
    actions.approveStaffWorkProduct("staff-work:employee-1:player-1:s1w2-clean");

    const state = harness.read();
    const stored = state.finances!.staffWorkProducts[0];
    const consulting = state.finances!.consultingContracts[0];

    expect(stored).toMatchObject({
      status: "delivered",
      signedOffQualityScore: 70,
      reviewDebtPenalty: 0,
    });
    expect(consulting.deliveredReportIds).toEqual(["staff-work:employee-1:player-1:s1w2-clean"]);
    expect(state.inbox.filter((message) => message.id === "staff-review-approved:staff-work:employee-1:player-1:s1w2-clean")).toHaveLength(1);
    expect(state.scout.reportsSubmitted).toBe(5);
  });
});
