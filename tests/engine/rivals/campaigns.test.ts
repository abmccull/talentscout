import { describe, expect, it } from "vitest";
import type { RivalScout } from "@/engine/core/types";
import type { RivalOrganization } from "@/engine/rivals/organizations";
import {
  createRivalCampaignState,
  directRivalCampaignWeek,
  resolveRivalCampaignResponse,
  type RivalCampaignDirectory,
} from "@/engine/rivals/campaigns";

function makeRival(id: string, clubId: string, reputation: number): RivalScout {
  return {
    id,
    name: `Rival ${id}`,
    quality: 4,
    specialization: "youth",
    clubId,
    targetPlayerIds: [],
    reputation,
    personality: "aggressive",
    isNemesis: false,
    competingForPlayers: [],
    scoutingProgress: {},
    aggressiveness: 0.7,
    budgetTier: "medium",
    winsAgainstPlayer: 0,
    lossesToPlayer: 0,
  };
}

function makeOrganization(
  id: string,
  archetypeId: RivalOrganization["archetypeId"],
  memberRivalIds: string[],
): RivalOrganization {
  return {
    id,
    archetypeId,
    name: `Org ${id}`,
    agendaId: "control-youth-pathways",
    memberRivalIds,
    resources: 60,
    influence: 50,
    heat: 30,
    agendaProgress: 20,
    agendaLevel: 3,
    momentum: 0,
    foundedSeason: 1,
  };
}

function makeDirectory(): RivalCampaignDirectory {
  return {
    contact: [{
      entity: { kind: "contact", id: "contact-1" },
      label: "Luis Ortega",
      regionId: "portugal",
    }],
    journalist: [{
      entity: { kind: "journalist", id: "journalist-1" },
      label: "Marta Alves",
      regionId: "portugal",
    }],
    employee: [{
      entity: { kind: "employee", id: "employee-1" },
      label: "Niko Hansen",
      regionId: "denmark",
    }],
    family: [{
      entity: { kind: "family", id: "family-1" },
      label: "The Silva family",
      playerId: "player-7",
      regionId: "brazil",
    }],
    territory: [{
      entity: { kind: "territory", id: "territory-1" },
      label: "Lisbon metro circuit",
      regionId: "portugal",
    }],
    venue: [{
      entity: { kind: "venue", id: "venue-1" },
      label: "Setubal showcase",
      regionId: "portugal",
      playerId: "player-7",
    }],
    club: [{
      entity: { kind: "club", id: "club-7" },
      label: "CF Aurora",
      clubId: "club-7",
      regionId: "spain",
    }],
    player: [{
      entity: { kind: "player", id: "player-7" },
      label: "Tiago Silva",
      playerId: "player-7",
      clubId: "club-7",
      regionId: "portugal",
    }],
  };
}

