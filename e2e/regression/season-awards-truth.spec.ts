import { test, expect, type GamePage } from "../fixtures";

type EvidenceMode = "complete" | "no-prior" | "unplayed";
async function seedAwardSeason(gamePage: GamePage, mode: EvidenceMode) {
  await gamePage.goto();
  await gamePage.injectState({ scout: { primarySpecialization: "youth", careerPath: "independent", fatigue: 0 } });
  return gamePage.page.evaluate(({ mode }) => {
    const store = (window as any).__GAME_STORE__;
    const state = structuredClone(store.getState().gameState);
    const season = 2;
    // The negative checkpoint has a real final bye. The canonical calendar
    // has a 38-week floor; its detailed matches end before that boundary.
    const finalWeek = mode === "unplayed" ? 38
      : Math.max(...Object.values(state.fixtures).map((fixture: any) => fixture.week));
    const clubs = Object.values(state.clubs) as any[];
    const parent = clubs[0];
    const host = clubs.find(club => club.id !== parent.id && club.leagueId === parent.leagueId);
    const template = Object.values(state.players)[0] as any;
    if (!host || !template || finalWeek < 6) throw new Error("Award checkpoint unavailable");
    state.currentSeason = season;
    state.currentWeek = finalWeek;
    state.totalWeeksPlayed = finalWeek * 2 - 1;
    state.schedule = { week: finalWeek, season, activities: Array(7).fill(null), completed: false };
    for (const league of Object.values(state.leagues) as any[]) {
      league.season = season;
      if (mode === "unplayed" && league.coverageTier === "abstract") {
        // Keep ordinary abstract simulation enabled. A ten-club competition
        // has at most 18 rounds, whose final round precedes Week 38.
        league.clubIds = [...new Set(league.clubIds)].slice(0, 10);
      }
    }
    for (const player of Object.values(state.players) as any[]) player.seasonRatings = [];
    state.fixtures = Object.fromEntries(Object.entries(state.fixtures)
      .filter(([, fixture]: any) => mode !== "unplayed" || fixture.week < finalWeek)
      .map(([id, fixture]: any) => [id, { ...fixture, season, played: true, homeGoals: 0, awayGoals: 0 }]));
    if (mode === "unplayed") for (const player of Object.values(state.retiredPlayers ?? {}) as any[]) player.seasonRatings = [];
    state.matchRatings = {};
    const ids = { scorer: "award-recorded-scorer", young: "award-recorded-young", breakthrough: "award-recorded-breakthrough",
      stable: "award-recorded-stable", hidden: "award-unplayed-hidden", thin: "award-single-appearance", moved: "award-recorded-transfer" };
    const makePlayer = (id: string, name: string, age: number) => ({ ...structuredClone(template), id, visualIdentity: undefined,
      firstName: "Awards", lastName: name, age, clubId: host.id, contractClubId: host.id, contractExpiry: season + 5,
      position: "CM", currentAbility: 60, potentialAbility: 80, marketValue: 1_000, wage: 500,
      injured: false, currentInjury: undefined, injuryWeeksRemaining: 0, onLoan: false,
      loanParentClubId: undefined, loanEndWeek: undefined, loanEndSeason: undefined,
      recentMatchRatings: [], seasonRatings: [], retirementOutlook: undefined });
    const players: any[] = [
      { ...makePlayer(ids.scorer, "RecordedScorer", 40), position: "ST" },
      makePlayer(ids.young, "RecordedYoung", 21),
      makePlayer(ids.breakthrough, "VerifiedBreakthrough", 24),
      { ...makePlayer(ids.stable, "HighPotentialDecline", 25), currentAbility: 190, potentialAbility: 200 },
      { ...makePlayer(ids.hidden, "UnplayedHidden", 20), position: "ST", currentAbility: 199, potentialAbility: 199,
        marketValue: 100_000_000, form: 10, attributes: { ...template.attributes, shooting: 20 } },
      { ...makePlayer(ids.thin, "SingleAppearance", 19), currentAbility: 198, potentialAbility: 199 },
      makePlayer(ids.moved, "RecordedTransfer", 26),
    ];
    for (const player of players) state.players[player.id] = player;
    host.playerIds = [...host.playerIds, ...players.map(player => player.id)];
    host.weeklyWageBudget = 100_000_000;
    parent.weeklyWageBudget = 100_000_000;
    const performance = (averageRating: number) => ({ appearances: 6, starts: 6, minutesPlayed: 540,
      appearancesWithoutMinutes: 0, averageRating, goals: 0, assists: 0, cleanSheets: 0 });
    state.worldHistory = { version: 1, latestRecordedSeason: 1, seasons: [{ season: 1, recordedAfterTotalWeeks: finalWeek,
      leagues: [], clubs: [], playerMovementSummaries: [], players: mode === "complete" ? [
        { playerId: ids.breakthrough, firstName: "Awards", lastName: "VerifiedBreakthrough", age: 23, position: "CM",
          currentAbility: 55, marketValue: 1000, registeredClubId: host.id, contractClubId: host.id,
          status: "contracted", movementEventIds: [], performance: performance(6.2) },
        { playerId: ids.stable, firstName: "Awards", lastName: "HighPotentialDecline", age: 24, position: "CM",
          currentAbility: 190, marketValue: 1000, registeredClubId: host.id, contractClubId: host.id,
          status: "contracted", movementEventIds: [], performance: performance(8.4) },
      ] : [] }] };
    // A legacy aggregate without the prior canonical WorldHistory record must
    // not become an invented zero baseline or a new breakthrough entitlement.
    if (mode === "no-prior") state.players[ids.breakthrough].seasonRatings = [[1, 1, 6, 0, 0, 0]];
    state.discoveryRecords = [ids.breakthrough, ids.stable, ids.hidden].map(playerId => ({ playerId,
      discoveredWeek: 1, discoveredSeason: season, initialCA: state.players[playerId].currentAbility,
      initialPA: state.players[playerId].potentialAbility, careerSnapshots: [], wasWonderkid: false }));
    state.playerMovementHistory = mode === "unplayed" ? [] : [
      { id: "award-real-transfer", playerId: ids.moved, type: "permanentTransfer", season, week: finalWeek - 2,
        fromClubId: parent.id, toClubId: host.id, contractClubId: host.id, fee: 250_000 },
      { id: "award-smaller-transfer", playerId: ids.young, type: "permanentTransfer", season, week: finalWeek - 3,
        fromClubId: parent.id, toClubId: host.id, contractClubId: host.id, fee: 50_000 },
      { id: "award-prior-transfer", playerId: ids.hidden, type: "permanentTransfer", season: 1, week: 1,
        fromClubId: parent.id, toClubId: host.id, fee: 99_000_000 },
      { id: "award-loan-fee", playerId: ids.hidden, type: "loanStart", season, week: 1,
        fromClubId: parent.id, toClubId: host.id, fee: 98_000_000 },
    ];
    if (mode !== "unplayed") for (let index = 0; index < 6; index++) {
      const id = `award-s${season}-fact-${index}`;
      state.fixtures[id] = { id, season, week: index === 5 ? finalWeek : index + 1, played: true,
        homeClubId: host.id, awayClubId: parent.id, leagueId: host.leagueId, homeGoals: 5, awayGoals: 0 };
      const rating = (playerId: string, value: number, goals = 0, minutesPlayed = 90) => ({ playerId, fixtureId: id,
        started: true, minutesPlayed, rating: value, eventCount: 0, stats: { goals }, source: "simulated" });
      state.matchRatings[id] = {
        [ids.scorer]: rating(ids.scorer, 7.2, index < 3 ? 2 : 1),
        [ids.young]: rating(ids.young, 8.0, index < 2 ? 1 : 0),
        [ids.breakthrough]: rating(ids.breakthrough, 7.9),
        [ids.stable]: rating(ids.stable, 7.0),
        [ids.hidden]: rating(ids.hidden, 9.9, 99, 0),
        ...(index === 0 ? { [ids.thin]: rating(ids.thin, 9.7, 1) } : {}),
      };
    }
    state.observations = {};
    state.alumniRecords = [];
    state.seasonAwardsData = undefined;
    store.getState().loadGame(state);
    return { ids, season, finalWeek, hostName: host.name,
      boundaryFixtureCount: Object.values(state.fixtures).filter((fixture: any) => fixture.season === season && fixture.week === finalWeek).length };
  }, { mode });
}

