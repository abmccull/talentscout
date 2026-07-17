import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../fixtures";

test.describe("first-five-minute discovery hook", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("talentscout_tutorial");
      localStorage.removeItem("talentscout_player_experience");
    });
    await page.goto("/play", { waitUntil: "domcontentloaded" });
  });

  test("quick start reaches an uncertain discovery and persistent consequence through real UI", async ({ page, gamePage }) => {
    const missingResources: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 404) missingResources.push(response.url());
    });
    await page.getByRole("button", { name: /Start Youth Career|New Game/ }).first().click();
    await page.locator("#scout-first-name").fill("Ava");
    await page.locator("#scout-last-name").fill("Morgan");

    const persona = page.getByRole("button", { name: /Projection Specialist/ }).first();
    await persona.click();
    await expect(persona).toHaveAttribute("aria-pressed", "true");

    const takeCall = page.getByRole("button", { name: /Take the call/ });
    await takeCall.scrollIntoViewIfNeeded();
    await expect(takeCall).toBeEnabled();
    await takeCall.click();

    await gamePage.waitForScreen("observation", 60_000);
    await expect(page.getByRole("heading", { name: "The match started early." })).toBeVisible();
    await expect(page.getByText(/Being first, not being certain/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /End (Session )?Early/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Watch the match" }).click();
    await page.getByRole("button", { name: /^Use technical lens for / }).click();
    await page.getByRole("button", { name: "Next Phase" }).click();

    const evidence = page.locator('[data-tutorial-id="observation-evidence-feed"]');
    await expect(evidence.getByText("Standout")).toBeVisible();
    await evidence.getByRole("button", { name: "Flag this moment" }).first().click();
    await page.getByRole("button", { name: "Promising" }).click();
    await expect(page.getByText(/moment flagged/i)).toBeVisible();

    await page.getByRole("button", { name: "Next Phase" }).click();
    await expect(evidence.getByText("Under Pressure").first()).toBeVisible();
    await page.getByRole("button", { name: "Go to Reflection" }).click();

    const completeReflection = page.getByRole("button", { name: "Complete Reflection" });
    await completeReflection.scrollIntoViewIfNeeded();
    await completeReflection.click();

    await gamePage.waitForScreen("openingDiscovery");
    await expect(page.getByTestId("opening-discovery")).toBeVisible();
    await expect(page.getByText("Write the name down.")).toBeVisible();
    await expect(page.getByText(/One exceptional action is a lead, not proof/i)).toBeVisible();

    await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const serialized = JSON.parse(JSON.stringify(store.getState().gameState));
      store.getState().loadGame(serialized);
    });
    await gamePage.waitForScreen("openingDiscovery");
    await expect(page.getByTestId("opening-discovery")).toBeVisible();

    await page.getByRole("button", { name: /Keep the name private/ }).click();
    await gamePage.waitForScreen("reportWriter");
    await expect(page.getByText("First report mode")).toBeVisible();
    await expect(page.getByText("Lock the first read, the doubt, and the next move")).toBeVisible();
    await expect(page.getByText("Current read", { exact: true })).toBeVisible();
    await expect(page.getByText("Key uncertainty", { exact: true })).toBeVisible();
    await expect(page.getByText("Recommended next step", { exact: true })).toBeVisible();
    await expect(page.getByText("Answer a real club need")).toHaveCount(0);
    await expect(page.getByLabel(/Ask (Margaret|Tommy) for help/i)).toHaveCount(0);

    const persisted = await page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const openingCase = state.openingCase;
      const decision = state.consequenceState.decisions[openingCase.decisionId];
      return {
        stage: openingCase.stage,
        choice: openingCase.selectedChoiceId,
        discovered: state.discoveryRecords.filter(
          (record: any) => record.playerId === openingCase.playerId,
        ).length,
        selectedOptionId: decision?.selectedOptionId,
        scheduledStages: Object.values(state.consequenceState.consequences)
          .filter((item: any) => item.decisionId === openingCase.decisionId)
          .length,
      };
    });
    expect(persisted).toMatchObject({
      stage: "report",
      choice: "protect",
      discovered: 1,
      selectedOptionId: "protect",
    });
    expect(persisted.scheduledStages).toBeGreaterThanOrEqual(2);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
    await page.getByLabel("Current read").fill(
      "Early signs point to a live attacking lead worth protecting and testing again quickly.",
    );
    await page.getByLabel("Key uncertainty").fill(
      "The standout action has not yet repeated once the pressure and match state change.",
    );
    await page.getByRole("radio", { name: /^Test next\b/ }).click();
    await page.getByRole("radio", { name: /^Recommend\b/ }).click();
    await page.getByRole("button", { name: /^Submit Report$/ }).click();
    await gamePage.waitForScreen("reportHistory");

    const latestReport = await page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const reports = Object.values(state?.reports ?? {}) as any[];
      return reports.at(-1) ?? null;
    });
    expect(latestReport).not.toBeNull();
    expect(latestReport.summary).toContain("Current read:");
    expect(latestReport.summary).toContain("Key uncertainty:");
    expect(latestReport.summary).toContain("Recommended next step:");
    expect(latestReport.briefId ?? null).toBeNull();
    expect(missingResources, "The opening flow requested missing production assets").toEqual([]);
    gamePage.expectNoConsoleErrors();
  });
});
