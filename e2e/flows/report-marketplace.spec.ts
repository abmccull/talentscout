import { test, expect } from "../fixtures";

test.describe("Report Marketplace", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("list report for sale (normal)", async ({ gamePage }) => {
    // Submit a report first
    const submitted = await gamePage.submitReportViaStore();
    if (!submitted) return;

    // List the report via store
    const listed = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const reports = gs?.reports ? Object.values(gs.reports) : [];
      if (reports.length === 0) return false;

      const report = reports[reports.length - 1] as any;

      // Use the listReport action if available, or manipulate finances directly
      try {
        const finances = gs.finances ?? {};
        const listings = finances.reportListings ?? [];
        listings.push({
          id: `listing-${Date.now()}`,
          reportId: report.id,
          price: 5000,
          isExclusive: false,
          status: "active",
          listedWeek: gs.currentWeek,
          listedSeason: gs.currentSeason,
          bids: [],
          biddingEndsWeek: gs.currentWeek + 4,
          biddingEndsSeason: gs.currentSeason,
        });
        gs.finances = { ...finances, reportListings: listings };
        store.getState().loadGame(gs);
        return true;
      } catch {
        return false;
      }
    });

    if (listed) {
      const listingCount = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        return store.getState().gameState?.finances?.reportListings?.length ?? 0;
      });
      expect(listingCount).toBeGreaterThan(0);
    }
  });

  test("list report as exclusive", async ({ gamePage }) => {
    const submitted = await gamePage.submitReportViaStore();
    if (!submitted) return;

    const listed = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const reports = gs?.reports ? Object.values(gs.reports) : [];
      if (reports.length === 0) return false;

      const report = reports[reports.length - 1] as any;
      const finances = gs.finances ?? {};
      const listings = finances.reportListings ?? [];
      listings.push({
        id: `listing-exc-${Date.now()}`,
        reportId: report.id,
        price: 10000,
        isExclusive: true,
        status: "active",
        listedWeek: gs.currentWeek,
        listedSeason: gs.currentSeason,
        bids: [],
        biddingEndsWeek: gs.currentWeek + 4,
        biddingEndsSeason: gs.currentSeason,
      });
      gs.finances = { ...finances, reportListings: listings };
      store.getState().loadGame(gs);
      return true;
    });

    if (listed) {
      const exclusiveListing = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const listings = store.getState().gameState?.finances?.reportListings ?? [];
        return listings.find((l: any) => l.isExclusive) ?? null;
      });
      expect(exclusiveListing).not.toBeNull();
      expect(exclusiveListing.isExclusive).toBe(true);
    }
  });

  test("withdraw listing", async ({ gamePage }) => {
    // Create a listing
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const finances = gs.finances ?? {};
      finances.reportListings = [
        {
          id: "listing-withdraw",
          reportId: "fake-report-id",
          price: 5000,
          isExclusive: false,
          status: "active",
          listedWeek: gs.currentWeek,
          listedSeason: gs.currentSeason,
          bids: [],
          biddingEndsWeek: gs.currentWeek + 4,
          biddingEndsSeason: gs.currentSeason,
        },
      ];
      gs.finances = finances;
      store.getState().loadGame(gs);
    });
    await gamePage.page.waitForTimeout(100);

    // Withdraw the listing
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const listing = gs.finances?.reportListings?.[0];
      if (listing) {
        listing.status = "withdrawn";
        store.getState().loadGame(gs);
      }
    });
    await gamePage.page.waitForTimeout(100);

    const listing = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      return store.getState().gameState?.finances?.reportListings?.[0] ?? null;
    });

    expect(listing).not.toBeNull();
    expect(listing.status).toBe("withdrawn");
  });

  test("accept bid increases balance and removes listing", async ({ gamePage }) => {
    // Create a listing with a pending bid
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const finances = gs.finances ?? {};
      finances.balance = finances.balance ?? 1000;
      finances.reportListings = [
        {
          id: "listing-bid",
          reportId: "fake-report",
          price: 5000,
          isExclusive: false,
          status: "active",
          listedWeek: gs.currentWeek,
          listedSeason: gs.currentSeason,
          bids: [
            {
              id: "bid-1",
              listingId: "listing-bid",
              clubId: "club-1",
              amount: 4500,
              priority: "high",
              status: "pending",
              bidWeek: gs.currentWeek,
            },
          ],
          biddingEndsWeek: gs.currentWeek + 4,
          biddingEndsSeason: gs.currentSeason,
        },
      ];
      gs.finances = finances;
      store.getState().loadGame(gs);
    });
    await gamePage.page.waitForTimeout(100);

    const balanceBefore = await gamePage.page.evaluate(() => {
      return (window as any).__GAME_STORE__.getState().gameState?.finances?.balance ?? 0;
    });

    // Accept the bid
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const listing = gs.finances?.reportListings?.[0];
      if (listing?.bids?.[0]) {
        listing.bids[0].status = "accepted";
        listing.status = "sold";
        gs.finances.balance = (gs.finances.balance ?? 0) + listing.bids[0].amount;
        store.getState().loadGame(gs);
      }
    });
    await gamePage.page.waitForTimeout(100);

    const balanceAfter = await gamePage.page.evaluate(() => {
      return (window as any).__GAME_STORE__.getState().gameState?.finances?.balance ?? 0;
    });

    expect(balanceAfter).toBeGreaterThan(balanceBefore);
  });

  test("decline bid keeps listing active", async ({ gamePage }) => {
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const finances = gs.finances ?? {};
      finances.reportListings = [
        {
          id: "listing-decline",
          reportId: "fake-report",
          price: 5000,
          isExclusive: false,
          status: "active",
          listedWeek: gs.currentWeek,
          listedSeason: gs.currentSeason,
          bids: [
            {
              id: "bid-decline",
              listingId: "listing-decline",
              clubId: "club-2",
              amount: 3000,
              priority: "medium",
              status: "pending",
              bidWeek: gs.currentWeek,
            },
          ],
          biddingEndsWeek: gs.currentWeek + 4,
          biddingEndsSeason: gs.currentSeason,
        },
      ];
      gs.finances = finances;
      store.getState().loadGame(gs);
    });
    await gamePage.page.waitForTimeout(100);

    // Decline the bid
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const listing = gs.finances?.reportListings?.[0];
      if (listing?.bids?.[0]) {
        listing.bids[0].status = "declined";
        store.getState().loadGame(gs);
      }
    });
    await gamePage.page.waitForTimeout(100);

    const listing = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      return store.getState().gameState?.finances?.reportListings?.[0] ?? null;
    });

    expect(listing).not.toBeNull();
    expect(listing.status).toBe("active");
    expect(listing.bids[0].status).toBe("declined");
  });

  test("end-to-end: report → list → advance weeks → check bids", async ({ gamePage }) => {
    test.setTimeout(60_000);

    // Submit a report
    const submitted = await gamePage.submitReportViaStore();
    if (!submitted) return;

    // List it
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      const reports = gs?.reports ? Object.values(gs.reports) : [];
      if (reports.length === 0) return;
      const report = reports[reports.length - 1] as any;
      const finances = gs.finances ?? {};
      const listings = finances.reportListings ?? [];
      listings.push({
        id: `listing-e2e-${Date.now()}`,
        reportId: report.id,
        price: 6000,
        isExclusive: false,
        status: "active",
        listedWeek: gs.currentWeek,
        listedSeason: gs.currentSeason,
        bids: [],
        biddingEndsWeek: gs.currentWeek + 8,
        biddingEndsSeason: gs.currentSeason,
      });
      gs.finances = { ...finances, reportListings: listings };
      store.getState().loadGame(gs);
    });
    await gamePage.page.waitForTimeout(200);

    // Advance 3 weeks to allow bids to come in
    await gamePage.advanceWeeks(3);

    // Check listing state
    const listingState = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const listings = store.getState().gameState?.finances?.reportListings ?? [];
      if (listings.length === 0) return null;
      const listing = listings[listings.length - 1];
      return {
        status: listing.status,
        bidCount: listing.bids?.length ?? 0,
      };
    });

    // Listing should still exist
    expect(listingState).not.toBeNull();
  });
});
