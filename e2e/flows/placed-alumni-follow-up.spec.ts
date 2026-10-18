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
        const player = { ...youth.player, firstName: "Alessandro", lastName: "Montgomery-Worthington", clubId: club.id };
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
      const plannerLayout: unknown[] = [];
      for (const viewport of [{ width: 1280, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
        await gamePage.page.setViewportSize(viewport);
        // Keep the real notification behavior; use its existing player control
        // to make these layout evidence captures unobscured.
        const dismissAchievement = gamePage.page.getByRole("button", { name: "Dismiss achievement notification", exact: true });
        if (await dismissAchievement.isVisible()) await dismissAchievement.click();
        await expect(gamePage.page.getByRole("status", { name: /^Achievements unlocked:/ })).toHaveCount(0);
        for (const type of ["followUpSession", "parentCoachMeeting"]) {
          const day = itinerary.locator(`[data-planner-day-index][data-activity-type="${type}"]`).first();
          await day.scrollIntoViewIfNeeded();
          await expect(day.getByTestId("planner-activity-target")).toHaveText(fixture.name);
          const measurement = await day.evaluate((element) => {
            const dayRect = element.getBoundingClientRect();
            const texts = ["planner-activity-label", "planner-activity-target"].map((testId) => {
              const text = element.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
              const range = document.createRange(); range.selectNodeContents(text);
              const rect = range.getBoundingClientRect();
              const style = getComputedStyle(text);
              const unobscured = [...range.getClientRects()].every(line => {
                const hit = document.elementFromPoint(line.left + line.width / 2, line.top + line.height / 2);
                return hit === text || Boolean(hit && text.contains(hit));
              });
              return { testId, text: text.textContent, left: rect.left, right: rect.right,
                top: rect.top, bottom: rect.bottom, clientWidth: text.clientWidth,
                scrollWidth: text.scrollWidth, clientHeight: text.clientHeight,
                scrollHeight: text.scrollHeight, lineClamp: style.webkitLineClamp,
                textOverflow: style.textOverflow, unobscured };
            });
            return { day: { left: dayRect.left, right: dayRect.right, top: dayRect.top, bottom: dayRect.bottom }, texts };
          });
          for (const text of measurement.texts) {
            expect(text.left, `${type} ${text.testId} left at ${viewport.width}`).toBeGreaterThanOrEqual(measurement.day.left);
            expect(text.right, `${type} ${text.testId} right at ${viewport.width}`).toBeLessThanOrEqual(measurement.day.right);
            expect(text.top).toBeGreaterThanOrEqual(measurement.day.top);
            expect(text.bottom).toBeLessThanOrEqual(measurement.day.bottom);
            expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth + 1);
            expect(text.scrollHeight).toBeLessThanOrEqual(text.clientHeight + 1);
            expect(text.lineClamp).toBe("none");
            expect(text.textOverflow).not.toBe("ellipsis");
            expect(text.unobscured, `${type} ${text.testId} unobscured at ${viewport.width}`).toBe(true);
          }
          plannerLayout.push({ viewport, type, ...measurement });
        }
        await gamePage.page.screenshot({ path: testInfo.outputPath(`placed-planner-layout-${viewport.width}.png`), fullPage: true });
      }
      await testInfo.attach("placed-planner-layout.json", { body: JSON.stringify(plannerLayout, null, 2), contentType: "application/json" });
      await gamePage.page.setViewportSize({ width: 1280, height: 900 });
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
