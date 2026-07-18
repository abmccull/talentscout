import { describe, expect, it } from "vitest";

import type { Contact, GameState, Player } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import {
  buildRelationshipPosition,
  buildStoryThread,
  compactAccessAgreementHistory,
  ACCESS_AGREEMENT_TERMINAL_HISTORY_GLOBAL_LIMIT,
  processWeeklyAccessAgreements,
} from "@/engine/consequences";
import { createConsequenceEngineState } from "@/engine/consequences";
import type { EntityRef, StakeholderMemory } from "@/engine/consequences/types";

const insiderContact: Contact = {
  id: "contact-insider",
  name: "Joao Pereira",
  type: "academyCoach",
  organization: "Academia Norte",
  relationship: 86,
  reliability: 78,
  knownPlayerIds: ["player-1"],
  trustLevel: 86,
  loyalty: 100,
  interactionHistory: [],
  gossipQueue: [],
  referralNetwork: [],
  betrayalRisk: 0,
  country: "portugal",
};

const player: Player = {
  id: "player-1",
  firstName: "Tiago",
  lastName: "Silva",
  age: 17,
} as Player;

function agreement(
  id: string,
  overrides: Partial<NonNullable<GameState["accessAgreements"]>[string]> = {},
): NonNullable<GameState["accessAgreements"]>[string] {
  return {
    id,
    grantor: { kind: "contact", id: insiderContact.id },
    beneficiary: { kind: "scout", id: "scout-1" },
    scope: "playerEarlyAccess",
    status: "expired",
    exclusive: true,
    confidential: true,
    createdAt: { season: 1, week: 1 },
    expiresAt: { season: 1, week: 3 },
    subject: { kind: "player", id: player.id },
    countryId: "portugal",
    regionId: "lisbon",
    metadata: {
      playerName: "Tiago Silva",
      grantorName: insiderContact.name,
      terminalSeason: 1,
      terminalWeek: 3,
      terminalStatus: "expired",
    },
    ...overrides,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    currentSeason: 1,
    currentWeek: 10,
    fixtures: {},
    contacts: { [insiderContact.id]: insiderContact },
    accessAgreements: {},
    players: { [player.id]: player },
    scout: { id: "scout-1" } as GameState["scout"],
    consequenceState: createConsequenceEngineState(),
    ...overrides,
  } as GameState;
}

function threadForStakeholder(
  stakeholder: EntityRef,
  {
    memories = [],
    obligations = {},
  }: {
    memories?: readonly StakeholderMemory[];
    obligations?: NonNullable<GameState["consequenceState"]>["obligations"];
  } = {},
) {
  const consequenceState = createConsequenceEngineState();
  for (const memory of memories) consequenceState.memories[memory.id] = memory;
  consequenceState.obligations = { ...obligations };
  return buildStoryThread({
    state: {
      consequenceState,
      accessAgreements: {},
    },
    stakeholder,
    now: { season: 2, week: 3 },
  });
}

