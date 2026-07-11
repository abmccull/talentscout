import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { SPECIALIZATIONS, SELECTORS } from "../helpers/selectors";

const youthEarlyAccess = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";
const specializationsUnderTest = youthEarlyAccess
  ? (["youth"] as const)
  : SPECIALIZATIONS;

const SPEC_DISPLAY_NAMES: Record<(typeof SPECIALIZATIONS)[number], string> = {
  youth: "Youth Scout",
  firstTeam: "First Team Scout",
  regional: "Regional Expert",
  data: "Data Scout",
};

async function allocateEightPoints(page: Page, specialization: keyof typeof SPEC_DISPLAY_NAMES) {
  const allocations: Record<string, Record<string, number>> = {
    youth: {
      technicalEye: 2,
      physicalAssessment: 1,
      psychologicalRead: 1,
      playerJudgment: 1,
      potentialAssessment: 3,
    },
    firstTeam: {
      technicalEye: 1,
      physicalAssessment: 1,
      tacticalUnderstanding: 2,
      playerJudgment: 3,
      potentialAssessment: 1,
    },
    regional: {
      technicalEye: 1,
      psychologicalRead: 1,
      tacticalUnderstanding: 1,
      dataLiteracy: 1,
      playerJudgment: 2,
      potentialAssessment: 2,
    },
    data: {
      technicalEye: 1,
      tacticalUnderstanding: 1,
      dataLiteracy: 4,
      playerJudgment: 1,
      potentialAssessment: 1,
    },
  };

  for (const [skill, amount] of Object.entries(allocations[specialization])) {
    for (let i = 0; i < amount; i++) {
      await page.getByRole("button", { name: `Increase ${skill}` }).click();
    }
  }
}

test.describe("New Game Wizard", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
  });

  test("main menu uses the active entry point label", async ({ gamePage }) => {
    await expect(gamePage.page.locator(SELECTORS.newGameButton).first()).toBeVisible();

    if (youthEarlyAccess) {
      await expect(
        gamePage.page.getByRole("button", { name: /^Scenarios$/ }),
      ).toHaveCount(0);
    }
  });

  for (const specialization of specializationsUnderTest) {
    test(`complete wizard with ${specialization} specialization`, async ({ gamePage }) => {
      await gamePage.startNewGame({
        firstName: "E2E",
        lastName: `${specialization}Tester`,
        specialization,
      });

      expect(await gamePage.getCurrentScreen()).toBe("dashboard");
      expect(await gamePage.getSpecialization()).toBe(specialization);
      expect(await gamePage.getGameStateValue("scout.firstName")).toBe("E2E");

      if (youthEarlyAccess) {
        expect(await gamePage.getGameStateValue("scout.currentClubId")).toBeFalsy();
        expect(await gamePage.getGameStateValue("scout.salary")).toBe(0);
      }

      gamePage.expectNoConsoleErrors();
    });
  }

  test("wizard enforces required fields on step 1", async ({ gamePage }) => {
    await gamePage.page.locator(SELECTORS.newGameButton).first().click();

    const firstNameInput = gamePage.page.locator(SELECTORS.firstNameInput);
    const lastNameInput = gamePage.page.locator(SELECTORS.lastNameInput);
    const continueButton = gamePage.page.getByRole("button", { name: /^Continue$/ });

    await firstNameInput.fill("");
    await lastNameInput.fill("");
    await expect(continueButton).toBeDisabled();

    await firstNameInput.fill("Test");
    await expect(continueButton).toBeDisabled();

    await lastNameInput.fill("Scout");
    await expect(continueButton).toBeEnabled();

    await continueButton.click();
    if (youthEarlyAccess) {
      await expect(
        gamePage.page.getByRole("heading", { name: "Customize Your Skills" }),
      ).toBeVisible();
    } else {
      await expect(
        gamePage.page.getByRole("button", { name: /Youth Scout/ }),
      ).toBeVisible();
    }
  });

  test("wizard requires exactly eight skill points before continuing", async ({ gamePage }) => {
    await gamePage.page.locator(SELECTORS.newGameButton).first().click();

    await gamePage.page.locator(SELECTORS.firstNameInput).fill("Youth");
    await gamePage.page.locator(SELECTORS.lastNameInput).fill("Tester");
    await gamePage.page.getByRole("button", { name: /^Continue$/ }).click();

    if (!youthEarlyAccess) {
      await gamePage.page
        .getByRole("button", { name: new RegExp(SPEC_DISPLAY_NAMES.youth) })
        .click();
      await gamePage.page.getByRole("button", { name: /^Continue$/ }).click();
    }

    await expect(
      gamePage.page.getByText(/Assign all 8 bonus skill points to continue/i),
    ).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: /^Continue$/ })).toBeDisabled();

    await allocateEightPoints(gamePage.page, "youth");
    await expect(
      gamePage.page.getByText(/All 8 bonus skill points assigned/i),
    ).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: /^Continue$/ })).toBeEnabled();

    await gamePage.page.getByRole("button", { name: /^Continue$/ }).click();

    if (youthEarlyAccess) {
      await expect(
        gamePage.page.getByRole("heading", { name: "Build Your World" }),
      ).toBeVisible();
    }
  });
});
