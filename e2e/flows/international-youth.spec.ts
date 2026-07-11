import { test, expect } from "../fixtures";
import { navItem } from "../helpers/selectors";

test.describe("Youth geography and travel", () => {
  test("international travel is visible, funded, scheduled, and becomes the effective location", async ({ gamePage }) => {
    test.setTimeout(120_000);
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      countries: ["england", "brazil"],
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "independent",
        reputation: 35,
        fatigue: 5,
      },
    });

    await expect(gamePage.page.locator(navItem("internationalView"))).toBeVisible();
    await gamePage.navigateTo("internationalView");
    await expect(gamePage.page.getByText(/Currently in:/).first()).toBeVisible();

    const booked = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const before = store.getState().gameState;
      const funded = {
        ...before,
        finances: {
          ...before.finances,
          balance: 100_000,
        },
        schedule: {
          ...before.schedule,
          activities: [...before.schedule.activities],
        },
      };
      store.getState().loadGame({
        ...funded,
        schedule: {
          ...funded.schedule,
          activities: Array(7).fill({
            type: "rest",
            slots: 1,
            description: "Occupied",
          }),
        },
      });
      const blockedBalanceBefore = store.getState().gameState.finances.balance;
      const blocked = store.getState().bookInternationalTravel("brazil");
      const blockedState = store.getState().gameState;

      store.getState().loadGame(funded);
      const balanceBefore = store.getState().gameState.finances.balance;
      const accepted = store.getState().bookInternationalTravel("brazil");
      const after = store.getState().gameState;
      const travelSlots = after.schedule.activities.filter(
        (activity: any) => activity?.type === "internationalTravel",
      );
      return {
        destination: after.scout.travelBooking?.destinationCountry,
        departureWeek: after.scout.travelBooking?.departureWeek,
        accepted,
        blocked,
        blockedDestination: blockedState.scout.travelBooking?.destinationCountry,
        blockedBalanceBefore,
        blockedBalanceAfter: blockedState.finances.balance,
        balanceBefore,
        balanceAfter: after.finances.balance,
        travelSlotCount: travelSlots.length,
        targetIds: [...new Set(travelSlots.map((activity: any) => activity.targetId))],
        instanceIds: [...new Set(travelSlots.map((activity: any) => activity.instanceId))],
      };
    });

    expect(booked.destination).toBe("brazil");
    expect(booked.departureWeek).toBe(2);
    expect(booked.accepted).toBe(true);
    expect(booked.blocked).toBe(false);
    expect(booked.blockedDestination).toBeUndefined();
    expect(booked.blockedBalanceAfter).toBe(booked.blockedBalanceBefore);
    expect(booked.balanceAfter).toBeLessThan(booked.balanceBefore);
    expect(booked.travelSlotCount).toBeGreaterThan(0);
    expect(booked.targetIds).toEqual(["brazil"]);
    expect(booked.instanceIds).toHaveLength(1);

    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();

    const arrived = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return {
        week: state.currentWeek,
        destination: state.scout.travelBooking?.destinationCountry,
        isAbroad: state.scout.travelBooking?.isAbroad,
      };
    });
    expect(arrived).toEqual({ week: 2, destination: "brazil", isAbroad: true });
    gamePage.expectNoConsoleErrors();
  });
});
