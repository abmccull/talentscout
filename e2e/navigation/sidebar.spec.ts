import { test, expect } from "../fixtures";
import {
  navItem,
  ALWAYS_VISIBLE_SCREENS,
  WEEK3_SCREENS,
  TIER2_SCREENS,
  TIER3_SCREENS,
  TIER4_SCREENS,
} from "../helpers/selectors";

test.describe("Sidebar Navigation", () => {
  test.describe("Tier 1 fresh game (week 1)", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 1,
        scout: { careerTier: 1, primarySpecialization: "youth" },
      });
    });

    test("always-visible nav items are present", async ({ gamePage }) => {
      for (const screen of ALWAYS_VISIBLE_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });

    test("week-3 items are hidden at week 1", async ({ gamePage }) => {
      for (const screen of WEEK3_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).not.toBeVisible();
      }
    });

    test("tier-2+ items are hidden at tier 1", async ({ gamePage }) => {
      for (const screen of TIER2_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).not.toBeVisible();
      }
    });

    test("tier-3+ items are hidden at tier 1", async ({ gamePage }) => {
      for (const screen of TIER3_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).not.toBeVisible();
      }
    });

    test("tier-4+ items are hidden at tier 1", async ({ gamePage }) => {
      for (const screen of TIER4_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).not.toBeVisible();
      }
    });

    test("clicking each visible nav item navigates correctly", async ({ gamePage }) => {
      for (const screen of ALWAYS_VISIBLE_SCREENS) {
        await gamePage.navigateTo(screen);
        const current = await gamePage.getCurrentScreen();
        expect(current).toBe(screen);
      }
    });
  });

  test.describe("Week 3+ visibility", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 5,
        scout: { careerTier: 1, primarySpecialization: "youth" },
      });
    });

    test("week-3 items become visible after week 3", async ({ gamePage }) => {
      for (const screen of WEEK3_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });

    test("clicking week-3 items navigates correctly", async ({ gamePage }) => {
      for (const screen of WEEK3_SCREENS) {
        await gamePage.navigateTo(screen);
        const current = await gamePage.getCurrentScreen();
        expect(current).toBe(screen);
      }
    });
  });

  test.describe("Tier 2 visibility", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectMidGameState("youth");
    });

    test("tier-2 items appear at tier 2", async ({ gamePage }) => {
      for (const screen of TIER2_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });
  });

  test.describe("Tier 3 visibility", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 10,
        scout: { careerTier: 3, primarySpecialization: "youth" },
      });
    });

    test("tier-3 items appear at tier 3", async ({ gamePage }) => {
      for (const screen of TIER3_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });
  });

  test.describe("Tier 4 — full game", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectLateGameState("youth");
    });

    test("tier-4 NPC Management appears", async ({ gamePage }) => {
      for (const screen of TIER4_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });

    test("all nav items are clickable and navigate without errors", async ({ gamePage }) => {
      const allVisible = [
        ...ALWAYS_VISIBLE_SCREENS,
        ...WEEK3_SCREENS,
        ...TIER2_SCREENS,
        ...TIER3_SCREENS,
        ...TIER4_SCREENS,
      ];

      for (const screen of allVisible) {
        await gamePage.navigateTo(screen);
        const current = await gamePage.getCurrentScreen();
        expect(current).toBe(screen);
      }

      gamePage.expectNoConsoleErrors();
    });
  });

  test.describe("Specialization-specific nav", () => {
    test("youth scout sees Youth Hub in scouting section", async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 1,
        scout: { careerTier: 1, primarySpecialization: "youth" },
      });

      const youthHub = gamePage.page.locator(navItem("youthScouting"));
      await expect(youthHub).toBeVisible();
    });

    test("first-team scout sees Players (not Youth Hub) in scouting section", async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 1,
        scout: { careerTier: 1, primarySpecialization: "firstTeam" },
      });

      const players = gamePage.page.locator(navItem("playerDatabase"));
      await expect(players).toBeVisible();
    });
  });
});
