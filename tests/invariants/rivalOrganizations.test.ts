import { describe, expect, it } from "vitest";
import type { GameState, RivalScout } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import {
  RIVAL_ORGANIZATION_DEFINITIONS,
  createRivalOrganizationState,
  getOpenRivalOrganizationOpportunities,
  getOrganizationForRival,
  initializeRivalOrganizations,
  migrateRivalOrganizationState,
  processRivalOrganizationWeek,
  resolveRivalOrganizationOpportunity,
} from "@/engine/rivals";
import { createProgressionActions } from "@/stores/actions/progressionActions";
import type {
  GameStoreState,
  GetState,
  SetState,
} from "@/stores/actions/types";

function rival(id: string, index: number): RivalScout {
  return {
    id,
    name: `Rival ${index}`,
    quality: 2 + (index % 4),
    specialization: index % 2 === 0 ? "youth" : "regional",
    clubId: `club-${index}`,
    targetPlayerIds: [`player-${index}`],
    reputation: 40 + index,
    personality: index % 2 === 0 ? "aggressive" : "connected",
    isNemesis: index === 0,
    competingForPlayers: [],
    currentTarget: `player-${index}`,
    scoutingProgress: {},
    aggressiveness: 0.6,
    budgetTier: "medium",
    winsAgainstPlayer: 0,
    lossesToPlayer: 0,
  };
}

const RIVALS = Object.fromEntries(
  Array.from({ length: 5 }, (_, index) => {
    const entry = rival(`rival-${index}`, index);
    return [entry.id, entry];
  }),
);

function processWeek(
  state: ReturnType<typeof createRivalOrganizationState>,
  season: number,
  week: number,
  chanceMultiplier = 1,
) {
  return processRivalOrganizationWeek(state, {
    rootSeed: "rival-organization-invariant",
    season,
    week,
    seasonLength: 50,
    rivalScouts: RIVALS,
    opportunityChanceMultiplier: chanceMultiplier,
  });
}

describe("persistent rival organizations", () => {
  it("ships at least five mechanically distinct organization archetypes", () => {
    expect(RIVAL_ORGANIZATION_DEFINITIONS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(RIVAL_ORGANIZATION_DEFINITIONS.map((entry) => entry.id)).size)
      .toBe(RIVAL_ORGANIZATION_DEFINITIONS.length);
    expect(new Set(RIVAL_ORGANIZATION_DEFINITIONS.map((entry) => entry.agendaId)).size)
      .toBe(RIVAL_ORGANIZATION_DEFINITIONS.length);

    const signatures = RIVAL_ORGANIZATION_DEFINITIONS.map((entry) =>
      entry.actions.map((action) => [
        action.kind,
        action.pressure.discoveryChanceMultiplier,
        action.pressure.poachChanceMultiplier,
        action.pressure.signingChanceMultiplier,
        action.pressure.youthProgressBonus,
      ].join(":")),
    );
    expect(new Set(signatures.map((entry) => entry.join("|"))).size)
      .toBe(RIVAL_ORGANIZATION_DEFINITIONS.length);
  });

  it("deterministically selects organizations and assigns every rival exactly once", () => {
    const first = initializeRivalOrganizations("coalition-seed", RIVALS);
    const replay = initializeRivalOrganizations("coalition-seed", RIVALS);
    const different = initializeRivalOrganizations("other-coalition-seed", RIVALS);

    expect(replay).toEqual(first);
    expect(different.state.organizations).not.toEqual(first.state.organizations);
    expect(Object.keys(first.state.organizations)).toHaveLength(3);
    expect(Object.keys(first.assignments).sort()).toEqual(Object.keys(RIVALS).sort());

    const members = Object.values(first.state.organizations)
      .flatMap((organization) => organization.memberRivalIds);
    expect(members.sort()).toEqual(Object.keys(RIVALS).sort());
    expect(new Set(members).size).toBe(members.length);
    for (const rivalId of Object.keys(RIVALS)) {
      expect(getOrganizationForRival(first.state, rivalId)?.id)
        .toBe(first.assignments[rivalId]);
    }
  });

  it("advances one auditable agenda action per week without double-processing", () => {
    const initialized = initializeRivalOrganizations(
      "rival-organization-invariant",
      RIVALS,
    ).state;
    const first = processWeek(initialized, 1, 1, 5);

    expect(first.changed).toBe(true);
    expect(first.activity).toBeDefined();
    expect(first.facts).toHaveLength(1);
    expect(first.facts[0]).toMatchObject({
      kind: "RivalOrganizationActed",
      subject: { kind: "rivalOrganization" },
      observedAt: { season: 1, week: 1 },
    });
    expect(first.state.activities).toHaveLength(1);
    expect(first.pressure.discoveryChanceMultiplier).toBeGreaterThanOrEqual(1);
    expect(first.opportunity).toBeDefined();
    expect(first.messages[0]).toMatchObject({ actionRequired: true });

    const replay = processWeek(first.state, 1, 1, 5);
    expect(replay.changed).toBe(false);
    expect(replay.state).toEqual(first.state);
    expect(replay.facts).toEqual([]);
    expect(replay.messages).toEqual([]);
  });

  it("precommits opportunity outcomes and makes exploit/decline terminal choices", () => {
    const initialized = initializeRivalOrganizations(
      "rival-organization-invariant",
      RIVALS,
    ).state;
    const weekly = processWeek(initialized, 1, 1, 5);
    const opportunity = weekly.opportunity!;
    expect(opportunity.outcomeRoll).toBeGreaterThanOrEqual(0);
    expect(opportunity.outcomeRoll).toBeLessThan(1);

    const exploit = resolveRivalOrganizationOpportunity(
      weekly.state,
      opportunity.id,
      "exploit",
      { season: 1, week: 1 },
    );
    const exploitAfterReload = resolveRivalOrganizationOpportunity(
      structuredClone(weekly.state),
      opportunity.id,
      "exploit",
      { season: 1, week: 1 },
    );
    expect(exploitAfterReload).toEqual(exploit);
    expect(exploit.changed).toBe(true);
    expect(exploit.fatigueDelta).toBeGreaterThan(0);
    expect(exploit.fact).toMatchObject({
      kind: "RivalOrganizationOpportunityResolved",
    });
    expect(exploit.state.opportunities[opportunity.id]).toMatchObject({
      status: "exploited",
      resolution: exploit.success ? "success" : "failure",
    });

    const duplicate = resolveRivalOrganizationOpportunity(
      exploit.state,
      opportunity.id,
      "exploit",
      { season: 1, week: 1 },
    );
    expect(duplicate.changed).toBe(false);
    expect(duplicate.reputationDelta).toBe(0);
    expect(duplicate.fatigueDelta).toBe(0);

    const decline = resolveRivalOrganizationOpportunity(
      weekly.state,
      opportunity.id,
      "decline",
      { season: 1, week: 1 },
    );
    expect(decline).toMatchObject({
      changed: true,
      reputationDelta: 0,
      fatigueDelta: 0,
    });
    expect(decline.state.opportunities[opportunity.id]).toMatchObject({
      status: "declined",
      resolution: "declined",
    });
  });

  it("produces identical future weeks after serialization and bounds long careers", () => {
    let state = initializeRivalOrganizations(
      "rival-organization-invariant",
      RIVALS,
    ).state;
    for (let absoluteWeek = 0; absoluteWeek < 200; absoluteWeek++) {
      const season = Math.floor(absoluteWeek / 50) + 1;
      const week = (absoluteWeek % 50) + 1;
      state = processWeek(state, season, week).state;
    }

    expect(state.activities).toHaveLength(120);
    expect(state.processedWeekKeys).toHaveLength(120);
    expect(Object.keys(state.opportunities).length).toBeLessThanOrEqual(40);
    for (const organization of Object.values(state.organizations)) {
      expect(organization.resources).toBeGreaterThanOrEqual(0);
      expect(organization.resources).toBeLessThanOrEqual(100);
      expect(organization.influence).toBeGreaterThanOrEqual(0);
      expect(organization.influence).toBeLessThanOrEqual(100);
      expect(organization.heat).toBeGreaterThanOrEqual(0);
      expect(organization.heat).toBeLessThanOrEqual(100);
      expect(organization.agendaLevel).toBeGreaterThanOrEqual(1);
      expect(organization.agendaLevel).toBeLessThanOrEqual(10);
    }

    const reloaded = structuredClone(state);
    const liveNext = processWeek(state, 5, 1);
    const reloadedNext = processWeek(reloaded, 5, 1);
    expect(reloadedNext).toEqual(liveNext);
  });

  it("backfills legacy saves deterministically without replacing existing history", () => {
    const migrated = migrateRivalOrganizationState(
      "legacy-org-seed",
      RIVALS,
      undefined,
      4,
    );
    expect(Object.keys(migrated.organizations)).toHaveLength(3);
    expect(Object.values(migrated.organizations).every(
      (organization) => organization.foundedSeason === 4,
    )).toBe(true);

    const existing = {
      ...migrated,
      activities: [{
        ...processRivalOrganizationWeek(migrated, {
          rootSeed: "legacy-org-seed",
          season: 4,
          week: 1,
          seasonLength: 50,
          rivalScouts: RIVALS,
        }).activity!,
      }],
    };
    expect(migrateRivalOrganizationState(
      "legacy-org-seed",
      RIVALS,
      existing,
      4,
    )).toEqual(existing);
  });
});

