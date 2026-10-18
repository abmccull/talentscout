import { beforeAll, describe, expect, it, vi } from "vitest";
import type { GameState, LoanDeal, Player } from "@/engine/core/types";
import { advanceWeek, processWeeklyTick } from "@/engine/core/gameLoop";
import { getSeasonLength } from "@/engine/core/gameDate";
import { processContractExpiries } from "@/engine/freeAgents/expiry";
import { expandLoanDeal } from "@/engine/finance/terminalRecordArchive";
import { expandPlayerMovementHistory } from "@/engine/world/movementRowsArchive";
import { createRNG } from "@/engine/rng";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));
vi.mock("@/lib/db", () => ({ AUTOSAVE_SLOT: 0, migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: { mods: { toArray: async () => [] }, leaderboard: { put: async () => undefined, clear: async () => undefined } },
}));

let generated: GameState;
let parentId: string;
let borrowerId: string;
const subjectId = "settled-release-subject";
const keeperId = "settled-renewal-subject";
beforeAll(async () => {
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({ scoutFirstName: "Settled", scoutLastName: "Publication", scoutAge: 28,
    specialization: "data", difficulty: "normal", worldSeed: "settled-release-publication-regression",
    selectedCountries: ["england"], startingCountry: "england", nationality: "English",
    skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
    originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"],
  });
  generated = useGameStore.getState().gameState!;
  [parentId, borrowerId] = Object.values(generated.clubs)
    .filter(club => generated.leagues[club.leagueId]?.country === "England").slice(0, 2).map(club => club.id);
}, 60_000);

function rng(label: string) {
  const result = createRNG(`settled-publication-${label}`); result.chance = () => true; return result;
}

function world(): GameState {
  const state = structuredClone(generated);
  const template = Object.values(state.players)[0];
  for (const [id, player] of Object.entries(state.players)) {
    const owner = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    if ([parentId, borrowerId].includes(owner)) delete state.players[id];
  }
  for (const clubId of [parentId, borrowerId]) {
    const club = state.clubs[clubId];
    club.playerIds = []; club.academyPlayerIds = []; club.loanedInPlayerIds = []; club.loanedOutPlayerIds = [];
    club.financialObligations = []; club.budget = 100_000; club.weeklyWageBudget = 100_000;
    club.reputation = 13; club.youthAcademyRating = 1;
    for (let index = 0; index < 11; index++) {
      const id = `publication-cover-${clubId}-${index}`;
      state.players[id] = { ...template, id, clubId, contractClubId: clubId, onLoan: undefined,
        loanParentClubId: undefined, contractExpiry: 5, age: 24, wage: 0, morale: 7,
        position: index === 0 ? "GK" : "CM", currentAbility: 40, potentialAbility: 40 };
      club.playerIds.push(id);
    }
  }
  state.activeLoans = []; state.loanHistory = []; state.playerMovementHistory = [];
  state.freeAgentPool = { agents: [], lastRefreshSeason: 1, totalReleasedThisSeason: 7,
    totalSignedThisSeason: 0, totalRetiredThisSeason: 0 };
  state.currentSeason = 1; state.currentWeek = getSeasonLength(state.fixtures, 1);
  for (const fixture of Object.values(state.fixtures)) fixture.played = true;
  state.scout.countryReputations.england = { ...state.scout.countryReputations.england, familiarity: 100 };
  state.inbox = [{ id: "publication-original", type: "event", title: "Original notice", body: "Preserve this exact notice",
    read: true, actionRequired: false, week: 1, season: 1 }];
  return state;
}

function addSubject(state: GameState, owner: string, registered: string, expiry = 1, wage = 500, position: Player["position"] = "CM") {
  const template = Object.values(state.players)[0];
  state.players[subjectId] = { ...template, id: subjectId, firstName: "Publication", lastName: "Subject",
    clubId: registered, contractClubId: owner, contractExpiry: expiry, wage, position, age: 24,
    currentAbility: 70, potentialAbility: 70, morale: 7, onLoan: owner !== registered || undefined,
    loanParentClubId: owner !== registered ? owner : undefined };
  state.clubs[registered].playerIds.push(subjectId);
}

