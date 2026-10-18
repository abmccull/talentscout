import { test, expect } from "../fixtures";

test.describe("Placed alumni follow-up continuity", () => {
  test.setTimeout(180_000);

  for (const launchLiveSession of [false, true]) {
    test(`${launchLiveSession ? "interactive" : "automatic"} follow-up and family check stay on the signed dossier`, async ({ gamePage }, testInfo) => {
      await gamePage.goto();
      await gamePage.injectState({ currentWeek: 3, currentSeason: 1,
        scout: { primarySpecialization: "youth", careerTier: 2, reputation: 50, fatigue: 0 } });
      // A restored, already placed career is the boundary under test. Placement
      // acceptance itself is covered by academy-placement-case.spec.ts.
      const fixture = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const state = store.getState().gameState;
        const youth = Object.values(state.unsignedYouth).find((candidate: any) => !candidate.placed && !candidate.retired) as any;
        const club = Object.values(state.clubs).find((candidate: any) => candidate.academyPlayerIds) as any;
        if (!youth || !club) throw new Error("Placed-alumni fixture requires a youth and academy");
        const player = { ...youth.player, clubId: club.id };
        const caseId = `case_${state.scout.id}_${player.id}`;
        const unsignedYouth = { ...state.unsignedYouth }; delete unsignedYouth[youth.id];
        const observation = { id: "placed-continuity-original", playerId: player.id, scoutId: state.scout.id,
          week: 1, season: 1, context: "schoolMatch", attributeReadings: ["pace", "passing", "teamwork"].map(attribute => ({
            attribute, perceivedValue: player.attributes[attribute], confidence: 0.6, observationCount: 1,
          })), notes: ["Original pre-placement assessment."], flaggedMoments: [] };
        const restored = JSON.parse(JSON.stringify({ ...state, unsignedYouth,
          openingCase: undefined, activeSession: undefined,
          players: { ...state.players, [player.id]: player },
          clubs: { ...state.clubs, [club.id]: { ...club, academyPlayerIds: [...new Set([...club.academyPlayerIds, player.id])] } },
          observations: { ...state.observations, [observation.id]: observation },
          scoutingCases: { ...state.scoutingCases, [caseId]: { id: caseId, scoutId: state.scout.id, playerId: player.id,
            status: "placed", openedWeek: 1, openedSeason: 1, lastUpdatedWeek: 1, lastUpdatedSeason: 1,
            reportIds: [], listingIds: [], deliveryIds: [], decisionIds: [], placementReportIds: [], hypothesisIds: [], reviewIds: [] } },
          alumniRecords: [...state.alumniRecords, { id: `alumni_${youth.id}`, caseId, playerId: player.id,
            placedClubId: club.id, currentClubId: club.id, milestones: [], careerSnapshots: [], placedWeek: 1, placedSeason: 1,
            careerUpdates: [], currentStatus: "academy", seasonStats: [], becameContact: false }],
          schedule: { week: state.currentWeek, season: state.currentSeason, activities: Array(7).fill(null), completed: false },
        }));
        store.getState().loadGame(restored);
        store.getState().selectPlayer(player.id);
        store.getState().setScreen("playerProfile");
        return { playerId: player.id, name: `${player.firstName} ${player.lastName}`, youthId: youth.id,
          week: state.currentWeek, season: state.currentSeason,
          initialEvidenceIds: Object.keys(restored.observations) };
      });

      await gamePage.waitForScreen("playerProfile");
      await gamePage.page.getByRole("button", { name: "Schedule Follow-Up", exact: true }).click();
      await gamePage.waitForScreen("calendar");
      const itinerary = gamePage.page.locator('[data-tutorial-id="calendar-grid"]');
      await expect(itinerary).toContainText(fixture.name);
      const plannerTargets = await gamePage.page.evaluate(() => (window as any).__GAME_STORE__.getState()
        .getAvailableCalendarActivities().filter((activity: any) => ["followUpSession", "parentCoachMeeting"].includes(activity.type))
        .map((activity: any) => ({ type: activity.type, ids: (activity.targetPool ?? []).map((target: any) => target.id) })));
      expect(plannerTargets).toHaveLength(2);
      expect(plannerTargets.every((activity: { ids: string[] }) => activity.ids.includes(fixture.playerId))).toBe(true);
      await gamePage.page.evaluate(playerId => {
        const store = (window as any).__GAME_STORE__;
        store.getState().selectPlayer(playerId); store.getState().setScreen("playerProfile");
      }, fixture.playerId);
      await gamePage.waitForScreen("playerProfile");
      await gamePage.page.getByRole("button", { name: "Meet Parents/Coach", exact: true }).click();
      await gamePage.waitForScreen("calendar");
      await expect(itinerary).toContainText(fixture.name);
      await gamePage.page.screenshot({ path: testInfo.outputPath("placed-follow-up-planner.png"), fullPage: true });
      await gamePage.advanceCanonicalWeek({ launchLiveSession, maxLiveSessions: 1 });

      const result = await gamePage.page.evaluate(({ playerId, youthId, initialEvidenceIds, week, season }) => {
        const state = (window as any).__GAME_STORE__.getState().gameState;
        const evidence = (Object.values(state.observations) as any[]).filter(observation => observation.playerId === playerId
          && !initialEvidenceIds.includes(observation.id) && observation.week === week && observation.season === season);
        return { evidence, signedPlayerId: state.players[playerId]?.id, duplicateYouth: state.unsignedYouth[youthId]
          ?? Object.values(state.unsignedYouth).find((youth: any) => youth.player.id === playerId),
          casePlayerIds: Object.values(state.scoutingCases).filter((entry: any) => entry.playerId === playerId).map((entry: any) => entry.playerId) };
      }, fixture);
      const followUps = result.evidence.filter((observation: any) => observation.context === "followUpSession");
      const meetings = result.evidence.filter((observation: any) => observation.context === "parentCoachMeeting");
      expect(followUps).toHaveLength(1);
      expect(Boolean(followUps[0].sourceSessionId)).toBe(launchLiveSession);
      expect(followUps[0].activityInstanceId).toBeTruthy();
      expect(meetings).toHaveLength(1);
      expect(meetings[0].activityInstanceId).toBeTruthy();
      expect(meetings[0].attributeReadings).toEqual([]);
      expect(meetings[0].notes.join(" ")).toContain("Reported testimony");
      expect(result.signedPlayerId).toBe(fixture.playerId);
      expect(result.duplicateYouth).toBeUndefined();
      expect(result.casePlayerIds).toEqual([fixture.playerId]);
      await testInfo.attach("placed-follow-up-evidence.json", { body: JSON.stringify({ fixture, launchLiveSession, result }, null, 2), contentType: "application/json" });
      gamePage.expectNoConsoleErrors();
    });
  }
});
