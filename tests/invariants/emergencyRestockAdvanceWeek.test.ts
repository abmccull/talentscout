import { describe, expect, it, vi } from "vitest";
import { advanceWeek, processWeeklyTick } from "@/engine/core/gameLoop";
import { repairCompetitiveRosterGaps } from "@/engine/freeAgents/emergencyRestock";
import { createRNG } from "@/engine/rng";
import {
  COMPETITIVE_REGISTERED_FLOOR,
  countRegisteredAtClub,
  countRegisteredKeepers,
} from "@/engine/match/eligibleRoster";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: { toArray: async () => [] },
    leaderboard: { put: async () => undefined, clear: async () => undefined },
  },
}));

describe("emergency restock through advanceWeek", () => {
  it("restocks a funded club that lost every registered keeper", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Emg",
      scoutLastName: "Keeper",
      scoutAge: 28,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "emergency-advance-keeper",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });

    const generated = useGameStore.getState().gameState!;
    const clubId = Object.keys(generated.clubs)[0]!;
    const club = generated.clubs[clubId]!;
    const players = { ...generated.players };
    for (const player of Object.values(players)) {
      if (player.clubId === clubId && player.position === "GK") {
        players[player.id] = {
          ...player,
          clubId: "",
          contractClubId: undefined,
          contractExpiry: 0,
        };
      }
    }
    const state = {
      ...generated,
      players,
      clubs: {
        ...generated.clubs,
        [clubId]: {
          ...club,
          budget: Math.max(club.budget, 500_000),
          weeklyWageBudget: Math.max(club.weeklyWageBudget ?? 0, 50_000),
          playerIds: club.playerIds.filter((id) => players[id]?.clubId === clubId),
          academyPlayerIds: (club.academyPlayerIds ?? [])
            .filter((id) => players[id]?.clubId === clubId),
        },
      },
      freeAgentPool: {
        agents: [],
        lastRefreshSeason: generated.currentSeason,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      currentWeek: Math.min(generated.currentWeek, 20),
    };
    expect(countRegisteredKeepers(state.clubs[clubId]!, state.players)).toBe(0);

    const tick = processWeeklyTick(state, createRNG(`${state.seed}:emergency-advance-keeper`));
    expect(tick.freeAgentNPCSignings?.some((signing) =>
      signing.clubId === clubId && signing.relaxWeeklyWageCap)).toBe(true);
    expect(tick.emergencySpawnedPlayers?.some((player) => player.position === "GK")).toBe(true);

    const next = advanceWeek(state, tick);
    expect(countRegisteredKeepers(next.clubs[clubId]!, next.players)).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("post-advance repair fills residual XI/GK gaps after lifecycle apply", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Emg",
      scoutLastName: "Repair",
      scoutAge: 28,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "emergency-post-advance-repair",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });

    const generated = useGameStore.getState().gameState!;
    const clubId = Object.keys(generated.clubs)[0]!;
    const club = generated.clubs[clubId]!;
    const players = { ...generated.players };
    for (const player of Object.values(players)) {
      if (player.clubId === clubId && player.position === "GK") {
        players[player.id] = {
          ...player,
          clubId: "",
          contractClubId: undefined,
          contractExpiry: 0,
        };
      }
    }
    const broken = {
      ...generated,
      players,
      clubs: {
        ...generated.clubs,
        [clubId]: {
          ...club,
          budget: Math.max(club.budget, 500_000),
          weeklyWageBudget: Math.max(club.weeklyWageBudget ?? 0, 50_000),
          playerIds: club.playerIds.filter((id) => players[id]?.clubId === clubId),
          academyPlayerIds: (club.academyPlayerIds ?? [])
            .filter((id) => players[id]?.clubId === clubId),
        },
      },
      freeAgentPool: {
        agents: [],
        lastRefreshSeason: generated.currentSeason,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
    };
    expect(countRegisteredKeepers(broken.clubs[clubId]!, broken.players)).toBe(0);
    const repaired = repairCompetitiveRosterGaps(broken, createRNG("post-advance-repair"));
    expect(countRegisteredKeepers(repaired.clubs[clubId]!, repaired.players))
      .toBeGreaterThanOrEqual(1);
    expect(countRegisteredAtClub(repaired.clubs[clubId]!, repaired.players))
      .toBeGreaterThanOrEqual(COMPETITIVE_REGISTERED_FLOOR);
  }, 120_000);

  it("restocks a funded thin club up to the competitive registered floor", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Emg",
      scoutLastName: "Depth",
      scoutAge: 28,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "emergency-advance-depth",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });

    const generated = useGameStore.getState().gameState!;
    const clubId = Object.keys(generated.clubs).find((id) => {
      const entry = generated.clubs[id]!;
      return countRegisteredAtClub(entry, generated.players) >= COMPETITIVE_REGISTERED_FLOOR;
    })!;
    const club = generated.clubs[clubId]!;
    const keepers = Object.values(generated.players)
      .filter((player) => player.clubId === clubId && player.position === "GK");
    const keepIds = new Set(keepers.slice(0, 1).map((player) => player.id));
    const outfield = Object.values(generated.players)
      .filter((player) => player.clubId === clubId && player.position !== "GK")
      .slice(0, 6)
      .map((player) => player.id);
    const retained = new Set([...keepIds, ...outfield]);
    const players = { ...generated.players };
    for (const player of Object.values(players)) {
      if (player.clubId === clubId && !retained.has(player.id)) {
        players[player.id] = {
          ...player,
          clubId: "",
          contractClubId: undefined,
          contractExpiry: 0,
        };
      }
    }
    const state = {
      ...generated,
      players,
      clubs: {
        ...generated.clubs,
        [clubId]: {
          ...club,
          budget: Math.max(club.budget, 500_000),
          weeklyWageBudget: Math.max(club.weeklyWageBudget ?? 0, 50_000),
          playerIds: club.playerIds.filter((id) => retained.has(id)),
          academyPlayerIds: (club.academyPlayerIds ?? []).filter((id) => retained.has(id)),
        },
      },
      freeAgentPool: {
        agents: [],
        lastRefreshSeason: generated.currentSeason,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      currentWeek: Math.min(generated.currentWeek, 20),
    };
    expect(countRegisteredAtClub(state.clubs[clubId]!, state.players)).toBeLessThan(
      COMPETITIVE_REGISTERED_FLOOR,
    );

    const tick = processWeeklyTick(state, createRNG(`${state.seed}:emergency-advance-depth`));
    const next = advanceWeek(state, tick);
    expect(countRegisteredAtClub(next.clubs[clubId]!, next.players))
      .toBeGreaterThanOrEqual(COMPETITIVE_REGISTERED_FLOOR);
    expect(countRegisteredKeepers(next.clubs[clubId]!, next.players)).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
