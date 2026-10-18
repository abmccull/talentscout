// Copy to e2e/regression/canonical-career-facts.spec.ts before further product fixes.
import type { Page } from "@playwright/test";
import { test, expect, type GamePage } from "../fixtures";
import { expandPlayerMovementSummaries, type StoredPlayerMovementSummaries } from "@/engine/world/movementRowsArchive";
import { expandPlayerMovementSummary } from "@/engine/world/worldHistoryTypes";

async function factProjection(page: Page, setup: { season: number; ids: string[]; firstFixture: string; finalFixture: string }) {
  const facts = await page.evaluate(({ season, ids, firstFixture, finalFixture }) => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const completed = state.worldHistory?.seasons.find((row: any) => row.season === season);
    const expandRating = (entry: any) => Array.isArray(entry)
      ? { season: entry[0], avgRating: entry[1], appearances: entry[2], goals: entry[3], assists: entry[4], cleanSheets: entry[5] } : entry;
    const players = Object.fromEntries(ids.map(id => {
      const player = state.players[id] ?? state.retiredPlayers[id];
      const alumni = state.alumniRecords.find((record: any) => record.playerId === id);
      return [id, {
        active: Boolean(state.players[id]), retired: state.retiredPlayerIds.includes(id),
        clubId: player?.clubId, contractClubId: player?.contractClubId, onLoan: player?.onLoan ?? false,
        seasonRatings: (player?.seasonRatings ?? []).map(expandRating),
        worldPerformance: completed?.players.find((row: any) => row.playerId === id)?.performance,
        alumni: alumni ? { currentStatus: alumni.currentStatus, seasonStats: alumni.seasonStats,
          milestones: alumni.milestones, careerUpdates: alumni.careerUpdates } : null,
      }];
    }));
    return {
      date: [state.currentSeason, state.currentWeek], players,
      legacyScore: { youthFound: state.legacyScore.youthFound, firstTeamBreakthroughs: state.legacyScore.firstTeamBreakthroughs,
        internationalCapsFromFinds: state.legacyScore.internationalCapsFromFinds, totalScore: state.legacyScore.totalScore },
      retainedFixtures: { first: Boolean(state.fixtures[firstFixture]), final: Boolean(state.fixtures[finalFixture]) },
      retainedRatings: { first: Boolean(state.matchRatings[firstFixture]), final: Boolean(state.matchRatings[finalFixture]) },
      movements: completed?.playerMovementSummaries ?? [],
      alumniMessages: state.inbox.filter((message: any) => message.season === season && message.id.startsWith("alumni-") && ids.includes(message.relatedId))
        .map((message: any) => ({ id: message.id, relatedId: message.relatedId, body: message.body })),
      executionRoute: store.getState().lastWeeklyExecutionRoute,
    };
  }, setup);
  return {
    ...facts,
    movements: expandPlayerMovementSummaries(facts.movements as StoredPlayerMovementSummaries)
      .map(expandPlayerMovementSummary).filter((row) => setup.ids.includes(row.playerId)),
  };
}

async function openAlumniWorkspaceThroughCareer(gamePage: GamePage): Promise<void> {
  // Youth EA exposes records as a Career drill-down, not a separate sidebar item.
  await gamePage.navigateTo("career");
  const trackRecord = gamePage.page.getByRole("tab", { name: "Track Record", exact: true });
  await expect(trackRecord).toBeVisible();
  await trackRecord.click();
  await expect(trackRecord).toHaveAttribute("aria-selected", "true");
  const alumni = gamePage.page.getByTestId("career-record-drilldowns")
    .getByRole("button", { name: /^Alumni\b/ });
  await expect(alumni).toBeVisible();
  await expect(alumni).toBeEnabled();
  await alumni.click();
  await gamePage.waitForScreen("alumniDashboard");
}

