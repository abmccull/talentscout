import type { Page } from "@playwright/test";
import { dismissCareerMomentOverlays, expect, test } from "../fixtures";

async function authorReportsToCount(page: Page, targetCount: number) {
  return page.evaluate((target) => {
    const store = (window as any).__GAME_STORE__;
    if (!store?.getState()?.gameState) throw new Error("Game state not ready");

    const candidates = Object.values(store.getState().gameState.players) as Array<{
      id: string;
      firstName: string;
      lastName: string;
      position: string;
    }>;

    for (const [index, player] of candidates.entries()) {
      const state = store.getState().gameState;
      if (state.scout.reportsSubmitted >= target) break;
      if (Object.values(state.reports).some((report: any) => report.playerId === player.id)) {
        continue;
      }

      store.getState().startObservationSession(
        "schoolMatch",
        [{
          playerId: player.id,
          name: `${player.firstName} ${player.lastName}`,
          position: player.position,
        }],
        player.id,
        {
          activityInstanceId: `organic-career-observation-${index}`,
          returnScreen: "dashboard",
        },
      );
      store.getState().beginSession();

      for (let phase = 0; phase < 40; phase++) {
        const session = store.getState().activeSession;
        if (!session || session.state !== "active") break;
        const sessionPlayer = session.players.find(
          (candidate: any) => candidate.playerId === player.id,
        );
        if (
          session.focusTokens.available > 0
          && !sessionPlayer?.focusedPhases.includes(session.currentPhaseIndex)
        ) {
          store.getState().allocateSessionFocus(player.id, "technical");
        }
        const current = store.getState().activeSession;
        const moment = current?.phases[current.currentPhaseIndex]?.moments?.find(
          (candidate: any) => candidate.playerId === player.id,
        );
        if (moment) {
          store.getState().flagSessionMoment(moment.id, "promising");
        }
        store.getState().advanceSessionPhase();
      }

      if (store.getState().activeSession?.state !== "reflection") {
        throw new Error(`Observation did not reach reflection for ${player.id}`);
      }
      store.getState().endObservationSession();
      store.getState().startReport(player.id);
      store.getState().submitReport(
        "recommend",
        `Evidence-led authored report ${index + 1}`,
        ["Technical evidence"],
        ["Requires continued monitoring"],
      );
    }

    const finalState = store.getState().gameState;
    return {
      reportCount: finalState.scout.reportsSubmitted,
      reputation: finalState.scout.reputation,
      observationCount: Object.keys(finalState.observations).length,
    };
  }, targetCount);
}