test.describe("Recorded season awards", () => {
  for (const mode of ["complete", "no-prior", "unplayed"] as EvidenceMode[]) {
    test(`uses canonical facts across rollover and save/reload (${mode})`, async ({ gamePage }) => {
      test.setTimeout(180_000);
      const setup = await seedAwardSeason(gamePage, mode);
      await gamePage.navigateTo("calendar");
      if (mode === "unplayed") expect(setup.boundaryFixtureCount).toBe(0);
      await gamePage.advanceCanonicalWeek({ acknowledgeSeasonReview: false });
      // The first gameState publication occurs before the simulation caller
      // clears its recovery UI. Save only after that canonical handoff settles.
      await gamePage.page.waitForFunction(() => {
        const state = (window as any).__GAME_STORE__.getState();
        return !state.isAdvancingWeek && state.weekSimulation === null;
      }, undefined, { timeout: 10_000 });
      const actual = await gamePage.page.evaluate((sourceSeason) => {
        const store = (window as any).__GAME_STORE__.getState();
        const players = Object.values({ ...store.gameState.players, ...store.gameState.retiredPlayers }) as any[];
        const archivedAppearances = players.reduce((sum, player) => sum + (player.seasonRatings ?? []).reduce(
          (total: number, row: any) => total + ((Array.isArray(row) ? row[0] : row.season) === sourceSeason
            ? (Array.isArray(row) ? row[2] : row.appearances) : 0), 0), 0);
        return { awards: structuredClone(store.gameState.seasonAwardsData), route: store.lastWeeklyExecutionRoute,
          archivedAppearances, retired: store.gameState.retiredPlayerIds.includes("award-recorded-scorer") };
      }, setup.season);
      await test.info().attach(`recorded-awards-${mode}.json`, { body: JSON.stringify({ setup, actual }, null, 2), contentType: "application/json" });
      expect(actual.route).toBe("worker");
      expect(actual.awards?.season).toBe(setup.season);
      const awards = actual.awards.leagueAwards;
      const award = (id: string) => awards.find((row: any) => row.id === id);
      if (mode === "unplayed") {
        // A genuine bye must not silently replace this with real generated
        // appearances. Preserve the empty-awards assertion after proving it.
        expect(actual.archivedAppearances).toBe(0);
        expect(awards).toEqual([]);
      }
      else {
        expect(actual.retired).toBe(true);
        expect(award("golden-boot")).toMatchObject({ relatedPlayerId: setup.ids.scorer, stat: "Awards RecordedScorer — 9 goals" });
        expect(award("best-young-player")).toMatchObject({ relatedPlayerId: setup.ids.young });
        expect(award("best-young-player").stat).toContain("8.0");
        expect(award("best-young-player").stat).toContain("6 appearances");
        expect(award("best-young-player").stat).toContain("(21)");
        expect(award("biggest-transfer")).toMatchObject({ relatedPlayerId: setup.ids.moved,
          stat: `Awards RecordedTransfer — ${setup.hostName} (£250K)` });
        if (mode === "complete") {
          expect(award("breakthrough-discovery")).toMatchObject({ relatedPlayerId: setup.ids.breakthrough });
          expect(award("breakthrough-discovery").stat).toContain("6.2 to 7.9");
        } else expect(award("breakthrough-discovery")).toBeUndefined();
      }
      expect(JSON.stringify(awards)).not.toMatch(/\bCA\b|\bPA\b|star potential|highest-potential/i);
      // Inspect the actual rollover review while publicly presented.
      await expect(gamePage.page.getByRole("heading", { name: `Season ${setup.season} Complete`, exact: true })).toBeVisible();
      if (mode !== "unplayed") {
        await gamePage.page.locator("summary").filter({ hasText: "Around the league" }).click();
        await expect(gamePage.page.getByText("Awards RecordedScorer — 9 goals", { exact: true })).toBeVisible();
      } else await expect(gamePage.page.getByRole("heading", { name: "Around the league", exact: true })).toHaveCount(0);
      await gamePage.page.screenshot({ path: test.info().outputPath(`recorded-awards-${mode}.png`), fullPage: true });
      await gamePage.page.evaluate(async () => { await (window as any).__GAME_STORE__.getState().saveToSlot(5, "Recorded season awards proof"); });
      expect(await gamePage.continueCanonicalSeasonReview(setup.season)).toBe(true);
      await gamePage.page.reload();
      await gamePage.page.waitForFunction(() => Boolean((window as any).__GAME_STORE__));
      await gamePage.page.evaluate(async () => { await (window as any).__GAME_STORE__.getState().loadFromSlot(5); });
      await gamePage.waitForScreen("dashboard");
      const persisted = await gamePage.page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.seasonAwardsData);
      expect(persisted.leagueAwards).toEqual(awards);
      // This detail has no sidebar entry; reload proves its persisted facts.
      gamePage.expectNoConsoleErrors();
    });
  }
});
