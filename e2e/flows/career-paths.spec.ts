import type { GamePage } from "../fixtures";
import { test, expect } from "../fixtures";

async function createSubmittedYouthReport(gamePage: GamePage) {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 1,
    scout: {
      firstName: "Career",
      lastName: "Tester",
      primarySpecialization: "youth",
    },
  });
  await gamePage.navigateTo("calendar");
  await gamePage.scheduleActivityByLabel("School Match", "Mon");
  await gamePage.advanceCanonicalWeek({ launchLiveSession: true });
  await gamePage.openFirstYouthPlayerProfile();
  await gamePage.page.getByRole("button", { name: /^Write Report$/ }).click();
  await gamePage.waitForScreen("reportWriter");
  await gamePage.submitCurrentReportViaUI("recommend");
  await gamePage.waitForScreen("reportHistory");
}

test.describe("Career Paths", () => {
  test("career hub explains the seed-locked world conditions", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      scout: {
        firstName: "Replay",
        lastName: "Tester",
        primarySpecialization: "youth",
      },
    });

    await gamePage.navigateTo("career");

    const conditions = gamePage.page.getByText("This career's world conditions", {
      exact: true,
    });
    await expect(conditions).toBeVisible();
    await expect(gamePage.page.getByText("talent", { exact: true })).toBeVisible();
    await expect(gamePage.page.getByText("competition", { exact: true })).toBeVisible();
    await expect(gamePage.page.getByText("economy", { exact: true })).toBeVisible();
    gamePage.expectNoConsoleErrors();
  });

  test("freelance youth careers render as independent on the career screen", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 6,
      scout: {
        firstName: "Career",
        lastName: "Tester",
        primarySpecialization: "youth",
      },
    });

    await gamePage.navigateTo("career");

    expect(await gamePage.getGameStateValue("scout.currentClubId")).toBeFalsy();
    expect(await gamePage.getGameStateValue("scout.salary")).toBe(0);
    await expect(gamePage.page.getByText("Freelance Scout", { exact: true })).toBeVisible();

    gamePage.expectNoConsoleErrors();
  });

  test("independent youth reports expose the marketplace prompt and stats", async ({ gamePage }) => {
    await createSubmittedYouthReport(gamePage);

    await expect(
      gamePage.page.locator('[data-tutorial-id="report-marketplace-prompt"]'),
    ).toBeVisible();
    await expect(gamePage.page.getByText("Active Listings")).toBeVisible();
    await expect(gamePage.page.getByText("Pending Bids")).toBeVisible();

    gamePage.expectNoConsoleErrors();
  });

  test("accepting a club job exits independent finances without wiping balance history", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 16,
      currentSeason: 2,
      scout: {
        firstName: "Career",
        lastName: "Tester",
        primarySpecialization: "youth",
      },
    });

    const result = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState()?.gameState;
      if (!store || !state || !state.finances) {
        throw new Error("Game state not ready");
      }

      const clubId = Object.keys(state.clubs)[0];
      if (!clubId) {
        throw new Error("No clubs available");
      }

      const offer = {
        id: "offer_accept_club_path_fix",
        clubId,
        tier: 3,
        role: "Senior Youth Scout",
        salary: 2400,
        contractLength: 2,
        expiresWeek: 20,
      };

      const seededState = {
        ...state,
        scout: {
          ...state.scout,
          careerPath: "independent",
          independentTier: 3,
          currentClubId: null,
          careerTier: 3,
          salary: 0,
          contractEndSeason: undefined,
          clubTrust: 22,
          reportsSubmitted: 12,
          successfulFinds: 4,
        },
        finances: {
          ...state.finances,
          careerPath: "independent",
          independentTier: 3,
          balance: 12345,
          monthlyIncome: 0,
          transactions: [
            ...state.finances.transactions,
            {
              week: 8,
              season: 1,
              amount: 777,
              description: "Legacy cash reserve",
            },
          ],
          retainerContracts: [
            {
              id: "retainer_live",
              clubId,
              tier: 2,
              monthlyFee: 1800,
              requiredReportsPerMonth: 3,
              reportsDeliveredThisMonth: 1,
              status: "active",
            },
          ],
          consultingContracts: [
            {
              id: "consult_live",
              clubId,
              type: "youthAudit",
              fee: 5000,
              deadline: 20,
              deadlineSeason: 2,
              status: "active",
            },
          ],
          reportListings: [
            {
              id: "listing_live",
              reportId: "report_live",
              price: 900,
              isExclusive: false,
              status: "active",
              listedWeek: 15,
              listedSeason: 2,
              biddingEndsWeek: 18,
              biddingEndsSeason: 2,
              bids: [
                {
                  id: "bid_live",
                  listingId: "listing_live",
                  clubId,
                  amount: 950,
                  placedWeek: 15,
                  placedSeason: 2,
                  expiryWeek: 18,
                  expirySeason: 2,
                  status: "pending",
                  needMatchScore: 78,
                },
              ],
            },
          ],
          office: {
            tier: "professional",
            monthlyCost: 1500,
            qualityBonus: 0.2,
            maxEmployees: 6,
          },
          employees: [
            {
              id: "emp_live",
              name: "Agency Scout",
              role: "scout",
              quality: 72,
              salary: 1200,
              morale: 60,
              fatigue: 10,
              hiredWeek: 4,
              hiredSeason: 1,
              reportsGenerated: [],
              experience: 5,
              weeklyLog: [],
              regionFocusWeeks: 0,
            },
          ],
          pendingRetainerOffers: [
            {
              id: "retainer_offer_live",
              clubId,
              tier: 1,
              monthlyFee: 700,
              requiredReportsPerMonth: 2,
              reportsDeliveredThisMonth: 0,
              status: "active",
            },
          ],
          pendingConsultingOffers: [
            {
              id: "consult_offer_live",
              clubId,
              type: "dataPackage",
              fee: 3000,
              deadline: 24,
              deadlineSeason: 2,
              status: "active",
            },
          ],
          pendingEmployeeEvents: [
            {
              id: "emp_evt_live",
              type: "poaching",
              employeeId: "emp_live",
              description: "A rival agency is circling.",
              options: [
                {
                  label: "Ignore",
                  moraleChange: -5,
                  effect: "ignore",
                },
              ],
              deadline: 18,
              deadlineSeason: 2,
            },
          ],
          satelliteOffices: [
            {
              id: "sat_live",
              region: "spain",
              monthlyCost: 900,
              qualityBonus: 0.1,
              maxEmployees: 2,
              employeeIds: ["emp_live"],
              openedWeek: 10,
              openedSeason: 1,
            },
          ],
          academyPartnerships: 3,
          regionalExpertiseRegion: "spain",
          specBonusApplied: 999,
          specUniqueIncome: 999,
        },
        jobOffers: [offer],
      };

      store.getState().loadGame(seededState);
      store.getState().acceptJob(offer.id);

      const updated = store.getState().gameState;
      if (!updated || !updated.finances) {
        throw new Error("Updated game state missing");
      }

      return {
        scout: {
          careerPath: updated.scout.careerPath,
          independentTier: updated.scout.independentTier ?? null,
          currentClubId: updated.scout.currentClubId ?? null,
          careerTier: updated.scout.careerTier,
          salary: updated.scout.salary,
          contractEndSeason: updated.scout.contractEndSeason ?? null,
          reportsSubmitted: updated.scout.reportsSubmitted,
          successfulFinds: updated.scout.successfulFinds,
        },
        finances: {
          careerPath: updated.finances.careerPath,
          independentTier: updated.finances.independentTier ?? null,
          balance: updated.finances.balance,
          monthlyIncome: updated.finances.monthlyIncome,
          academyPartnerships: updated.finances.academyPartnerships ?? null,
          specUniqueIncome: updated.finances.specUniqueIncome ?? null,
          officeTier: updated.finances.office.tier,
          employeeCount: updated.finances.employees.length,
          pendingRetainerOffers: updated.finances.pendingRetainerOffers.length,
          pendingConsultingOffers: updated.finances.pendingConsultingOffers.length,
          pendingEmployeeEvents: updated.finances.pendingEmployeeEvents.length,
          satelliteOfficeCount: updated.finances.satelliteOffices.length,
          retainerStatuses: updated.finances.retainerContracts.map((contract: { status: string }) => contract.status),
          consultingStatuses: updated.finances.consultingContracts.map((contract: { status: string }) => contract.status),
          listingStatuses: updated.finances.reportListings.map((listing: { status: string }) => listing.status),
          bidStatuses: updated.finances.reportListings.flatMap(
            (listing: { bids: Array<{ status: string }> }) =>
              listing.bids.map((bid: { status: string }) => bid.status),
          ),
          preservedLegacyTransaction: updated.finances.transactions.some(
            (transaction: { description: string }) =>
              transaction.description === "Legacy cash reserve",
          ),
        },
        remainingOffers: updated.jobOffers.length,
      };
    });

    expect(result.scout.careerPath).toBe("club");
    expect(result.scout.reportsSubmitted).toBe(12);
    expect(result.scout.successfulFinds).toBe(4);
    expect(result.scout.independentTier).toBeNull();
    expect(result.scout.currentClubId).toBeTruthy();
    expect(result.scout.careerTier).toBe(3);
    expect(result.scout.salary).toBe(2400);
    expect(result.scout.contractEndSeason).toBe(4);
    expect(result.finances.careerPath).toBe("club");
    expect(result.finances.independentTier).toBeNull();
    expect(result.finances.monthlyIncome).toBe(9600);
    expect(result.finances.academyPartnerships).toBe(1);
    expect(result.finances.specUniqueIncome).toBe(500);
    expect(result.finances.officeTier).toBe("home");
    expect(result.finances.employeeCount).toBe(0);
    expect(result.finances.pendingRetainerOffers).toBe(0);
    expect(result.finances.pendingConsultingOffers).toBe(0);
    expect(result.finances.pendingEmployeeEvents).toBe(0);
    expect(result.finances.satelliteOfficeCount).toBe(0);
    expect(result.finances.retainerStatuses).toEqual(["cancelled"]);
    expect(result.finances.consultingStatuses).toEqual(["expired"]);
    expect(result.finances.listingStatuses).toEqual(["withdrawn"]);
    expect(result.finances.bidStatuses).toEqual(["withdrawn"]);
    expect(result.finances.preservedLegacyTransaction).toBe(true);
    expect(result.finances.balance).toBeGreaterThan(12345);
    expect(result.remainingOffers).toBe(0);

    gamePage.expectNoConsoleErrors();
  });
});
