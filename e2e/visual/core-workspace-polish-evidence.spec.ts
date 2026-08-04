import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../fixtures";
import { getVisualEvidenceDirectory } from "../helpers/releaseEvidencePath";

const evidenceDir = getVisualEvidenceDirectory("core-workspace-polish");
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const workspaces = [
  { screen: "dashboard", name: "desk" },
  { screen: "calendar", name: "planner" },
  { screen: "reportHistory", name: "reports" },
  { screen: "career", name: "career" },
] as const;

test.describe("Core workspace polish evidence", () => {
  test.setTimeout(180_000);

  test("captures responsive decision-first workspaces without blocking accessibility faults", async ({ gamePage }) => {
    await mkdir(evidenceDir, { recursive: true });
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 12,
      scout: {
        firstName: "Maya",
        lastName: "Reed",
        careerTier: 2,
        reputation: 52,
        primarySpecialization: "youth",
      },
    });

    for (const workspace of workspaces) {
      await gamePage.setScreen(workspace.screen);
      for (const viewport of viewports) {
        await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });
        const dismissAchievement = gamePage.page.getByRole("button", {
          name: "Dismiss achievement notification",
        });
        if (await dismissAchievement.isVisible({ timeout: 250 }).catch(() => false)) {
          await dismissAchievement.click();
        }
        await gamePage.page.waitForTimeout(250);

        await gamePage.page.screenshot({
          path: path.join(evidenceDir, `${viewport.name}-${workspace.name}.png`),
          fullPage: true,
        });

        const widths = await gamePage.page.evaluate(() => {
          const main = document.querySelector<HTMLElement>("#game-main");
          return {
            viewport: document.documentElement.clientWidth,
            document: document.documentElement.scrollWidth,
            mainClient: main?.clientWidth ?? 0,
            mainScroll: main?.scrollWidth ?? 0,
          };
        });
        expect(
          widths.document,
          `${workspace.name} ${viewport.name} document overflow: ${JSON.stringify(widths)}`,
        ).toBeLessThanOrEqual(widths.viewport + 1);
        if (widths.mainClient > 0) {
          expect(
            widths.mainScroll,
            `${workspace.name} ${viewport.name} workspace overflow: ${JSON.stringify(widths)}`,
          ).toBeLessThanOrEqual(widths.mainClient + 1);
        }

        const scan = await new AxeBuilder({ page: gamePage.page }).analyze();
        const blocking = scan.violations.filter(
          (violation) => violation.impact === "serious" || violation.impact === "critical",
        );
        expect(
          blocking,
          `${workspace.name} ${viewport.name} blocking Axe violations:\n${JSON.stringify(blocking, null, 2)}`,
        ).toEqual([]);
      }
    }

    gamePage.expectNoConsoleErrors();
  });
});