async function sellReportsToWorkingCapital(page: Page, targetBalance: number) {
  return page.evaluate((target) => {
    const store = (window as any).__GAME_STORE__;
    if (!store?.getState()?.gameState) throw new Error("Game state not ready");

    const openingState = store.getState().gameState;
    const openingBalance = openingState.finances.balance;
    const openingReportRevenue = openingState.finances.reportSalesRevenue;
    const reportIds = Object.keys(openingState.reports).filter((reportId) =>
      !openingState.finances.reportListings.some(
        (listing: any) => listing.reportId === reportId && listing.status === "sold",
      )
    );
    let sales = 0;

    for (const reportId of reportIds) {
      let state = store.getState().gameState;
      if (state.finances.balance >= target) break;

      const buyers = Object.values(state.clubs)
        .map((club: any) => ({
          club,
          scoutingBudget: Math.max(
            750,
            Math.round(club.scoutingBudget ?? Math.min(club.budget * 0.08, 50_000)),
          ),
        }))
        .sort((left: any, right: any) => right.scoutingBudget - left.scoutingBudget);
      const buyer = buyers[0];
      if (!buyer || buyer.scoutingBudget < 750) {
        throw new Error("No club can fund a market-rate report bid");
      }

      // Recommend-level reports normally command roughly GBP800-GBP2,000
      // when sold exclusively. Keep the controlled offer conservative while
      // allowing clubs' ring-fenced scouting budgets to remain authoritative.
      const amount = Math.min(1_400, buyer.scoutingBudget);
      store.getState().listReportForSale(reportId, amount, true, buyer.club.id);
      state = store.getState().gameState;
      const listing = state.finances.reportListings.find(
        (candidate: any) => candidate.reportId === reportId && candidate.status === "active",
      );
      if (!listing) continue;

      const bidId = `organic_market_bid_${sales + 1}`;
      const bid = {
        id: bidId,
        listingId: listing.id,
        clubId: buyer.club.id,
        amount,
        placedWeek: state.currentWeek,
        placedSeason: state.currentSeason,
        expiryWeek: listing.biddingEndsWeek,
        expirySeason: listing.biddingEndsSeason,
        status: "pending",
        needMatchScore: 75,
        bidReason: "Strong youth evidence matches the club recruitment brief",
      };
      store.setState({
        gameState: {
          ...state,
          finances: {
            ...state.finances,
            reportListings: state.finances.reportListings.map((candidate: any) =>
              candidate.id === listing.id
                ? { ...candidate, bids: [...candidate.bids, bid] }
                : candidate
            ),
          },
        },
      });
      store.getState().acceptMarketplaceBid(bidId);

      const soldState = store.getState().gameState;
      const saleRecorded = soldState.finances.transactions.some(
        (transaction: any) =>
          transaction.referenceId === `marketplace:${listing.id}:buyer:${buyer.club.id}`,
      );
      if (!saleRecorded) {
        throw new Error(`Marketplace sale was not recorded for ${reportId}`);
      }
      sales += 1;
    }

    const finalState = store.getState().gameState;
    if (finalState.finances.balance < target) {
      throw new Error(
        `Report sales raised balance from ${openingBalance} to ${finalState.finances.balance}; target was ${target}`,
      );
    }
    return {
      sales,
      openingBalance,
      balance: finalState.finances.balance,
      reportRevenue:
        finalState.finances.reportSalesRevenue - openingReportRevenue,
      deliveries: Object.keys(finalState.reportDeliveries ?? {}).length,
      firstSaleBonusUsed: finalState.finances.starterBonus.firstReportBonusUsed,
    };
  }, targetBalance);
}

