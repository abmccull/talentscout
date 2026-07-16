import { test, expect } from "../fixtures";

test.describe("Academy placement case", () => {
  test.setTimeout(180_000);

  test("brief, structured report, delayed decision, and long-term reviews form one causal case", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 2,
      currentSeason: 1,
      scout: {
        firstName: "Case",
        lastName: "Builder",
        primarySpecialization: "youth",
        reputation: 55,
      },
    });

    const setup = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const youth = Object.values(state.unsignedYouth)[0] as any;
      const sourceBrief = Object.values(state.youthRecruitmentBriefs)[0] as any;
      if (!youth || !sourceBrief) throw new Error("Academy case fixture is unavailable");
      const player = youth.player;
      const contexts = ["schoolMatch", "academyTrialDay", "parentCoachMeeting"];
      const observations = Object.fromEntries(contexts.map((context, index) => {
        const id = `academy_case_obs_${index}`;
        return [id, {
          id,
          playerId: player.id,
          scoutId: state.scout.id,
          sourceSessionId: `academy_case_session_${index}`,
          week: state.currentWeek,
          season: state.currentSeason,
          context,
          attributeReadings: ["pace", "decisionMaking", "teamwork"].map((attribute) => ({
            attribute,
            perceivedValue: player.attributes[attribute],
            confidence: 0.82,
            observationCount: index + 1,
            rangeLow: Math.max(1, player.attributes[attribute] - 1),
            rangeHigh: Math.min(20, player.attributes[attribute] + 1),
          })),
          notes: [`Independent ${context} evidence.`],
          flaggedMoments: [],
        }];
      }));
      const brief = {
        ...sourceBrief,
        requiredPositions: [player.position],
        preferredRole: undefined,
        maxAge: Math.max(sourceBrief.maxAge, player.age),
        weeklyWageBudget: 2_000,
        riskTolerance: "medium",
        competitionPressure: 78,
        initialCompetitionPressure: 78,
        status: "open",
      };
      store.getState().loadGame({
        ...state,
        unsignedYouth: {
          ...state.unsignedYouth,
          [youth.id]: {
            ...youth,
            discoveredBy: [...new Set([...youth.discoveredBy, state.scout.id])],
          },
        },
        observations: { ...state.observations, ...observations },
        youthRecruitmentBriefs: { [brief.id]: brief },
      });
      store.getState().selectPlayer(player.id);
      store.getState().setScreen("playerProfile");
      return { playerId: player.id, briefId: brief.id, clubId: brief.clubId };
    });

    await gamePage.waitForScreen("playerProfile");
    await expect(gamePage.page.getByRole("heading", { name: "Brief fit and opportunity cost" })).toBeVisible();
    await expect(gamePage.page.getByRole("heading", { name: "Highest-value next evidence" })).toBeVisible();
    await gamePage.page.getByRole("button", { name: /^Write Report$/ }).click();
    await gamePage.waitForScreen("reportWriter");

    await expect(gamePage.page.getByRole("heading", { name: "Answer a real club need" })).toBeVisible();
    await expect(gamePage.page.getByText("Development potential", { exact: true })).toBeVisible();
    const identityBriefing = gamePage.page.getByTestId("recruitment-identity-briefing");
    await expect(identityBriefing).toBeVisible();
    await expect(identityBriefing).toContainText(/same case can land differently/i);
    const presentationRoom = gamePage.page.getByTestId("report-presentation-room");
    await expect(presentationRoom).toBeVisible();
    await presentationRoom.getByRole("radio", { name: /^Pathway-led\b/ }).click();
    await expect(
      presentationRoom.getByRole("radio", { name: /^Pathway-led\b/ }),
    ).toBeChecked();
    await gamePage.page.getByRole("radio", { name: /^Offer academy place\b/ }).click();
    await gamePage.submitCurrentReportViaUI("strongRecommend");
    await gamePage.waitForScreen("reportHistory");

    const report = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return Object.values(state.reports).at(-1) as any;
    });
    expect(report).toMatchObject({
      briefId: setup.briefId,
      intendedClubId: setup.clubId,
      revision: 1,
      recommendedAction: "offerAcademyPlace",
      presentationApproach: "fitLed",
    });
    expect(Object.keys(report.categoryVerdicts)).toEqual(
      expect.arrayContaining(["potential", "roleFit", "characterRisk"]),
    );

    await gamePage.page.evaluate(({ playerId, clubId }) => {
      const store = (window as any).__GAME_STORE__;
      store.getState().scheduleActivity({
        type: "writePlacementReport",
        slots: 4,
        targetId: playerId,
        destinationClubId: clubId,
        description: "Pitch the authored academy report",
      }, 0);
      store.getState().setScreen("calendar");
    }, { playerId: setup.playerId, clubId: setup.clubId });

    await gamePage.waitForScreen("calendar");
    await gamePage.advanceCanonicalWeek();
    const pending = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const placement = Object.values(state.placementReports).at(-1) as any;
      return {
        response: placement?.clubResponse,
        deliveryStatus: placement?.deliveryId
          ? state.reportDeliveries[placement.deliveryId]?.status
          : undefined,
      };
    });
    expect(pending).toEqual({ response: "pending", deliveryStatus: "awaitingDecision" });

    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    const resolved = await gamePage.page.evaluate(({ briefId }) => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const placement = Object.values(state.placementReports).at(-1) as any;
      const decision = placement?.decisionId ? state.clubDecisions[placement.decisionId] : undefined;
      const reviews = Object.values(state.recommendationReviews) as any[];
      return {
        response: placement?.clubResponse,
        reasons: decision?.reasons ?? [],
        decisionTotal: decision?.scoreBreakdown?.total,
        presentationScore: decision?.scoreBreakdown?.presentation,
        briefStatus: state.youthRecruitmentBriefs[briefId]?.status,
        briefFailures: state.youthRecruitmentBriefs[briefId]?.fulfillmentFailures ?? [],
        reviewCheckpoints: reviews.map((review) => review.checkpoint).sort(),
      };
    }, { briefId: setup.briefId });

    expect(resolved.response).toBe("accepted");
    expect(resolved.reasons.length).toBeGreaterThanOrEqual(3);
    expect(resolved.decisionTotal).toBeGreaterThanOrEqual(66);
    expect(resolved.presentationScore).toBeGreaterThanOrEqual(0);
    expect(resolved.presentationScore).toBeLessThanOrEqual(100);
    expect(resolved.reasons.some((reason: string) => reason.includes("Pathway-led presentation"))).toBe(true);
    expect(resolved.reasons.some((reason: string) => /fit \d+\/100/.test(reason))).toBe(true);
    expect(resolved.briefStatus, resolved.briefFailures.join(", ")).toBe("fulfilled");
    expect(resolved.reviewCheckpoints).toEqual(["oneSeason", "twoSeasons"]);
    gamePage.expectNoConsoleErrors();
  });
});