describe("access agreements", () => {
  it("creates a canonical early-access agreement instead of mutating the contact", () => {
    let result: ReturnType<typeof processWeeklyAccessAgreements> | null = null;
    for (let index = 0; index < 200 && Object.keys(result?.accessAgreements ?? {}).length === 0; index += 1) {
      result = processWeeklyAccessAgreements(
        state(),
        new RNG(`access-agreement-creation-${index}`),
      );
    }

    const agreement = Object.values(result?.accessAgreements ?? {})[0];
    expect(agreement).toMatchObject({
      grantor: { kind: "contact", id: insiderContact.id },
      beneficiary: { kind: "scout", id: "scout-1" },
      scope: "playerEarlyAccess",
      status: "active",
      subject: { kind: "player", id: player.id },
    });
    expect(result?.exclusiveMessages).toHaveLength(1);
  });

  it("expires active agreements and projects them into derived relationship views", () => {
    const gameState = state({
      currentSeason: 2,
      currentWeek: 4,
      accessAgreements: {
        "access:test": {
          id: "access:test",
          grantor: { kind: "contact", id: insiderContact.id },
          beneficiary: { kind: "scout", id: "scout-1" },
          scope: "playerEarlyAccess",
          status: "active",
          exclusive: true,
          confidential: true,
          createdAt: { season: 2, week: 1 },
          expiresAt: { season: 2, week: 4 },
          subject: { kind: "player", id: player.id },
        },
      },
    });

    const processed = processWeeklyAccessAgreements(gameState, new RNG("expire-access"));
    expect(processed.accessAgreements["access:test"].status).toBe("expired");

    const activeState = state({
      currentSeason: 2,
      currentWeek: 3,
      accessAgreements: {
        "access:active": {
          id: "access:active",
          grantor: { kind: "contact", id: insiderContact.id },
          beneficiary: { kind: "scout", id: "scout-1" },
          scope: "playerEarlyAccess",
          status: "active",
          exclusive: true,
          confidential: true,
          createdAt: { season: 2, week: 2 },
          expiresAt: { season: 2, week: 5 },
          subject: { kind: "player", id: player.id },
        },
      },
    });
    const position = buildRelationshipPosition({
      state: {
        consequenceState: activeState.consequenceState,
        accessAgreements: activeState.accessAgreements,
      },
      stakeholder: { kind: "contact", id: insiderContact.id },
      now: { season: 2, week: 3 },
      scoutId: "scout-1",
      baseTrust: insiderContact.trustLevel,
      baseInfluence: 60,
    });
    expect(position.activeAccess).toHaveLength(1);

    const thread = buildStoryThread({
      state: {
        consequenceState: activeState.consequenceState,
        accessAgreements: activeState.accessAgreements,
      },
      stakeholder: { kind: "contact", id: insiderContact.id },
      now: { season: 2, week: 3 },
    });
    expect(thread.entries.some((entry) => entry.kind === "access")).toBe(true);
    const renderedThread = JSON.stringify(thread.entries);
    expect(renderedThread).not.toMatch(/valence|intensity|contact:|player:/i);
    expect(renderedThread).not.toContain(insiderContact.id);
    expect(renderedThread).not.toContain(player.id);
  });

  it("compacts older terminal agreements while preserving active and recent history", () => {
    const accessAgreements = Object.fromEntries([
      [
        "access:active",
        agreement("access:active", {
          status: "active",
          createdAt: { season: 9, week: 6 },
          expiresAt: { season: 10, week: 2 },
          metadata: { grantorName: insiderContact.name, playerName: "Tiago Silva" },
        }),
      ],
      [
        "access:recent",
        agreement("access:recent", {
          createdAt: { season: 9, week: 2 },
          expiresAt: { season: 9, week: 5 },
          metadata: {
            playerName: "Tiago Silva",
            grantorName: insiderContact.name,
            terminalSeason: 9,
            terminalWeek: 5,
            terminalStatus: "expired",
          },
        }),
      ],
      ...Array.from({ length: 8 }, (_, index) => [
        `access:old:${index}`,
        agreement(`access:old:${index}`, {
          createdAt: { season: 2 + index, week: 1 },
          expiresAt: { season: 2 + index, week: 3 },
          sourceDecisionId: index < 4 ? "decision-shared" : undefined,
          metadata: {
            playerName: index < 4 ? "Repeat Prospect" : `Prospect ${index}`,
            grantorName: insiderContact.name,
            terminalSeason: 2 + index,
            terminalWeek: 3,
            terminalStatus: "expired",
          },
          subject: { kind: "player", id: index < 4 ? "player-repeat" : `player-${index}` },
        }),
      ]),
    ]);

    const compacted = compactAccessAgreementHistory(accessAgreements, { season: 10, week: 8 });
    expect(compacted.accessAgreements["access:active"]?.status).toBe("active");
    expect(compacted.accessAgreements["access:recent"]?.status).toBe("expired");
    expect(compacted.removedIds.length).toBeGreaterThan(0);
    expect(Object.keys(compacted.accessAgreements)).not.toEqual(Object.keys(accessAgreements));
    const replayed = compactAccessAgreementHistory(compacted.accessAgreements, { season: 10, week: 8 });
    expect(replayed.accessAgreements).toEqual(compacted.accessAgreements);
    expect(replayed.removedIds).toEqual([]);
  });

  it("keeps long-save terminal history globally bounded with deterministic replay after reload", () => {
    const now = { season: 12, week: 10 };
    const bloated = Object.fromEntries(
      Array.from({ length: ACCESS_AGREEMENT_TERMINAL_HISTORY_GLOBAL_LIMIT + 80 }, (_, index) => {
        const season = 1 + (index % 8);
        return [
          `access:archive:${index}`,
          agreement(`access:archive:${index}`, {
            createdAt: { season, week: 1 },
            expiresAt: { season, week: 2 },
            subject: { kind: "player", id: `archive-player-${index}` },
            regionId: `region-${index % 24}`,
            countryId: `country-${index % 12}`,
            sourceDecisionId: `decision-${index}`,
            metadata: {
              playerName: `Archive Prospect ${index}`,
              grantorName: insiderContact.name,
              terminalSeason: season,
              terminalWeek: 2,
              terminalStatus: "expired",
            },
          }),
        ];
      }),
    );
    const base = state({
      currentSeason: now.season,
      currentWeek: now.week,
      contacts: {},
      accessAgreements: bloated,
      players: {},
    });

    const onePass = processWeeklyAccessAgreements(base, new RNG("access-compaction-one-pass"));
    expect(Object.keys(onePass.accessAgreements)).toHaveLength(
      ACCESS_AGREEMENT_TERMINAL_HISTORY_GLOBAL_LIMIT,
    );

    let replayState = structuredClone(base);
    for (let week = 0; week < 4; week += 1) {
      const result = processWeeklyAccessAgreements(
        replayState,
        new RNG(`access-compaction-replay-${week}`),
      );
      replayState = {
        ...replayState,
        accessAgreements: result.accessAgreements,
        currentWeek: replayState.currentWeek + 1,
      } as GameState;
      if (week === 1) {
        replayState = structuredClone(replayState);
      }
    }

    let resumedState = structuredClone(base);
    for (let week = 0; week < 4; week += 1) {
      const result = processWeeklyAccessAgreements(
        resumedState,
        new RNG(`access-compaction-replay-${week}`),
      );
      resumedState = {
        ...resumedState,
        accessAgreements: result.accessAgreements,
        currentWeek: resumedState.currentWeek + 1,
      } as GameState;
    }

    expect(replayState.accessAgreements).toEqual(resumedState.accessAgreements);
    expect(Object.keys(replayState.accessAgreements ?? {}).length).toBeLessThanOrEqual(
      ACCESS_AGREEMENT_TERMINAL_HISTORY_GLOBAL_LIMIT,
    );
  });

  it("renders authored protected-confidence callbacks without raw internal fields", () => {
    const thread = threadForStakeholder(
      { kind: "family", id: "family-1" },
      {
        memories: [
          {
            id: "mem:family-protected",
            stakeholder: { kind: "family", id: "family-1" },
            subject: { kind: "scout", id: "scout-1" },
            tags: ["familyPrivacy", "protectedFamily", "trustedUnderPressure"],
            valence: 78,
            intensity: 84,
            salience: 92,
            visibility: "stakeholders",
            createdAt: { season: 2, week: 2 },
            metadata: { playerName: "Mateo Rios" },
          },
        ],
      },
    );

    expect(thread.entries[0]).toMatchObject({
      kind: "memory",
      title: "Protected confidence shared",
    });
    expect(thread.entries[0]?.description).toContain("Mateo Rios");
    expect(thread.entries[0]?.description).toMatch(/protected information|protected channel/i);

    const renderedThread = JSON.stringify(thread.entries);
    expect(renderedThread).not.toMatch(/valence|intensity|salience|protectedFamily|trustedUnderPressure/i);
    expect(renderedThread).not.toContain("family-1");
    expect(renderedThread).not.toContain("scout-1");
  });

  it("distinguishes broken promises, rival poaching pressure, and pathway advice with authored prose", () => {
    const rivalThread = threadForStakeholder(
      { kind: "rival", id: "rival-1" },
      {
        memories: [
          {
            id: "mem:rival-race",
            stakeholder: { kind: "rival", id: "rival-1" },
            subject: { kind: "scout", id: "scout-1" },
            tags: ["rivalry", "directCompetition", "ceasefireRejected"],
            valence: -72,
            intensity: 80,
            salience: 88,
            visibility: "stakeholders",
            createdAt: { season: 2, week: 2 },
            metadata: { playerName: "Luis Moreno", rivalName: "Marco Vale" },
          },
        ],
      },
    );
    expect(rivalThread.entries[0]).toMatchObject({
      title: "Rivalry escalated",
    });
    expect(rivalThread.entries[0]?.description).toContain("Marco Vale");
    expect(rivalThread.entries[0]?.description).toContain("Luis Moreno");

    const agentThread = threadForStakeholder(
      { kind: "agent", id: "agent-1" },
      {
        memories: [
          {
            id: "mem:agent-broken",
            stakeholder: { kind: "agent", id: "agent-1" },
            subject: { kind: "scout", id: "scout-1" },
            tags: ["agentExclusivity", "promiseBroken", "abandonedLead"],
            valence: -74,
            intensity: 86,
            salience: 90,
            visibility: "stakeholders",
            createdAt: { season: 2, week: 1 },
            metadata: { playerName: "Luis Moreno" },
          },
        ],
      },
    );
    expect(agentThread.entries[0]).toMatchObject({
      title: "Agency trust broken",
    });
    expect(agentThread.entries[0]?.description).toMatch(/your word can shift|ownership or access/i);

    const familyThread = threadForStakeholder(
      { kind: "family", id: "family-2" },
      {
        memories: [
          {
            id: "mem:pathway-call",
            stakeholder: { kind: "family", id: "family-2" },
            subject: { kind: "scout", id: "scout-1" },
            tags: ["playerWelfare", "fastTrack", "independentAdvice"],
            valence: 42,
            intensity: 72,
            salience: 82,
            visibility: "stakeholders",
            createdAt: { season: 2, week: 1 },
            metadata: { playerName: "Ari Costa", clubName: "Sporting Meridian" },
          },
        ],
      },
    );
    expect(familyThread.entries[0]).toMatchObject({
      title: "Pathway advice remembered",
    });
    expect(familyThread.entries[0]?.description).toContain("Ari Costa");
    expect(familyThread.entries[0]?.description).toContain("Sporting Meridian");
  });

  it("covers journalist, staff, and obligation prose without leaking tag ids", () => {
    const journalistThread = threadForStakeholder(
      { kind: "journalist", id: "journo-1" },
      {
        memories: [
          {
            id: "mem:journalist-promise",
            stakeholder: { kind: "journalist", id: "journo-1" },
            subject: { kind: "scout", id: "scout-1" },
            tags: ["mediaAccess", "promiseBroken", "sourceRelationship"],
            valence: -48,
            intensity: 68,
            salience: 79,
            visibility: "stakeholders",
            createdAt: { season: 2, week: 2 },
          },
          {
            id: "mem:staff-credit",
            stakeholder: { kind: "employee", id: "emp-1" },
            subject: { kind: "scout", id: "scout-1" },
            tags: ["employeeCredit", "creditDenied", "leadership"],
            valence: -66,
            intensity: 76,
            salience: 83,
            visibility: "stakeholders",
            createdAt: { season: 2, week: 2 },
          },
        ],
        obligations: {
          "obl:family": {
            id: "obl:family",
            debtor: { kind: "scout", id: "scout-1" },
            creditor: { kind: "family", id: "family-1" },
            kind: "familyPrivacy",
            terms: "Keep the prospect's identity private.",
            status: "active",
            createdAt: { season: 2, week: 1 },
            sourceDecisionId: "decision-1",
          },
        },
      },
    );
    expect(journalistThread.entries[0]?.title).toBe("Source promise broken");

    const employeeThread = threadForStakeholder({ kind: "employee", id: "emp-1" }, {
      memories: [
        {
          id: "mem:staff-credit",
          stakeholder: { kind: "employee", id: "emp-1" },
          subject: { kind: "scout", id: "scout-1" },
          tags: ["employeeCredit", "creditDenied", "leadership"],
          valence: -66,
          intensity: 76,
          salience: 83,
          visibility: "stakeholders",
          createdAt: { season: 2, week: 2 },
        },
      ],
    });
    expect(employeeThread.entries[0]).toMatchObject({
      title: "Staff trust damaged",
    });
    expect(employeeThread.entries[0]?.description).toMatch(/staff|credit/i);

    const obligationThread = threadForStakeholder({ kind: "family", id: "family-1" }, {
      obligations: {
        "obl:family": {
          id: "obl:family",
          debtor: { kind: "scout", id: "scout-1" },
          creditor: { kind: "family", id: "family-1" },
          kind: "familyPrivacy",
          terms: "Keep the prospect's identity private.",
          status: "active",
          createdAt: { season: 2, week: 1 },
          sourceDecisionId: "decision-1",
        },
      },
    });
    expect(obligationThread.entries[0]).toMatchObject({
      kind: "obligation",
      title: "Family privacy request",
    });

    const rendered = JSON.stringify([
      ...journalistThread.entries,
      ...employeeThread.entries,
      ...obligationThread.entries,
    ]);
    expect(rendered).not.toMatch(/mediaAccess|sourceRelationship|employeeCredit|creditDenied|familyPrivacy/i);
    expect(rendered).not.toContain("journo-1");
    expect(rendered).not.toContain("emp-1");
  });
});
