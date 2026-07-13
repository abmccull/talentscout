import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../fixtures";

test.describe("veteran career prologue", () => {
  test.setTimeout(120_000);

  test("starts a generated case without replaying tutorial UI and preserves its choice", async ({
    page,
    gamePage,
  }) => {
    await gamePage.goto();
    await page.getByRole("button", { name: /Start Youth Career|New Game/ }).first().click();

    await expect(page.getByRole("radio", { name: /Dynamic Prologue/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Start at the Desk/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Replay Tutorial/i })).toBeVisible();

    await page.locator("#scout-first-name").fill("Mara");
    await page.locator("#scout-last-name").fill("Voss");
    await page.getByRole("button", { name: /Field Investigator/ }).first().click();
    await page.getByRole("button", { name: /Follow a fresh lead/ }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });

    await gamePage.waitForScreen("observation", 60_000);
    const opening = await page.evaluate(() => {
      const game = (window as any).__GAME_STORE__.getState();
      const tutorial = (window as any).__TUTORIAL_STORE__.getState();
      const prologue = game.gameState.veteranPrologue;
      return {
        templateId: prologue?.templateId,
        title: prologue?.title,
        deadline: prologue?.deadline,
        activityType: prologue?.activityType,
        sessionActivityType: game.activeSession?.activityType,
        choices: prologue?.choices,
        tutorialActive: tutorial.guidedSessionActive,
        forcedReplay: tutorial.guidedSessionForcedReplay,
        recentTemplates: JSON.parse(
          localStorage.getItem("talentscout_player_experience") || "{}",
        ).recentVeteranPrologueTemplateIds,
      };
    });

    expect(opening.templateId).toBeTruthy();
    expect(opening.activityType).toBe(opening.sessionActivityType);
    expect(opening.choices).toHaveLength(3);
    expect(opening.tutorialActive).toBe(false);
    expect(opening.forcedReplay).toBe(false);
    expect(opening.recentTemplates).toEqual([opening.templateId]);
    await expect(page.getByRole("heading", { name: opening.title as string })).toBeVisible();
    await expect(page.getByText(opening.deadline as string).first()).toBeVisible();
    const setupAxe = await new AxeBuilder({ page }).analyze();
    expect(setupAxe.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    )).toEqual([]);
    await page.screenshot({
      path: "artifacts/veteran-opening-ux/dynamic-prologue-setup-desktop.png",
      fullPage: true,
    });

    await gamePage.completeObservationViaUI();
    await gamePage.waitForScreen("openingDiscovery");
    await expect(page.getByTestId("opening-discovery")).toBeVisible();
    await expect(page.getByText(opening.deadline as string).first()).toBeVisible();
    const decisionAxe = await new AxeBuilder({ page }).analyze();
    expect(decisionAxe.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    )).toEqual([]);
    await page.screenshot({
      path: "artifacts/veteran-opening-ux/dynamic-prologue-decision-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    const mobileDeadline = await page.getByText(opening.deadline as string).first().boundingBox();
    const mobileDecisionHeading = await page
      .getByRole("heading", { name: /What do you do before the window closes/i })
      .boundingBox();
    expect(mobileDeadline).not.toBeNull();
    expect(mobileDecisionHeading).not.toBeNull();
    expect(
      mobileDecisionHeading!.y - (mobileDeadline!.y + mobileDeadline!.height),
      "The mobile reveal should flow directly into the decision instead of a blank scroll gap",
    ).toBeLessThan(180);
    await page.screenshot({
      path: "artifacts/veteran-opening-ux/dynamic-prologue-decision-mobile.png",
      fullPage: true,
    });

    const chosen = opening.choices[0];
    await page.getByRole("button", { name: new RegExp(chosen.label, "i") }).click();
    await gamePage.waitForScreen("reportWriter");

    const persisted = await page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const openingCase = state.openingCase;
      const decision = state.consequenceState.decisions[openingCase.decisionId];
      return {
        templateId: state.veteranPrologue?.templateId,
        stage: openingCase.stage,
        choice: openingCase.selectedChoiceId,
        ledgerChoice: decision?.selectedOptionId,
        ledgerLabel: decision?.options?.find(
          (option: any) => option.id === decision.selectedOptionId,
        )?.label,
        scheduledConsequences: Object.values(state.consequenceState.consequences)
          .filter((item: any) => item.decisionId === openingCase.decisionId)
          .length,
      };
    });

    expect(persisted).toMatchObject({
      templateId: opening.templateId,
      stage: "report",
      choice: chosen.id,
      ledgerChoice: chosen.id,
      ledgerLabel: chosen.label,
    });
    expect(persisted.scheduledConsequences).toBeGreaterThanOrEqual(2);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    )).toEqual([]);
    gamePage.expectNoConsoleErrors();
  });

  test("replays the authored tutorial only when a veteran explicitly asks", async ({
    page,
    gamePage,
  }) => {
    await gamePage.goto();
    await page.getByRole("button", { name: /Start Youth Career|New Game/ }).first().click();
    await page.getByText("Replay tutorial", { exact: true }).click();
    await expect(page.getByRole("radio", { name: /Replay tutorial/i })).toBeChecked();

    await page.locator("#scout-first-name").fill("Inez");
    await page.locator("#scout-last-name").fill("Cole");
    await page.getByRole("button", { name: /Technical Spotter/ }).first().click();
    await page.getByRole("button", { name: /Replay the discovery case/ }).click();

    await gamePage.waitForScreen("observation", 60_000);
    await expect(page.getByRole("heading", { name: "The match started early." })).toBeVisible();
    const replayState = await page.evaluate(() => {
      const game = (window as any).__GAME_STORE__.getState();
      const tutorial = (window as any).__TUTORIAL_STORE__.getState();
      return {
        hasVeteranPrologue: Boolean(game.gameState.veteranPrologue),
        activityType: game.activeSession?.activityType,
        guidedSessionActive: tutorial.guidedSessionActive,
        forcedReplay: tutorial.guidedSessionForcedReplay,
        permanentCompletion: tutorial.guidedSessionCompleted,
        permanentDismissal: tutorial.dismissed,
      };
    });

    expect(replayState).toMatchObject({
      hasVeteranPrologue: false,
      activityType: "schoolMatch",
      guidedSessionActive: true,
      forcedReplay: true,
      permanentCompletion: false,
      permanentDismissal: true,
    });
    gamePage.expectNoConsoleErrors();
  });
});