describe("rival campaign engine", () => {
  it("spawns deterministically from the same seed and inputs", () => {
    const rivals = {
      "rival-1": makeRival("rival-1", "club-a", 58),
    };
    const organizations = {
      "org-1": makeOrganization("org-1", "agent-black-book", ["rival-1"]),
    };

    const first = directRivalCampaignWeek({
      rootSeed: "seed-alpha",
      season: 2,
      week: 8,
      seasonLength: 38,
      organizations,
      rivalScouts: rivals,
      directory: makeDirectory(),
      maxWeeklySpawns: 1,
      spawnChanceMultiplier: 3,
    });
    const second = directRivalCampaignWeek({
      rootSeed: "seed-alpha",
      season: 2,
      week: 8,
      seasonLength: 38,
      organizations,
      rivalScouts: rivals,
      directory: makeDirectory(),
      maxWeeklySpawns: 1,
      spawnChanceMultiplier: 3,
    });

    expect(first.spawned).toHaveLength(1);
    expect(second.spawned).toHaveLength(1);
    expect(first.spawned[0]).toEqual(second.spawned[0]);
    expect(first.messages).toEqual(second.messages);
  });

  it("progresses from signal to contest to response across weeks and resolves once", () => {
    const rivals = {
      "rival-1": makeRival("rival-1", "club-a", 58),
    };
    const organizations = {
      "org-1": makeOrganization("org-1", "regional-guild", ["rival-1"]),
    };

    const week1 = directRivalCampaignWeek({
      rootSeed: "seed-beta",
      season: 1,
      week: 4,
      seasonLength: 38,
      organizations,
      rivalScouts: rivals,
      directory: makeDirectory(),
      maxWeeklySpawns: 1,
      spawnChanceMultiplier: 3,
    });
    const campaignId = week1.spawned[0]?.id;
    expect(campaignId).toBeTruthy();
    expect(week1.state.campaigns[campaignId!].phase).toBe("signal");

    const week2 = directRivalCampaignWeek({
      rootSeed: "seed-beta",
      season: 1,
      week: 5,
      seasonLength: 38,
      organizations,
      rivalScouts: rivals,
      directory: makeDirectory(),
      state: week1.state,
      maxWeeklySpawns: 1,
      spawnChanceMultiplier: 0,
    });
    expect(week2.state.campaigns[campaignId!].phase).toBe("contest");

    const week3 = directRivalCampaignWeek({
      rootSeed: "seed-beta",
      season: 1,
      week: 6,
      seasonLength: 38,
      organizations,
      rivalScouts: rivals,
      directory: makeDirectory(),
      state: week2.state,
      maxWeeklySpawns: 1,
      spawnChanceMultiplier: 0,
    });
    expect(week3.state.campaigns[campaignId!].phase).toBe("response");

    const responseId = week3.state.campaigns[campaignId!].responseOptions[0].id;
    const resolved = resolveRivalCampaignResponse({
      rootSeed: "seed-beta",
      state: week3.state,
      campaignId: campaignId!,
      responseOptionId: responseId,
      date: { season: 1, week: 6 },
    });
    expect(resolved.changed).toBe(true);
    expect(resolved.campaign?.status).toBe("resolved");
    expect(resolved.campaign?.phase).toBe("aftermath");
    expect(resolved.provenance?.facts).toHaveLength(1);
    expect(resolved.provenance?.operationalEffects.length).toBeGreaterThan(0);

    const rerun = resolveRivalCampaignResponse({
      rootSeed: "seed-beta",
      state: resolved.state,
      campaignId: campaignId!,
      responseOptionId: responseId,
      date: { season: 1, week: 6 },
    });
    expect(rerun.changed).toBe(false);
    expect(rerun.error).toMatch(/not awaiting a response/i);
  });

  it("keeps bounded history and produces player-safe visible copy", () => {
    const empty = createRivalCampaignState({
      campaigns: {},
      history: Array.from({ length: 140 }, (_, index) => ({
        id: `history-${index}`,
        organizationId: "org-1",
        leadRivalId: "rival-1",
        kind: "clubInfluence",
        targetKind: "club",
        targetLabel: `Club ${index}`,
        status: "resolved",
        resolution: "success",
        createdAt: { season: 1, week: index + 1 },
        resolvedAt: { season: 1, week: index + 1 },
      })),
      processedWeekKeys: [],
    });
    expect(empty.history).toHaveLength(120);

    const rivals = {
      "rival-1": makeRival("rival-1", "club-a", 58),
    };
    const organizations = {
      "org-1": makeOrganization("org-1", "global-sports-group", ["rival-1"]),
    };
    const week = directRivalCampaignWeek({
      rootSeed: "seed-gamma",
      season: 1,
      week: 9,
      seasonLength: 38,
      organizations,
      rivalScouts: rivals,
      directory: makeDirectory(),
      state: empty,
      maxWeeklySpawns: 1,
      spawnChanceMultiplier: 3,
    });

    const spawned = week.spawned[0];
    expect(spawned.visibleSignals[0]?.detail.toLowerCase()).not.toContain("current ability");
    expect(spawned.visibleSignals[0]?.detail.toLowerCase()).not.toContain("potential");
    expect(spawned.visibleSignals[0]?.detail.toLowerCase()).toContain(spawned.target.label.toLowerCase());
  });
});