describe("rival organization store projection", () => {
  it("applies a chosen opportunity to scout state and the causal fact ledger once", () => {
    const initialized = initializeRivalOrganizations(
      "rival-organization-invariant",
      RIVALS,
    ).state;
    const weekly = processWeek(initialized, 1, 1, 5);
    const opportunity = weekly.opportunity!;
    const initialGameState = {
      currentSeason: 1,
      currentWeek: 1,
      scout: { id: "scout", reputation: 40, fatigue: 10 },
      inbox: [],
      consequenceState: createConsequenceEngineState(),
      rivalOrganizationState: weekly.state,
    } as unknown as GameState;
    let store = { gameState: initialGameState } as unknown as GameStoreState;
    const get: GetState = () => store;
    const set: SetState = (partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    };
    const actions = createProgressionActions(get, set);

    actions.resolveRivalOrganizationOpportunity(opportunity.id, "exploit");
    const resolved = store.gameState!;
    expect(resolved.rivalOrganizationState.opportunities[opportunity.id].status)
      .toBe("exploited");
    expect(resolved.scout.fatigue).toBeGreaterThan(10);
    expect(Object.values(resolved.consequenceState.facts)).toContainEqual(
      expect.objectContaining({ kind: "RivalOrganizationOpportunityResolved" }),
    );
    expect(resolved.inbox.at(-1)).toMatchObject({ actionRequired: false });

    actions.resolveRivalOrganizationOpportunity(opportunity.id, "exploit");
    expect(store.gameState).toBe(resolved);
  });

  it("returns open opportunities in deadline order", () => {
    const initialized = initializeRivalOrganizations(
      "rival-organization-invariant",
      RIVALS,
    ).state;
    const first = processWeek(initialized, 1, 1, 5).state;
    const second = processWeek(first, 1, 2, 5).state;
    const open = getOpenRivalOrganizationOpportunities(second);
    expect(open.length).toBeGreaterThanOrEqual(2);
    expect(open[0].expiresWeek).toBeLessThanOrEqual(open[1].expiresWeek);
  });
});

