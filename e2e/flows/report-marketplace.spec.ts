import type { GamePage } from "../fixtures";
import { test, expect } from "../fixtures";

async function createSubmittedYouthReport(gamePage: GamePage) {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 1,
    scout: {
      firstName: "Market",
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
  await gamePage.submitCurrentReportViaUI("strongRecommend");
  await gamePage.waitForScreen("reportHistory");
}

async function listFirstReport(gamePage: GamePage) {
  await expect(
    gamePage.page.locator('[data-tutorial-id="report-marketplace-prompt"]'),
  ).toBeVisible();
  await gamePage.page.getByRole("button", { name: /^List Now$/ }).click();
}

test.describe("Report Marketplace", () => {
  test("listing the first youth report creates an active marketplace listing", async ({ gamePage }) => {
    await createSubmittedYouthReport(gamePage);
    await listFirstReport(gamePage);

    const latestListing = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const listings = store.getState().gameState?.finances?.reportListings ?? [];
      return listings.at(-1) ?? null;
    });

    expect(latestListing).not.toBeNull();
    expect(latestListing.status).toBe("active");
    expect(latestListing.isExclusive).toBe(false);

    gamePage.expectNoConsoleErrors();
  });

  test("a newly listed first youth report receives a canonical-week bid", async ({ gamePage }) => {
    await createSubmittedYouthReport(gamePage);
    await listFirstReport(gamePage);

    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    await gamePage.navigateTo("inbox");

    const marketOutcome = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const listings = state?.finances?.reportListings ?? [];
      const latestListing = listings.at(-1);
      const bidCount = latestListing?.bids?.length ?? 0;
      const bidMessage = (state?.inbox ?? []).find((message: any) =>
        typeof message.title === "string" && message.title.startsWith("Bid from "),
      );

      return {
        bidCount,
        listingStatus: latestListing?.status ?? null,
        bidTitle: bidMessage?.title ?? null,
      };
    });

    expect(marketOutcome.bidCount).toBeGreaterThan(0);
    expect(marketOutcome.listingStatus).toBe("active");
    expect(marketOutcome.bidTitle).toMatch(/^Bid from /);
    await expect(
      gamePage.page.getByRole("button", { name: /^Unread message: Bid from / }).first(),
    ).toBeVisible();

    gamePage.expectNoConsoleErrors();
  });
});
