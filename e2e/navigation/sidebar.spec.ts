import { test, expect } from "../fixtures";
import {
  navItem,
  ALWAYS_VISIBLE_SCREENS,
  WEEK2_SCREENS,
  WEEK3_SCREENS,
  TIER2_SCREENS,
  TIER2_EQUIPMENT_SCREENS,
  TIER3_SCREENS,
  TIER3_AGENCY,
  TIER4_SCREENS,
  SEASON2_SCREENS,
} from "../helpers/selectors";

const IS_YOUTH_EARLY_ACCESS = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";
const YOUTH_EA_WORKSPACES = [
  "dashboard",
  "calendar",
  "youthScouting",
  "reportHistory",
  "internationalView",
  "career",
] as const;

/**
 * These tier-gated sidebar assertions describe the broader full-game shell.
 * Youth Scout EA intentionally ships six stable workspaces and exposes the
 * rest as contextual Career/Planner/Prospect drill-downs, so running these
 * assertions against the EA build would test a product we do not ship.
 */
test.describe("Full-game tier-gated sidebar", () => {
  test.skip(
    IS_YOUTH_EARLY_ACCESS,
    "Tier-gated sidebar navigation is reserved for the planned full-game build.",
  );
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

    test("week-2+ items are hidden at week 1", async ({ gamePage }) => {
      for (const screen of WEEK2_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).not.toBeVisible();
      }
    });

    test("week-3+ items are hidden at week 1", async ({ gamePage }) => {
      for (const screen of WEEK3_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).not.toBeVisible();
      }
    });

    test("tier-2+ items are hidden at tier 1 week 1", async ({ gamePage }) => {
      for (const screen of [...TIER2_SCREENS, ...TIER2_EQUIPMENT_SCREENS]) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).not.toBeVisible();
      }
    });

    test("tier-3+ items are hidden at tier 1", async ({ gamePage }) => {
      for (const screen of [...TIER3_SCREENS, ...TIER3_AGENCY]) {
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

  test.describe("Week 5 visibility (tier 1)", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 5,
        scout: { careerTier: 1, primarySpecialization: "youth" },
      });
    });

    test("week-2 items become visible", async ({ gamePage }) => {
      for (const screen of WEEK2_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });

    test("week-3 items become visible", async ({ gamePage }) => {
      for (const screen of WEEK3_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });

    test("clicking week-unlocked items navigates correctly", async ({ gamePage }) => {
      for (const screen of [...WEEK2_SCREENS, ...WEEK3_SCREENS]) {
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

    test("equipment/training appear at tier 2", async ({ gamePage }) => {
      for (const screen of TIER2_EQUIPMENT_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });
  });

  test.describe("Tier 3 visibility", () => {
    test.beforeEach(async ({ gamePage }) => {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 15,
        scout: { careerTier: 3, primarySpecialization: "youth", reputation: 60 },
      });
    });

    test("tier-3 items appear at tier 3", async ({ gamePage }) => {
      for (const screen of TIER3_SCREENS) {
        const el = gamePage.page.locator(navItem(screen));
        await expect(el).toBeVisible();
      }
    });

    test("agency appears at tier 3", async ({ gamePage }) => {
      for (const screen of TIER3_AGENCY) {
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

    test("all tier-gated nav items are clickable and navigate without errors", async ({ gamePage }) => {
      const allVisible = [
        ...ALWAYS_VISIBLE_SCREENS,
        ...WEEK2_SCREENS,
        ...WEEK3_SCREENS,
        ...TIER2_SCREENS,
        ...TIER2_EQUIPMENT_SCREENS,
        ...TIER3_SCREENS,
        ...TIER3_AGENCY,
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
      test.skip(
        IS_YOUTH_EARLY_ACCESS,
        "First Team Scout navigation is intentionally reserved for the full-game build.",
      );
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

test.describe("Youth Scout EA permanent workspace navigation", () => {
  test.skip(
    !IS_YOUTH_EARLY_ACCESS,
    "The six-workspace navigation contract applies only to Youth Scout EA.",
  );

  test("keeps the six core workspaces available from the first week", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });

    for (const screen of YOUTH_EA_WORKSPACES) {
      await expect(gamePage.page.locator(navItem(screen))).toBeVisible();
    }

    for (const detail of ["network", "rivals", "npcManagement", "training"]) {
      await expect(gamePage.page.locator(navItem(detail))).toHaveCount(0);
    }
  });

  test("opens each core workspace from the shell", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });

    for (const screen of YOUTH_EA_WORKSPACES) {
      await gamePage.navigateTo(screen);
      expect(await gamePage.getCurrentScreen()).toBe(screen);
    }

    gamePage.expectNoConsoleErrors();
  });
});
