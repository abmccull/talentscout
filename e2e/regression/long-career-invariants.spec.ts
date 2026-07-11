import { test, expect } from "../fixtures";

test.describe("Long-career world invariants", () => {
  test("youth world remains coherent across ten seasons", async ({ gamePage }) => {
    test.setTimeout(180_000);
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      scout: {
        careerTier: 1,
        primarySpecialization: "youth",
        careerPath: "independent",
        firstName: "Soak",
        lastName: "Scout",
        fatigue: 10,
      },
    });

    const result = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const initial = store.getState().gameState;
      const initialYouth = new Map(
        Object.values(initial.unsignedYouth).map((youth: any) => [
          youth.player.id,
          {
            currentAbility: youth.player.currentAbility,
            attributes: JSON.stringify(youth.player.attributes),
          },
        ]),
      );

      const advanceSafely = (weeks: number) => {
        const before = store.getState().gameState;
        if (before.scout.fatigue >= 90) {
          store.getState().loadGame({
            ...before,
            scout: { ...before.scout, fatigue: 15 },
          });
        }
        store.getState().batchAdvance(weeks);
      };

      for (let i = 0; i < 6; i++) advanceSafely(5);
      const afterThirtyWeeks = store.getState().gameState;
      const developedUnsignedYouth = Object.values(afterThirtyWeeks.unsignedYouth).filter(
        (youth: any) => {
          const before = initialYouth.get(youth.player.id) as any;
          return before && (
            before.currentAbility !== youth.player.currentAbility
            || before.attributes !== JSON.stringify(youth.player.attributes)
          );
        },
      ).length;

      const targetSeason = initial.currentSeason + 10;
      let safety = 0;
      while (store.getState().gameState.currentSeason < targetSeason && safety < 300) {
        advanceSafely(52);
        safety++;
      }

      const state = store.getState().gameState;
      const rosterErrors: string[] = [];
      for (const club of Object.values(state.clubs) as any[]) {
        const senior = club.playerIds ?? [];
        const academy = club.academyPlayerIds ?? [];
        if (new Set(senior).size !== senior.length) rosterErrors.push(`${club.id}:duplicate-senior`);
        if (new Set(academy).size !== academy.length) rosterErrors.push(`${club.id}:duplicate-academy`);
        for (const playerId of senior) {
          const player = state.players[playerId];
          if (!player) rosterErrors.push(`${club.id}:missing-senior:${playerId}`);
          else if (player.clubId !== club.id) rosterErrors.push(`${club.id}:wrong-senior:${playerId}`);
          if (academy.includes(playerId)) rosterErrors.push(`${club.id}:dual-roster:${playerId}`);
        }
        for (const playerId of academy) {
          const player = state.players[playerId];
          if (!player) rosterErrors.push(`${club.id}:missing-academy:${playerId}`);
          else if (player.clubId !== club.id) rosterErrors.push(`${club.id}:wrong-academy:${playerId}`);
          else if (player.age >= 18) rosterErrors.push(`${club.id}:unpromoted:${playerId}`);
        }
      }

      const unsignedYouthErrors = Object.values(state.unsignedYouth).filter((youth: any) =>
        youth.player.currentAbility > youth.player.potentialAbility
        || Object.values(youth.player.attributes).some(
          (value: any) => value < 1 || value > 20,
        ),
      ).length;

      const lifecycleErrors: string[] = [];
      const activeLoanPlayerIds = new Set<string>();
      for (const deal of state.activeLoans ?? []) {
        if (activeLoanPlayerIds.has(deal.playerId)) lifecycleErrors.push(`duplicate-active-loan:${deal.playerId}`);
        activeLoanPlayerIds.add(deal.playerId);
        const player = state.players[deal.playerId];
        if (!player) lifecycleErrors.push(`loan-missing-player:${deal.id}`);
        else {
          if (!player.onLoan) lifecycleErrors.push(`loan-flag-missing:${deal.id}`);
          if (player.clubId !== deal.loanClubId) lifecycleErrors.push(`loan-registration:${deal.id}`);
          if (player.contractClubId !== deal.parentClubId) lifecycleErrors.push(`loan-owner:${deal.id}`);
        }
        if (!state.clubs[deal.parentClubId]?.loanedOutPlayerIds?.includes(deal.playerId)) {
          lifecycleErrors.push(`loan-parent-roster:${deal.id}`);
        }
        if (!state.clubs[deal.loanClubId]?.loanedInPlayerIds?.includes(deal.playerId)) {
          lifecycleErrors.push(`loan-host-roster:${deal.id}`);
        }
      }
      const poolPlayerIds = new Set((state.freeAgentPool?.agents ?? []).map((agent: any) => agent.playerId));
      for (const [playerId, player] of Object.entries(state.players) as Array<[string, any]>) {
        const owner = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
        if (!Number.isFinite(player.marketValue) || player.marketValue < 0) {
          lifecycleErrors.push(`invalid-market-value:${playerId}`);
        }
        if (!owner) {
          if (!poolPlayerIds.has(playerId)) lifecycleErrors.push(`unowned-not-in-pool:${playerId}`);
        } else if (!state.clubs[owner]) {
          lifecycleErrors.push(`missing-contract-club:${playerId}`);
        } else if (!player.onLoan && player.clubId !== owner) {
          lifecycleErrors.push(`owner-registration-mismatch:${playerId}`);
        }
      }
      for (const agent of state.freeAgentPool?.agents ?? []) {
        const player = state.players[agent.playerId];
        if (!player) lifecycleErrors.push(`pool-missing-player:${agent.playerId}`);
        else if (player.clubId || player.contractClubId) lifecycleErrors.push(`pool-dual-owner:${agent.playerId}`);
        if (agent.status !== "available" && agent.status !== "inNegotiation") {
          lifecycleErrors.push(`stale-pool-status:${agent.playerId}:${agent.status}`);
        }
      }
      if (new Set(state.retiredPlayerIds ?? []).size !== (state.retiredPlayerIds ?? []).length) {
        lifecycleErrors.push("duplicate-retired-id");
      }
      for (const playerId of state.retiredPlayerIds ?? []) {
        if (state.players[playerId]) lifecycleErrors.push(`retired-still-active:${playerId}`);
        if (!state.retiredPlayers?.[playerId]) lifecycleErrors.push(`retired-not-archived:${playerId}`);
        if (poolPlayerIds.has(playerId)) lifecycleErrors.push(`retired-in-pool:${playerId}`);
      }
      const loanHistoryIds = (state.loanHistory ?? []).map((deal: any) => deal.id);
      if (new Set(loanHistoryIds).size !== loanHistoryIds.length) {
        lifecycleErrors.push("duplicate-loan-history");
      }

      return {
        reachedSeason: state.currentSeason,
        targetSeason,
        developedUnsignedYouth,
        rosterErrors,
        unsignedYouthErrors,
        lifecycleErrors,
        subRegionCount: Object.keys(state.subRegions ?? {}).length,
        familiarSubRegionCount: Object.values(state.subRegions ?? {}).filter(
          (subRegion: any) => subRegion.familiarity > 0,
        ).length,
        specializationLevel: state.scout.specializationLevel,
        specializationXp: state.scout.specializationXp,
      };
    });

    expect(result.developedUnsignedYouth).toBeGreaterThan(0);
    expect(result.reachedSeason).toBeGreaterThanOrEqual(result.targetSeason);
    expect(result.rosterErrors).toEqual([]);
    expect(result.unsignedYouthErrors).toBe(0);
    expect(result.lifecycleErrors).toEqual([]);
    expect(result.subRegionCount).toBeGreaterThan(0);
    expect(result.familiarSubRegionCount).toBeGreaterThan(0);
    expect(result.specializationLevel).toBeGreaterThan(1);
    expect(result.specializationXp).toBeGreaterThanOrEqual(0);
    gamePage.expectNoConsoleErrors();
  });
});