async function advanceCanonicalEmptyWeek(page: Page) {
  const result = await page.evaluate(async () => {
    const store = (window as any).__GAME_STORE__;
    const before = store.getState().gameState;
    store.getState().startWeekSimulation();
    await store.getState().fastForwardWeek();
    const postSimulationStore = store.getState();
    const after = postSimulationStore.gameState;
    return {
      before: { week: before.currentWeek, season: before.currentSeason },
      after: {
        week: after.currentWeek,
        season: after.currentSeason,
        tier: after.scout.careerTier,
      },
      celebration: postSimulationStore.pendingCelebration
        ? {
            tier: postSimulationStore.pendingCelebration.tier,
            title: postSimulationStore.pendingCelebration.title,
          }
        : null,
    };
  });

  // Canonical completion deliberately presents one blocking layer at a time:
  // the week summary first, then any earned milestone. Scope every action to
  // the named dialog so a late React render cannot retarget a positional
  // locator to a covered control.
  const weekSummary = page.getByRole("dialog", { name: "Week Summary" });
  await expect(weekSummary).toBeVisible({ timeout: 5_000 });
  await weekSummary.getByRole("button", {
    name: result.celebration?.title === "Career Promotion!"
      ? "Continue to promotion"
      : result.celebration
        ? "Continue to milestone"
        : "Close week summary",
  }).click();
  await expect(weekSummary).toBeHidden();

  if (result.celebration?.tier === "major" || result.celebration?.tier === "epic") {
    const accessibleName = result.celebration.tier === "epic"
      ? `Epic achievement: ${result.celebration.title}`
      : `Achievement: ${result.celebration.title}`;
    const celebration = page.getByRole("dialog", { name: accessibleName });
    await expect(celebration).toBeVisible({ timeout: 5_000 });
    await celebration.getByRole("button", {
      name: result.celebration.tier === "epic" ? "Incredible!" : "Continue",
    }).click();
    await expect(celebration).toBeHidden();
  }

  // Career moments deliberately outrank navigation and season controls. A
  // long-form journey must acknowledge the persisted queue through the same
  // rendered Continue action a player uses before interacting with the screen
  // underneath it.
  await dismissCareerMomentOverlays(page);

  if (result.after.season > result.before.season) {
    // Season Awards is a deliberately lazy late-career workspace. The store
    // route changes synchronously after the summary, while the production
    // chunk can still be committing on a cold browser. Wait for that real
    // destination instead of treating the route-level loading fallback as a
    // missing season review.
    await page.waitForFunction(
      () => (window as any).__GAME_STORE__?.getState()?.currentScreen === "seasonAwards",
      undefined,
      { timeout: 20_000 },
    );
    await page
      .getByText(/^Loading workspace/)
      .waitFor({ state: "hidden", timeout: 20_000 });
    await expect(
      page.getByRole("heading", {
        name: `Season ${result.before.season} Complete`,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Continue to Next Season" }).click();
  }

  return result;
}

test.describe("Organic career journey", () => {
  test("fresh Youth work earns a path choice, leadership, retirement, and inherited legacy", async ({ gamePage }) => {
    // This story advances a full season with canonical world processing and
    // closes every player-facing summary/milestone through the rendered UI.
    // Keep a release-machine budget that covers the complete 38-week journey;
    // the assertions and per-action timeouts remain strict.
    test.setTimeout(600_000);

    await gamePage.goto();
    await gamePage.startNewGame({
      firstName: "Organic",
      lastName: "Browser",
      specialization: "youth",
    });

    expect(await gamePage.getGameStateValue("scout.careerTier")).toBe(1);
    expect(await gamePage.getGameStateValue("scout.careerPath")).toBe("independent");
    expect(await gamePage.getGameStateValue("scout.careerPathChosen")).toBe(false);

    const firstWork = await authorReportsToCount(gamePage.page, 20);
    expect(firstWork.reportCount).toBeGreaterThanOrEqual(5);
    expect(firstWork.reputation).toBeGreaterThanOrEqual(20);
    expect(firstWork.observationCount).toBeGreaterThanOrEqual(firstWork.reportCount);

    const tierAdvance = await advanceCanonicalEmptyWeek(gamePage.page);
    expect(tierAdvance.after.tier).toBe(2);
    expect(await gamePage.getGameStateValue("scout.careerPathChosen")).toBe(false);

    // Save the actual decision point, prove the club branch creates real
    // employment, then reload and commit to the independent branch.
    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().saveToSlot(4, "Organic career choice point");
    });
    await gamePage.setScreen("career");
    await dismissCareerMomentOverlays(gamePage.page);
    await gamePage.page.getByRole("button", { name: "Club Scout" }).first().click();
    await expect.poll(() => gamePage.getGameStateValue("scout.careerPath")).toBe("club");
    expect(await gamePage.getGameStateValue("scout.currentClubId")).toBeTruthy();
    expect(await gamePage.getGameStateValue("scout.salary")).toBeGreaterThan(0);

    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().loadFromSlot(4);
    });
    await expect.poll(() => gamePage.getGameStateValue("scout.careerPathChosen")).toBe(false);
    expect(await gamePage.getGameStateValue("scout.reportsSubmitted")).toBe(firstWork.reportCount);
    await gamePage.setScreen("career");
    await dismissCareerMomentOverlays(gamePage.page);
    await gamePage.page.getByRole("button", { name: "Independent Scout" }).first().click();
    await expect.poll(() => gamePage.getGameStateValue("scout.careerPathChosen")).toBe(true);
    expect(await gamePage.getGameStateValue("scout.careerPath")).toBe("independent");

    const leadershipWork = await authorReportsToCount(gamePage.page, 51);
    expect(leadershipWork.reportCount).toBe(51);
    expect(leadershipWork.reputation).toBeGreaterThanOrEqual(60);

    // These are controlled offers and financing inputs, accepted through the
    // same player actions as normal generated offers. Tiers are never injected.
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const clubIds = Object.keys(state.clubs);
      // The canonical lender caps a tier-2 agency below the old unrestricted
      // £20k test facility. A £5k offer is within underwriting and still gives
      // the business enough working capital for its tier-3 threshold.
      store.getState().takeLoanAction("business", 5_000);
      store.getState().acceptRetainerContract({
        id: "organic_retainer_1",
        clubId: clubIds[0],
        tier: 2,
        monthlyFee: 2_000,
        requiredReportsPerMonth: 3,
        reportsDeliveredThisMonth: 0,
        status: "active",
      });
    });
    await sellReportsToWorkingCapital(gamePage.page, 6_000);
    const tierThreeRequirements = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return {
        path: state.scout.careerPath,
        pathChosen: state.scout.careerPathChosen,
        independentTier: state.scout.independentTier,
        reputation: state.scout.reputation,
        reports: state.scout.reportsSubmitted,
        balance: state.finances.balance,
        retainers: state.finances.retainerContracts.filter(
          (contract: any) => contract.status === "active",
        ).length,
      };
    });
    expect(tierThreeRequirements).toMatchObject({
      path: "independent",
      pathChosen: true,
      independentTier: 2,
      reputation: expect.any(Number),
      reports: 51,
      balance: expect.any(Number),
      retainers: 1,
    });
    expect(tierThreeRequirements.reputation).toBeGreaterThanOrEqual(40);
    expect(tierThreeRequirements.balance).toBeGreaterThanOrEqual(5_000);
    expect((await advanceCanonicalEmptyWeek(gamePage.page)).after.tier).toBe(3);

    const tierFourWork = await authorReportsToCount(gamePage.page, 55);
    expect(tierFourWork.reportCount).toBe(55);
    expect(tierFourWork.reputation).toBeGreaterThanOrEqual(60);

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const clubIds = Object.keys(state.clubs);
      for (let index = 2; index <= 3; index++) {
        store.getState().acceptRetainerContract({
          id: `organic_retainer_${index}`,
          clubId: clubIds[index - 1] ?? clubIds[0],
          tier: 2,
          monthlyFee: 2_000,
          requiredReportsPerMonth: 3,
          reportsDeliveredThisMonth: 0,
          status: "active",
        });
      }
      store.getState().upgradeAgencyOffice("small");
      store.getState().hireAgencyEmployee("analyst");
    });
    const marketplaceCapital = await sellReportsToWorkingCapital(
      gamePage.page,
      18_000,
    );
    expect(marketplaceCapital.sales).toBeGreaterThanOrEqual(5);
    expect(marketplaceCapital.reportRevenue).toBeGreaterThanOrEqual(7_000);
    expect(marketplaceCapital.deliveries).toBeGreaterThanOrEqual(
      marketplaceCapital.sales,
    );
    expect(marketplaceCapital.firstSaleBonusUsed).toBe(true);
    const tierFourRequirements = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return {
        path: state.scout.careerPath,
        independentTier: state.scout.independentTier,
        reputation: state.scout.reputation,
        reports: state.scout.reportsSubmitted,
        balance: state.finances.balance,
        retainers: state.finances.retainerContracts.filter(
          (contract: any) => contract.status === "active",
        ).length,
        employees: state.finances.employees.length,
      };
    });
    expect(tierFourRequirements).toMatchObject({
      path: "independent",
      independentTier: 3,
      reputation: expect.any(Number),
      reports: 55,
      retainers: 3,
      employees: 1,
    });
    expect(tierFourRequirements.reputation).toBeGreaterThanOrEqual(60);
    expect(tierFourRequirements.balance).toBeGreaterThanOrEqual(15_000);
    expect((await advanceCanonicalEmptyWeek(gamePage.page)).after.tier).toBe(4);

    const leadership = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const npcIds = Object.keys(state.npcScouts);
      const playerId = Object.keys(state.players)[0];
      store.getState().delegateScouting(npcIds[0], playerId);
      return {
        npcIds,
        playerId,
        assigned: npcIds.every((id) => Boolean(state.npcScouts[id].territoryId)),
        delegationCount: Object.keys(store.getState().gameState.npcDelegations).length,
      };
    });
    expect(leadership.npcIds).toHaveLength(2);
    expect(leadership.assigned).toBe(true);
    expect(leadership.delegationCount).toBe(1);

    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().saveToSlot(5, "Organic leadership checkpoint");
      await store.getState().loadFromSlot(5);
    });
    expect(
      Object.keys(
        (await gamePage.getGameStateValue("npcScouts")) as Record<string, unknown>,
      ),
    ).toEqual(leadership.npcIds);

    // Empty canonical weeks are legitimate rest weeks and take the career to a
    // voluntary-retirement boundary without injecting calendar state.
    for (let safety = 0; safety < 50; safety++) {
      if ((await gamePage.getGameStateValue("currentSeason")) as number >= 2) break;
      await advanceCanonicalEmptyWeek(gamePage.page);
    }
    expect(await gamePage.getGameStateValue("currentSeason")).toBeGreaterThanOrEqual(2);

    const legacy = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const profile = store.getState().retireLegacyCareer();
      return {
        completedCareers: profile?.completedCareers.length ?? 0,
        perkIds: profile?.legacyPerks.map((perk: any) => perk.id) ?? [],
        retired: store.getState().gameState.completedScenarioIds.includes(
          "career_retired_voluntarily",
        ),
      };
    });
    expect(legacy.retired).toBe(true);
    expect(legacy.completedCareers).toBeGreaterThanOrEqual(1);
    expect(legacy.perkIds).toEqual(
      expect.arrayContaining([
        "starting_network",
        "reputation_head_start",
        "financial_cushion",
      ]),
    );

    const newGamePlus = await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().startNewGamePlus(
        {
          scoutFirstName: "Legacy",
          scoutLastName: "Heir",
          scoutAge: 25,
          specialization: "youth",
          difficulty: "normal",
          worldSeed: "organic-browser-new-game-plus",
          startingCountry: "england",
          selectedCountries: ["england"],
          skillAllocations: {
            technicalEye: 2,
            physicalAssessment: 1,
            psychologicalRead: 1,
            tacticalUnderstanding: 1,
            dataLiteracy: 1,
            playerJudgment: 1,
            potentialAssessment: 1,
          },
        },
        ["starting_network", "reputation_head_start", "financial_cushion"],
      );
      const state = store.getState().gameState;
      return {
        seed: state.seed,
        reputation: state.scout.reputation,
        pathChosen: state.scout.careerPathChosen,
        contactCount: Object.keys(state.contacts).length,
        hasBudgetBonus: state.finances.transactions.some(
          (transaction: any) => transaction.description === "Legacy career starting budget bonus",
        ),
        welcome: state.inbox.some((message: any) => message.id === "ng-plus-welcome"),
      };
    });
    expect(newGamePlus).toMatchObject({
      seed: "organic-browser-new-game-plus",
      reputation: 20,
      pathChosen: false,
      hasBudgetBonus: true,
      welcome: true,
    });
    expect(newGamePlus.contactCount).toBeGreaterThanOrEqual(2);

    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().deleteSlot(4);
      await store.getState().deleteSlot(5);
    });
    gamePage.expectNoConsoleErrors();
  });
});