function addLoan(state: GameState, wageContribution = 50) {
  const deal: LoanDeal = { id: "publication-loan", playerId: subjectId, parentClubId: parentId, loanClubId: borrowerId,
    startWeek: 1, startSeason: 1, endWeek: state.currentWeek, endSeason: 1, loanFee: 0, wageContribution,
    buyOptionFee: 1_000, recallClause: false, status: "active",
    performanceRecord: { appearances: 30, goals: 0, assists: 0, avgRating: 8,
      developmentDelta: 1, parentClubSatisfaction: 50, loanClubSatisfaction: 100 } };
  state.activeLoans = [deal]; state.clubs[parentId].loanedOutPlayerIds = [subjectId];
  state.clubs[borrowerId].loanedInPlayerIds = [subjectId];
  state.clubs[borrowerId].financialObligations = [{ id: "publication-contribution", type: "loanWageContribution",
    playerId: subjectId, creditorClubId: parentId, amount: state.players[subjectId].wage * wageContribution / 100,
    weeklyAmount: state.players[subjectId].wage * wageContribution / 100, remainingWeeks: 1,
    createdWeek: 1, createdSeason: 1, status: "active" }];
}

function run(state: GameState, label: string) {
  const before = JSON.stringify(state);
  const tick = processWeeklyTick(state, rng(label));
  const advanced = advanceWeek(state, tick);
  expect(JSON.stringify(state)).toBe(before);
  expect(advanced.inbox[0]).toEqual(state.inbox[0]);
  const saved = JSON.parse(JSON.stringify(advanced)) as GameState;
  expect(saved.inbox).toEqual(advanced.inbox);
  expect(saved.freeAgentPool).toEqual(advanced.freeAgentPool);
  console.info(JSON.stringify({ publicationCase: label, plannedRelease: tick.contractExpiryResult?.releasedPlayers
    .some(agent => agent.playerId === subjectId), loanOutcome: tick.loanReturns?.find(deal => deal.playerId === subjectId)?.outcome,
    subjectMoves: moves(advanced).map(event => event.type), borrowerBudget: advanced.clubs[borrowerId].budget,
    borrowerWageBudget: advanced.clubs[borrowerId].weeklyWageBudget }));
  return { tick, advanced, saved };
}

const stories = (state: GameState, prefix: string, id = subjectId) => state.inbox
  .filter(message => message.id.startsWith(prefix) && (message.relatedId === id || message.title.includes("Publication Subject")));
const moves = (state: GameState, id = subjectId) => expandPlayerMovementHistory(state.playerMovementHistory ?? [])
  .filter(event => event.playerId === id);