test.describe("Canonical career facts across rollover and persistence", () => {
  test("keeps complete statistics through observed-subset pruning, actual retirement, loan return and manual save/reload", async ({ gamePage }) => {
    test.setTimeout(180_000);
    await gamePage.goto();
    await gamePage.injectState({ scout: { primarySpecialization: "youth", careerPath: "independent", careerTier: 3, fatigue: 0 } });
    const setup = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = structuredClone(store.getState().gameState);
      const season = state.currentSeason;
      const finalWeek = Math.max(...Object.values(state.fixtures).filter((fixture: any) => fixture.season === season).map((fixture: any) => fixture.week));
      const clubs = Object.values(state.clubs) as any[];
      const parent = clubs[0];
      const host = clubs.find(club => club.id !== parent.id && club.leagueId === parent.leagueId);
      const template = Object.values(state.players)[0] as any;
      if (!host || !template || finalWeek < 3) throw new Error("Coherent season checkpoint unavailable");
      const firstFixture = `e2e-facts-s${season}-first`;
      const finalFixture = `e2e-facts-s${season}-final`;
      const ids = ["e2e-facts-active", "e2e-facts-retiring", "e2e-facts-loan", "e2e-facts-released", "e2e-facts-retired-earlier"];
      const [activeId, retiringId, loanId, releasedId, retiredId] = ids;
      const makePlayer = (id: string, clubId: string, age: number) => ({ ...structuredClone(template), id, visualIdentity: undefined, firstName: "Canonical", lastName: id.replace("e2e-facts-", ""),
        clubId, contractClubId: clubId || undefined, age, position: "ST", currentAbility: 79, potentialAbility: 110,
        injured: false, injuryWeeksRemaining: 0, currentInjury: undefined, onLoan: false, contractExpiry: season + 4, wage: 500,
        recentMatchRatings: [], seasonRatings: [], retirementOutlook: undefined, });
      const active = makePlayer(activeId, host.id, 16);
      const retiring = makePlayer(retiringId, parent.id, 40);
      const loan = { ...makePlayer(loanId, host.id, 19), contractClubId: parent.id, onLoan: true, loanParentClubId: parent.id, loanEndWeek: finalWeek, loanEndSeason: season };
      const released = { ...makePlayer(releasedId, "", 17), currentAbility: 95, potentialAbility: 180 };
      const retired = makePlayer(retiredId, "", 41);
      state.players = { ...state.players, [activeId]: active, [retiringId]: retiring, [loanId]: loan, [releasedId]: released };
      state.retiredPlayers = { ...state.retiredPlayers, [retiredId]: retired };
      state.retiredPlayerIds = [...new Set([...state.retiredPlayerIds, retiredId])];
      for (const club of Object.values(state.clubs) as any[]) club.playerIds = club.playerIds.filter((id: string) => !ids.includes(id));
      parent.playerIds.push(retiringId);
      host.playerIds.push(activeId, loanId);
      parent.weeklyWageBudget = Math.max(parent.weeklyWageBudget ?? 0, 100_000_000);
      host.weeklyWageBudget = Math.max(host.weeklyWageBudget ?? 0, 100_000_000);
      const historicalTransfer = { id: "e2e-facts-transfer", playerId: activeId, type: "permanentTransfer", season, week: finalWeek - 1,
        fromClubId: parent.id, toClubId: host.id, contractClubId: host.id, fee: 1000 };
      state.playerMovementHistory = [...state.playerMovementHistory, historicalTransfer];
      const makeFixture = (id: string, week: number, homeGoals: number, awayGoals: number) => ({ id, season, week, played: true, homeClubId: parent.id,
        awayClubId: host.id, leagueId: parent.leagueId, homeGoals, awayGoals });
      state.fixtures = Object.fromEntries(Object.entries(state.fixtures).map(([id, fixture]: any) => [id, { ...fixture, played: true, homeGoals: 0, awayGoals: 0 }]));
      state.fixtures[firstFixture] = makeFixture(firstFixture, finalWeek - 2, 3, 0);
      state.fixtures[finalFixture] = makeFixture(finalFixture, finalWeek, 1, 3);
      const rating = (fixtureId: string, playerId: string, rating: number, goals: number, minutesPlayed = 90) => ({ fixtureId, playerId, rating, stats: { goals },
        started: minutesPlayed === 90, minutesPlayed, eventCount: 0, source: "simulated" });
      state.matchRatings = {
        [firstFixture]: { [activeId]: rating(firstFixture, activeId, 7.2, 1), [retiringId]: rating(firstFixture, retiringId, 7, 1),
          [loanId]: rating(firstFixture, loanId, 7.2, 0), [retiredId]: rating(firstFixture, retiredId, 6.8, 1), [releasedId]: rating(firstFixture, releasedId, 9.9, 99, 0) },
        [finalFixture]: { [activeId]: rating(finalFixture, activeId, 8.4, 2, 30), [retiringId]: rating(finalFixture, retiringId, 8, 1), [loanId]: rating(finalFixture, loanId, 8, 1) },
      };
      state.activeLoans = [{ id: "e2e-facts-loan-deal", playerId: loanId, parentClubId: parent.id, loanClubId: host.id, startWeek: finalWeek - 2, startSeason: season,
        endWeek: finalWeek, endSeason: season, loanFee: 0, wageContribution: 0, recallClause: false, status: "active", startCurrentAbility: loan.currentAbility,
        performanceRecord: { appearances: 2, goals: 1, assists: 0, avgRating: 7.6, developmentDelta: 0, parentClubSatisfaction: 60, loanClubSatisfaction: 65 } }];
      state.loanRecommendations = [];
      const makeAlumni = (id: string) => ({ id: `alumni-${id}`, playerId: id, placedClubId: parent.id, currentClubId: state.players[id]?.clubId ?? "",
        placedWeek: 1, placedSeason: season, careerSnapshots: [], careerUpdates: [], seasonStats: [], becameContact: false,
        currentStatus: id === releasedId ? "released" : id === retiredId ? "retired" : id === loanId ? "loaned" : "firstTeam",
        milestones: id === releasedId ? [] : [
          { type: "firstTeamDebut", sourceId: firstFixture, week: finalWeek - 2, season, description: "Recorded senior appearance.", notified: true },
          ...(id === loanId ? [] : [{ type: "firstGoal", sourceId: firstFixture, week: finalWeek - 2, season, description: "Recorded professional goal.", notified: true }]),
        ] });
      state.alumniRecords = ids.map(makeAlumni);
      state.observations = { "e2e-facts-observed": { id: "e2e-facts-observed", playerId: activeId, scoutId: state.scout.id, matchId: firstFixture,
        week: finalWeek - 2, season, context: "liveMatch", attributeReadings: [], notes: ["Observed first fixture."], flaggedMoments: [] } };
      state.playedFixtures = [];
      state.rivalActivities = [];
      state.currentWeek = finalWeek;
      state.schedule = { week: finalWeek, season, activities: Array(7).fill(null), completed: false };
      store.getState().loadGame(state);
      return { season, ids, firstFixture, finalFixture, parentId: parent.id, hostId: host.id };
    });
    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    const after = await factProjection(gamePage.page, setup);
    await test.info().attach("rollover-facts-before-assertions.json", { body: JSON.stringify({ setup, after }, null, 2), contentType: "application/json" });
    expect(after.date).toEqual([setup.season + 1, 1]);
    expect(after.executionRoute).toBe("worker");
    expect(after.legacyScore).toEqual({ youthFound: 5, firstTeamBreakthroughs: 4, internationalCapsFromFinds: 0, totalScore: 105 });
    expect(after.retainedFixtures).toEqual({ first: true, final: false });
    expect(after.retainedRatings).toEqual({ first: true, final: false });
    const expected = [[2, 3, 7.8], [2, 2, 7.5], [2, 1, 7.6], [0, 0, 0], [1, 1, 6.8]];
    setup.ids.forEach((id, index) => {
      const row = after.players[id];
      if (!row.alumni) throw new Error(`Missing preserved alumni identity: ${id}`);
      const [appearances, goals, avgRating] = expected[index];
      if (appearances === 0) {
        expect(row.seasonRatings).toEqual([]);
        expect(row.worldPerformance).toBeUndefined();
        expect(row.alumni.milestones).toEqual([]);
        return;
      }
      expect(row.seasonRatings.find((entry: any) => entry.season === setup.season)).toMatchObject({ appearances, goals, avgRating });
      expect(row.worldPerformance, id).toMatchObject({ appearances, goals, averageRating: avgRating });
      expect(row.alumni.seasonStats.find((entry: any) => entry.season === setup.season)).toMatchObject({ appearances, goals, avgRating, source: "canonicalCompetition" });
    });
    expect(after.players[setup.ids[1]]).toMatchObject({ active: false, retired: true, alumni: { currentStatus: "retired" } });
    expect(after.players[setup.ids[2]]).toMatchObject({ clubId: setup.parentId, contractClubId: setup.parentId, onLoan: false });
    expect(after.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: setup.ids[0], type: "permanentTransfer", fromClubId: setup.parentId, toClubId: setup.hostId }),
      expect.objectContaining({ playerId: setup.ids[1], type: "retirement" }),
      expect.objectContaining({ playerId: setup.ids[2], type: "loanReturn", fromClubId: setup.hostId, toClubId: setup.parentId }),
    ]));
    expect(after.players[setup.ids[2]].alumni?.careerUpdates).toEqual(expect.arrayContaining([expect.objectContaining({ type: "loanMove", sourceId: expect.any(String) })]));
    expect(new Set(after.alumniMessages.map((message: any) => message.id)).size).toBe(after.alumniMessages.length);
    await openAlumniWorkspaceThroughCareer(gamePage);
    await expect(gamePage.page.getByText("First Team Breakthroughs", { exact: true }).locator("..").locator("p").last()).toHaveText("4");
    await expect(gamePage.page.getByText("total legacy points", { exact: true }).locator("..").locator("p").first()).toHaveText("105");
    await expect(gamePage.page.getByRole("button", { name: "Expand alumni record for Canonical retired-earlier", exact: true })).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: "Expand alumni record for Canonical retiring", exact: true })).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: "Expand alumni record for Unknown Player", exact: true })).toHaveCount(0);
    await gamePage.page.screenshot({ path: test.info().outputPath("retired-alumni-identity.png"), fullPage: true });

    await gamePage.page.evaluate(async () => { await (window as any).__GAME_STORE__.getState().saveToSlot(5, "Canonical rollover proof"); });
    await gamePage.page.reload();
    await gamePage.page.waitForFunction(() => Boolean((window as any).__GAME_STORE__));
    await gamePage.page.evaluate(async () => { await (window as any).__GAME_STORE__.getState().loadFromSlot(5); });
    await gamePage.waitForScreen("dashboard");
    const reloaded = await factProjection(gamePage.page, setup);
    expect({ ...reloaded, executionRoute: undefined }).toEqual({ ...after, executionRoute: undefined });
    await openAlumniWorkspaceThroughCareer(gamePage);
    await expect(gamePage.page.getByRole("button", { name: "Expand alumni record for Canonical retired-earlier", exact: true })).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: "Expand alumni record for Canonical retiring", exact: true })).toBeVisible();
    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    const next = await factProjection(gamePage.page, setup);
    expect(next.legacyScore).toEqual(after.legacyScore);
    expect(next.alumniMessages).toEqual(after.alumniMessages);
    setup.ids.forEach(id => expect(next.players[id].seasonRatings.filter((entry: any) => entry.season === setup.season))
      .toEqual(after.players[id].seasonRatings.filter((entry: any) => entry.season === setup.season)));
    await test.info().attach("canonical-career-facts.json", { body: JSON.stringify({ scope: "Browser calendar -> canonical worker/store rollover -> save provider -> browser reload -> subsequent week", setup, after, reloaded, next }, null, 2), contentType: "application/json" });
    gamePage.expectNoConsoleErrors();
  });

  test("keeps unsupported legacy history without presenting it as verified reputation or season achievement", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({ scout: { primarySpecialization: "youth", careerTier: 3 } });
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const player = Object.values(state.players)[0] as any;
      const record = { id: "e2e-legacy-unsupported", playerId: player.id, placedClubId: player.clubId, currentClubId: player.clubId,
        placedWeek: 1, placedSeason: state.currentSeason, currentStatus: "academy", careerSnapshots: [], seasonStats: [], becameContact: false,
        milestones: [{ type: "firstTeamDebut", week: 1, season: state.currentSeason, description: "UNVERIFIED_LEGACY_DEBUT", notified: true },
          { type: "internationalCallUp", week: 1, season: state.currentSeason, description: "UNVERIFIED_LEGACY_CALLUP", notified: true }],
        careerUpdates: [{ type: "debut", week: 1, season: state.currentSeason, description: "UNVERIFIED_LEGACY_DEBUT" }] };
      store.getState().loadGame({ ...state, alumniRecords: [record] });
    });
    await gamePage.navigateTo("dashboard");
    await expect(gamePage.page.getByText(/1 of your names have debuted\. Clubs still weigh that record\./)).toHaveCount(0);
    await gamePage.navigateTo("career");
    // Old narrative may remain in history, but this season-review surface must
    // either suppress it or visibly label its lack of verified source evidence.
    const review = gamePage.page.getByText(/UNVERIFIED_LEGACY_CALLUP|UNVERIFIED_LEGACY_DEBUT/);
    if (await review.count()) {
      await expect(review.first().locator("..")).toContainText(/legacy|unverified|source unavailable/i);
    }
    const preserved = await gamePage.page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.alumniRecords[0].milestones);
    expect(preserved).toHaveLength(2);
    gamePage.expectNoConsoleErrors();
  });

  test("recovers a missing verified debut and goal from the earliest known appearance without rewriting unsupported legacy history", async ({ gamePage }) => {
    test.setTimeout(120_000);
    await gamePage.goto();
    await gamePage.injectState({ currentWeek: 3, scout: { primarySpecialization: "youth", careerPath: "independent", careerTier: 3 } });
    const setup = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = structuredClone(store.getState().gameState);
      const player = Object.values(state.players)[0] as any;
      const club = state.clubs[player.clubId];
      const opponent = (Object.values(state.clubs) as any[]).find(row => row.id !== club.id && row.leagueId === club.leagueId);
      if (!opponent) throw new Error("Provenance recovery opponent unavailable");
      const firstSeason = state.currentSeason;
      state.currentSeason = firstSeason + 1;
      const firstId = `e2e-provenance-s${firstSeason}-first`;
      const currentId = `e2e-provenance-s${state.currentSeason}-current`;
      state.fixtures = Object.fromEntries(Object.entries(state.fixtures).map(([id, fixture]: any) => [id, { ...fixture, season: state.currentSeason, played: true, homeGoals: 0, awayGoals: 0 }]));
      for (const league of Object.values(state.leagues) as any[]) league.season = state.currentSeason;
      const fixture = (id: string, week: number) => ({ id, week, season: state.currentSeason, played: true, homeClubId: club.id, awayClubId: opponent.id,
        leagueId: club.leagueId, homeGoals: 1, awayGoals: 0 });
      state.fixtures[firstId] = fixture(firstId, 2);
      // Real legacy fixtures encode their year in the ID. No explicit season
      // is stored; load/core normalization and alumni provenance must agree.
      delete state.fixtures[firstId].season;
      state.fixtures[currentId] = fixture(currentId, 3);
      const rating = (fixtureId: string) => ({ fixtureId, playerId: player.id, started: false, minutesPlayed: 30, rating: 7.2, eventCount: 0, stats: { goals: 1 }, source: "simulated" });
      state.matchRatings = { [firstId]: { [player.id]: rating(firstId) }, [currentId]: { [player.id]: rating(currentId) } };
      state.alumniRecords = [{ id: "e2e-provenance-alumni", playerId: player.id, placedClubId: club.id, currentClubId: club.id, placedWeek: 1, placedSeason: firstSeason,
        currentStatus: "academy", careerUpdates: [], careerSnapshots: [], seasonStats: [], becameContact: false,
        milestones: [{ type: "firstTeamDebut", week: 1, season: firstSeason, description: "Preserve unsupported old story", notified: true }] }];
      state.observations = { "e2e-provenance-observed": { id: "e2e-provenance-observed", playerId: player.id, scoutId: state.scout.id, matchId: firstId,
        week: 2, season: firstSeason, context: "liveMatch", attributeReadings: [], notes: ["Retained prior-season evidence."], flaggedMoments: [] } };
      state.currentWeek = 3;
      state.schedule = { week: 3, season: state.currentSeason, activities: Array(7).fill(null), completed: false };
      store.getState().loadGame(state);
      return { playerId: player.id, season: firstSeason, firstId };
    });
    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    const recovered = await gamePage.page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.alumniRecords[0]);
    expect(recovered.milestones).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: "Preserve unsupported old story", week: 1 }),
      expect.objectContaining({ type: "firstTeamDebut", sourceId: setup.firstId, week: 2, season: setup.season }),
      expect.objectContaining({ type: "firstGoal", sourceId: setup.firstId, week: 2, season: setup.season }),
    ]));
    expect(recovered.milestones).toHaveLength(3);
    await gamePage.advanceCanonicalWeek();
    const repeated = await gamePage.page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.alumniRecords[0]);
    expect(repeated.milestones).toEqual(recovered.milestones);
    await test.info().attach("alumni-provenance-recovery.json", { body: JSON.stringify({ setup, recovered, repeated }, null, 2), contentType: "application/json" });
    gamePage.expectNoConsoleErrors();
  });
});
