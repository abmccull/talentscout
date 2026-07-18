import { describe, expect, it } from "vitest";
import type { GameState, RivalScout } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import {
  RIVAL_ORGANIZATION_DEFINITIONS,
  assessRivalMarketCounterplay,
  createRivalOrganizationState,
  deriveRivalMarketPressure,
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

  it("projects watchers, leaks, and only recorded family preferences", () => {
    const tracked = {
      ...rival("market-watcher", 0),
      targetPlayerIds: ["target"],
      currentTarget: "target",
      competingForPlayers: ["target"],
      scoutingProgress: { target: 5 },
      evidenceByPlayer: {
        target: {
          playerId: "target",
          estimatedCurrentAbility: 95,
          estimatedPotentialAbility: 145,
          confidence: 0.7,
          errorMargin: 10,
          observations: 3,
          specialtyFit: 1.1,
          lastObservedSeason: 2,
          lastObservedWeek: 7,
        },
      },
    };
    const baseState = {
      currentSeason: 2,
      currentWeek: 8,
      fixtures: {},
      rivalScouts: { [tracked.id]: tracked },
      rivalOrganizationState: createRivalOrganizationState(),
      contacts: {
        source: {
          id: "source",
          gossipQueue: [{
            id: "rumour",
            type: "transferRumor",
            playerId: "target",
            dismissed: false,
            expiresAt: { season: 2, week: 10 },
          }],
        },
      },
      unsignedYouth: {},
      consequenceState: createConsequenceEngineState(),
    } as unknown as GameState;
    const unverified = deriveRivalMarketPressure(baseState, "target");
    const familyFact = {
      id: "family-target",
      kind: "familyMarketPreference",
      subject: { kind: "player", id: "target" },
      value: "prefers-stability",
      observedAt: { season: 2, week: 7 },
      visibility: "stakeholders" as const,
    };
    const recorded = deriveRivalMarketPressure({
      ...baseState,
      consequenceState: createConsequenceEngineState({
        facts: { [familyFact.id]: familyFact },
      }),
    }, "target");

    expect(unverified).toMatchObject({
      informationExposure: "leaking",
      family: { preference: "unverified" },
      watchers: [expect.objectContaining({ rivalId: tracked.id })],
    });
    expect(recorded.family).toMatchObject({
      preference: "prefers-stability",
      sourceFactId: familyFact.id,
    });
    expect(recorded.score).toBeGreaterThanOrEqual(unverified.score);
  });

  it("lets a scout influence pressure without overriding transfer authorities", () => {
    const pressure = deriveRivalMarketPressure({
      currentSeason: 1,
      currentWeek: 5,
      fixtures: {},
      rivalScouts: {},
      contacts: {},
      unsignedYouth: {},
      consequenceState: createConsequenceEngineState(),
      rivalOrganizationState: createRivalOrganizationState(),
    } as unknown as GameState, "target");
    const transfer = {
      viable: false,
      affordability: {
        result: { affordable: false },
        reasons: ["The buying club cannot fund the agreement."],
      },
      registration: {
        eligible: false,
        reasons: ["The registration route is blocked."],
      },
      willingness: {
        willingToJoin: false,
        reasons: ["The player has not agreed to the pathway."],
      },
    } as Parameters<typeof assessRivalMarketCounterplay>[0]["transfer"];
    const advocate = assessRivalMarketCounterplay({
      pressure,
      response: "advocate",
      transfer,
    });
    const withdraw = assessRivalMarketCounterplay({
      pressure,
      response: "withdraw",
      transfer,
    });

    expect(advocate.rivalPressureMultiplier).toBeLessThan(withdraw.rivalPressureMultiplier);
    expect(advocate.scoutInfluence).toBeGreaterThan(withdraw.scoutInfluence);
    expect(advocate.transferAuthorityStatus).toBe("blocked");
    expect(advocate.constraints).toEqual(expect.arrayContaining([
      "The buying club cannot fund the agreement.",
      "The registration route is blocked.",
      "The player has not agreed to the pathway.",
    ]));
    expect(advocate.rivalPressureMultiplier).toBeGreaterThanOrEqual(0.75);
    expect(withdraw.rivalPressureMultiplier).toBeLessThanOrEqual(1.2);

    const canonicalVeto = assessRivalMarketCounterplay({
      pressure,
      response: "advocate",
      transfer: {
        viable: false,
        affordability: { result: { affordable: true }, reasons: [] },
        registration: { eligible: true, reasons: [] },
        willingness: { willingToJoin: true, reasons: [] },
      } as unknown as Parameters<typeof assessRivalMarketCounterplay>[0]["transfer"],
    });
    expect(canonicalVeto.transferAuthorityStatus).toBe("blocked");
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
