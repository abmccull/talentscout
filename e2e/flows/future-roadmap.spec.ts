import AxeBuilder from "@axe-core/playwright";
import { test, expect, type GamePage } from "../fixtures";

async function openMainMenu(gamePage: GamePage) {
  await gamePage.goto();
  const skipIntro = gamePage.page.getByRole("button", { name: "Skip intro" });
  if (await skipIntro.isVisible({ timeout: 500 }).catch(() => false)) {
    await skipIntro.click();
  }
  await expect(gamePage.page.getByTestId("main-menu-actions")).toBeVisible();
}

test.describe("Future product roadmap", () => {
  test("is an honest, keyboard-operable support destination before a career", async ({
    gamePage,
  }) => {
    await openMainMenu(gamePage);
    await gamePage.page.getByRole("button", { name: "Future roadmap" }).click();
    await gamePage.waitForScreen("futureRoadmap");

    await expect(gamePage.page.getByTestId("future-roadmap-screen")).toBeVisible();
    await expect(
      gamePage.page.getByRole("heading", { name: "Product roadmap", level: 1 }),
    ).toBeVisible();
    await expect(gamePage.page.getByText(/living product direction, not a promise/i)).toBeVisible();
    await expect(gamePage.page.getByText("Youth Scout Early Access").first()).toBeVisible();

    const overviewTab = gamePage.page.getByRole("tab", { name: "Overview" });
    const modesTab = gamePage.page.getByRole("tab", { name: "Game modes" });
    await overviewTab.focus();
    await gamePage.page.keyboard.press("ArrowRight");
    await expect(modesTab).toHaveAttribute("aria-selected", "true");
    await expect(gamePage.page.getByTestId("roadmap-modes")).toBeVisible();
    await expect(gamePage.page.getByRole("heading", { name: "First Team Scout" })).toBeVisible();
    await expect(gamePage.page.getByText("Planned direction").first()).toBeVisible();

    await gamePage.page.getByRole("tab", { name: "Quality bar" }).click();
    await expect(gamePage.page.getByTestId("roadmap-quality-bar")).toBeVisible();
    await expect(gamePage.page.getByText("Evidence before expansion")).toBeVisible();

    const axe = await new AxeBuilder({ page: gamePage.page }).analyze();
    expect(
      axe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);

    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    const widths = await gamePage.page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);

    await gamePage.page.getByRole("button", { name: "Back to main menu" }).click();
    await gamePage.waitForScreen("mainMenu");
    await expect(gamePage.page.getByTestId("main-menu-actions")).toBeVisible();
  });

  test("discloses verified backup, damaged, and remote-recovery save states", async ({
    gamePage,
  }) => {
    await openMainMenu(gamePage);

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.setState({
        saveSlots: [
          {
            slot: 0,
            source: "local",
            name: "Autosave",
            scoutName: "Maya Reed",
            specialization: "youth",
            season: 3,
            week: 12,
            reputation: 47,
            savedAt: 3_000,
            recovery: {
              archiveId: "verified-autosave",
              slot: 0,
              reason: "newest-corrupt",
              recoveredSavedAt: 3_000,
              message: "Newest save generation was damaged. Loaded the last verified backup.",
            },
          },
          {
            slot: 1,
            source: "local",
            name: "Broken Career",
            scoutName: "Maya Reed",
            specialization: "youth",
            season: 4,
            week: 2,
            reputation: 51,
            savedAt: 4_000,
            unavailable: {
              reason: "unrecoverable-corruption",
              message: "This save is damaged and no verified recovery copy exists.",
            },
          },
          {
            slot: 2,
            source: "supabase",
            name: "Cloud Career",
            scoutName: "Maya Reed",
            specialization: "youth",
            season: 2,
            week: 8,
            reputation: 38,
            savedAt: 2_000,
            localUnavailable: {
              reason: "unrecoverable-corruption",
              message: "The local copy is damaged.",
            },
          },
        ],
      });
    });

    await expect(
      gamePage.page.getByRole("button", { name: "Continue from verified backup" }),
    ).toBeEnabled();
    await expect(
      gamePage.page.getByText(/Continue will load the last verified backup/i),
    ).toBeVisible();

    await gamePage.page.getByRole("button", { name: "Load Game" }).click();
    await expect(
      gamePage.page.getByRole("button", { name: "Load Autosave from verified backup" }),
    ).toBeEnabled();
    await expect(gamePage.page.getByText("Verified backup").first()).toBeVisible();

    const damagedLoad = gamePage.page.getByRole("button", { name: "Load Broken Career" });
    await expect(damagedLoad).toBeDisabled();
    await expect(
      gamePage.page.getByText("This save is damaged and no verified recovery copy exists."),
    ).toBeVisible();

    await expect(
      gamePage.page.getByRole("button", { name: "Load Cloud Career from cloud recovery" }),
    ).toBeEnabled();
    await expect(
      gamePage.page.getByText(/verified remote copy can still be loaded/i),
    ).toBeVisible();
  });
});
