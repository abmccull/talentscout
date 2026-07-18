import { describe, expect, it } from "vitest";
import {
  createRivalOrganizationState,
  initializeRivalOrganizations,
  migrateRivalOrganizationState,
} from "@/engine/rivals";
import type { RivalScout } from "@/engine/core/types";

function makeRival(id: string): RivalScout {
  return {
    id,
    name: `Rival ${id}`,
    quality: 3,
    specialization: "youth",
    clubId: `club-${id}`,
    targetPlayerIds: [],
    reputation: 45,
    personality: "aggressive",
    isNemesis: false,
    competingForPlayers: [],
    scoutingProgress: {},
    aggressiveness: 0.5,
    budgetTier: "medium",
    winsAgainstPlayer: 0,
    lossesToPlayer: 0,
  };
}

describe("rival organization campaign state integration", () => {
  it("normalizes nested campaign state by default", () => {
    const state = createRivalOrganizationState();
    expect(state.campaignState).toEqual({
      campaigns: {},
      history: [],
      processedWeekKeys: [],
    });
  });

  it("initializes legacy organization state with empty campaign authority", () => {
    const initialized = initializeRivalOrganizations("seed-1", {
      "rival-1": makeRival("1"),
      "rival-2": makeRival("2"),
      "rival-3": makeRival("3"),
    });
    expect(initialized.state.campaignState.campaigns).toEqual({});
    expect(initialized.state.campaignState.history).toEqual([]);
  });

  it("migrates an existing state and retains bounded campaign history", () => {
    const migrated = migrateRivalOrganizationState(
      "seed-2",
      { "rival-1": makeRival("1") },
      {
        organizations: {
          "org-1": {
            id: "org-1",
            archetypeId: "regional-guild",
            name: "Guild",
            agendaId: "protect-regional-territory",
            memberRivalIds: ["rival-1"],
            resources: 50,
            influence: 50,
            heat: 25,
            agendaProgress: 20,
            agendaLevel: 2,
            momentum: 0,
            foundedSeason: 1,
          },
        },
        activities: [],
        opportunities: {},
        campaignState: {
          campaigns: {},
          history: Array.from({ length: 140 }, (_, index) => ({
            id: `campaign-${index}`,
            organizationId: "org-1",
            leadRivalId: "rival-1",
            kind: "territoryLock",
            targetKind: "territory",
            targetLabel: `Region ${index}`,
            status: "resolved",
            resolution: "success",
            createdAt: { season: 1, week: index + 1 },
            resolvedAt: { season: 1, week: index + 1 },
          })),
          processedWeekKeys: Array.from({ length: 200 }, (_, index) => `s1:w${index + 1}`),
        },
      },
      1,
    );

    expect(migrated.campaignState.history).toHaveLength(120);
    expect(migrated.campaignState.processedWeekKeys).toHaveLength(160);
  });
});