describe("release feedback follows actual public weekly settlement", () => {
  it("settles an overdue unaffordable loan through the public weekly loop without buying the player", () => {
    const state = world(); state.currentWeek = 4;
    addSubject(state, parentId, borrowerId, 5); addLoan(state);
    state.activeLoans![0].endWeek = 3;
    state.clubs[borrowerId].budget = 0;
    const { tick, advanced } = run(state, "overdue-unaffordable-return");
    expect(tick.loanReturns?.map(deal => deal.id)).toContain("publication-loan");
    expect(moves(advanced).map(event => event.type)).toEqual(["loanReturn"]);
    expect(advanced.activeLoans!.some(deal => deal.id === "publication-loan")).toBe(false);
    expect(advanced.loanHistory!.map(deal => expandLoanDeal(deal)).find(deal => deal.id === "publication-loan")!.outcome).not.toBe("buy-option-exercised");
    expect(advanced.players[subjectId].contractClubId).toBe(parentId);
    expect(advanced.clubs[borrowerId].budget).toBeLessThanOrEqual(0);
  }, 60_000);
  it("closes a retiring loanee's recommendation without publishing a purchase reward", () => {
    const state = world(); addSubject(state, parentId, borrowerId, 5); addLoan(state);
    state.players[subjectId].age = 40;
    state.loanRecommendations = [{ id: "terminal-rec", loanDealId: "publication-loan", scoutId: state.scout.id,
      playerId: subjectId, status: "accepted", reputationApplied: false }] as GameState["loanRecommendations"];
    const { advanced } = run(state, "terminal-recommendation");
    expect(moves(advanced).map(event => event.type)).toEqual(["retirement"]);
    expect(advanced.loanRecommendations!.find(rec => rec.id === "terminal-rec")).toMatchObject({
      status: "completed", outcome: "terminated", reputationApplied: true,
    });
    expect(stories(advanced, "loan-closure-")).toEqual([]);
  }, 60_000);
  it("suppresses a former parent's release story when a real buy option wins", () => {
    const state = world(); addSubject(state, parentId, borrowerId); addLoan(state);
    state.clubs[parentId].weeklyWageBudget = 1;
    const { tick, advanced } = run(state, "buy-wins-release");
    expect(tick.contractExpiryResult?.releasedPlayers.map(agent => agent.playerId)).toContain(subjectId);
    expect(tick.loanReturns?.find(deal => deal.playerId === subjectId)?.outcome).toBe("buy-option-exercised");
    expect(moves(advanced).map(event => event.type)).toEqual(["loanBuyOption"]);
    expect(advanced.players[subjectId].contractClubId).toBe(borrowerId);
    expect(advanced.freeAgentPool.agents.map(agent => agent.playerId)).not.toContain(subjectId);
    expect(stories(advanced, "fa_release")).toEqual([]);
  }, 60_000);
  it("suppresses discovery of a prospective free agent whose buy option wins", () => {
    const state = world(); addSubject(state, parentId, borrowerId); addLoan(state);
    state.clubs[parentId].weeklyWageBudget = 1;
    const { tick, advanced } = run(state, "buy-wins-discovery");
    expect(tick.newMessages.some(message => message.id.startsWith("fa_discover") && message.relatedId === subjectId)).toBe(true);
    expect(moves(advanced).map(event => event.type)).toEqual(["loanBuyOption"]);
    expect(stories(advanced, "fa_discover")).toEqual([]);
  }, 60_000);
  it("publishes one keyed truthful release after a financially declined buy returns the player", () => {
    const state = world(); addSubject(state, parentId, borrowerId); addLoan(state);
    state.clubs[parentId].weeklyWageBudget = 1; state.clubs[borrowerId].weeklyWageBudget = 1;
    const { advanced } = run(state, "buy-declines");
    expect(moves(advanced).map(event => event.type)).toEqual(["loanReturn", "release"]);
    expect(advanced.players[subjectId]).toMatchObject({ clubId: "", contractExpiry: 0, wage: 0 });
    expect(stories(advanced, "fa_release")).toHaveLength(1);
    expect(stories(advanced, "fa_release")[0]).toMatchObject({ relatedId: subjectId, relatedEntityType: "player" });
    expect(stories(advanced, "fa_discover")).toHaveLength(1);
    expect(advanced.loanHistory!.map(deal => expandLoanDeal(deal)).filter(deal => deal!.id === "publication-loan")).toHaveLength(1);
    expect(advanced.freeAgentPool.agents.filter(agent => agent.playerId === subjectId)).toHaveLength(1);
    expect(advanced.freeAgentPool.totalReleasedThisSeason).toBe(0);
  }, 60_000);
  it("publishes keyed truth for an ordinary actually expired contract", () => {
    const state = world(); addSubject(state, parentId, parentId);
    state.clubs[parentId].weeklyWageBudget = 1;
    const { advanced } = run(state, "ordinary-release");
    expect(moves(advanced).map(event => event.type)).toEqual(["release"]);
    expect(stories(advanced, "fa_release")).toHaveLength(1);
    expect(stories(advanced, "fa_release")[0]).toMatchObject({ relatedId: subjectId, relatedEntityType: "player" });
    expect(advanced.freeAgentPool.agents.map(agent => agent.playerId)).toContain(subjectId);
  }, 60_000);
  it("releases an actually expired contract when a real prior buy makes its planned renewal unaffordable", () => {
    const state = world();
    const oldKeeperId = state.clubs[borrowerId].playerIds[0];
    const keeper = state.players[oldKeeperId]; delete state.players[oldKeeperId];
    state.clubs[borrowerId].playerIds[0] = keeperId;
    state.players[keeperId] = { ...keeper, id: keeperId, firstName: "Publication", lastName: "Keeper",
      contractExpiry: 1, wage: 500, currentAbility: 70, potentialAbility: 70, morale: 7 };
    for (let index = 0; index < 7; index++) {
      const id = `publication-renewal-cover-${index}`;
      state.players[id] = { ...state.players[state.clubs[borrowerId].playerIds[1]], id };
      state.clubs[borrowerId].playerIds.push(id);
    }
    const quote = processContractExpiries(state, rng("renewal-quote")).renewals.find(renewal => renewal.playerId === keeperId)!;
    expect(quote).toBeDefined(); expect(quote.wage).toBeGreaterThan(500);
    const increase = quote.wage - 500;
    addSubject(state, parentId, borrowerId, 5, Math.max(500, increase + 100)); addLoan(state, 0);
    state.players[subjectId].currentAbility = 1; state.players[subjectId].potentialAbility = 1;
    state.clubs[borrowerId].weeklyWageBudget = 500 + state.players[subjectId].wage + Math.floor(increase / 2);
    const { tick, advanced } = run(state, "renewal-refused-live-finances");
    expect(tick.contractExpiryResult?.renewals.map(renewal => renewal.playerId)).toContain(keeperId);
    expect(moves(advanced).map(event => event.type)).toEqual(["loanBuyOption"]);
    expect(moves(advanced, keeperId).map(event => event.type)).toEqual(["release"]);
    expect(advanced.players[keeperId]).toMatchObject({ clubId: "", contractExpiry: 0, wage: 0 });
    expect(advanced.clubs[borrowerId].playerIds).not.toContain(keeperId);
    expect(advanced.freeAgentPool.agents.map(agent => agent.playerId)).toContain(keeperId);
    expect(advanced.inbox.filter(message => message.id.startsWith("fa_release") && message.relatedId === keeperId)).toHaveLength(1);
  }, 60_000);
  it("retains an affordable renewal without false free-agent news", () => {
    const state = world(); addSubject(state, parentId, parentId);
    const { tick, advanced } = run(state, "renewal-affordable");
    expect(tick.contractExpiryResult?.renewals.map(renewal => renewal.playerId)).toContain(subjectId);
    expect(moves(advanced).map(event => event.type)).toEqual(["contractRenewal"]);
    expect(advanced.players[subjectId].contractClubId).toBe(parentId);
    expect(advanced.players[subjectId].contractExpiry).toBeGreaterThan(1);
    expect(stories(advanced, "fa_release")).toEqual([]); expect(stories(advanced, "fa_discover")).toEqual([]);
  }, 60_000);
  it("preserves the new owner's bought contract when it defeats the former owner's planned renewal", () => {
    const state = world(); addSubject(state, parentId, borrowerId); addLoan(state);
    const { tick, advanced } = run(state, "buy-wins-renewal");
    expect(tick.contractExpiryResult?.renewals.map(renewal => renewal.playerId)).toContain(subjectId);
    expect(moves(advanced).map(event => event.type)).toEqual(["loanBuyOption"]);
    expect(advanced.players[subjectId].contractClubId).toBe(borrowerId);
    expect(advanced.players[subjectId].contractExpiry).toBeGreaterThan(1);
    expect(advanced.freeAgentPool.agents.map(agent => agent.playerId)).not.toContain(subjectId);
    expect(stories(advanced, "fa_release")).toEqual([]); expect(stories(advanced, "fa_discover")).toEqual([]);
  }, 60_000);
  it.each([false, true])("counts real midseason releases after settlement (competing transfer=%s)", withTransfer => {
    const state = world(); state.currentWeek = 8;
    addSubject(state, parentId, parentId, 5);
    state.players[subjectId].currentAbility = 40; state.players[subjectId].age = 26;
    const template = state.players[state.clubs[parentId].playerIds[1]];
    for (let index = 0; index < 7; index++) {
      const id = `publication-extra-cover-${index}`; state.players[id] = { ...template, id };
      state.clubs[parentId].playerIds.push(id);
    }
    const midseasonRng = rng(`midseason-${withTransfer}`);
    // Enable rare terminations and discovery while this authored transfer's
    // medical stays clear. Ordinary injury draws occupy the intermediate band.
    midseasonRng.chance = probability => probability < 0.001 || probability >= 0.1;
    const before = JSON.stringify(state), tick = processWeeklyTick(state, midseasonRng);
    expect(tick.endOfSeasonTriggered).toBe(false);
    expect(tick.midSeasonReleases?.map(agent => agent.playerId)).toContain(subjectId);
    expect(tick.injuries.some(injury => injury.playerId === subjectId)).toBe(false);
    const staged = withTransfer ? { ...tick, transfers: [{ playerId: subjectId,
      fromClubId: parentId, toClubId: borrowerId, fee: 1_000, wage: 500, contractLength: 3,
      week: state.currentWeek, season: state.currentSeason }] } : tick;
    const advanced = advanceWeek(state, staged);
    console.info(JSON.stringify({ publicationCase: `midseason-${withTransfer}`, plannedReleases: tick.midSeasonReleases?.length,
      subjectMoves: moves(advanced).map(event => event.type), borrowerBudget: advanced.clubs[borrowerId].budget,
      borrowerWageBudget: advanced.clubs[borrowerId].weeklyWageBudget }));
    expect(JSON.stringify(state)).toBe(before);
    expect(moves(advanced).map(event => event.type)).toEqual([withTransfer ? "permanentTransfer" : "release"]);
    const appliedReleases = expandPlayerMovementHistory(advanced.playerMovementHistory ?? [])
      .filter(event => event.type === "release" && event.week === 8 && event.season === 1);
    expect(advanced.freeAgentPool.totalReleasedThisSeason).toBe(7 + appliedReleases.length);
    if (withTransfer) {
      expect(advanced.freeAgentPool.agents.map(agent => agent.playerId)).not.toContain(subjectId);
      expect(stories(advanced, "fa_discover")).toEqual([]);
    } else {
      expect(advanced.freeAgentPool.agents.map(agent => agent.playerId)).toContain(subjectId);
      expect(stories(advanced, "fa_discover")).toHaveLength(1);
    }
  }, 60_000);
});
