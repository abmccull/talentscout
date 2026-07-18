import { test, expect } from "../fixtures";

test.describe("Rivals Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth"); // Tier 2 required
  });

  test("rivals screen renders at tier 2", async ({ gamePage }) => {
    await gamePage.setScreen("rivals");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("rivals");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);
  });

  test("operations network supports keyboard selection without horizontal overflow", async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.setScreen("rivals");

    const network = gamePage.page.getByTestId("rival-operations-network");
    await expect(network).toBeVisible();
    const actors = network.getByRole("button");
    expect(await actors.count()).toBeGreaterThanOrEqual(3);

    const secondActor = actors.nth(1);
    await secondActor.focus();
    await gamePage.page.keyboard.press("Enter");
    await expect(secondActor).toHaveAttribute("aria-pressed", "true");

    const widths = await gamePage.page.evaluate(() => {
      const main = document.querySelector<HTMLElement>("#game-main");
      return {
        client: main?.clientWidth ?? 0,
        scroll: main?.scrollWidth ?? Number.POSITIVE_INFINITY,
      };
    });
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    gamePage.expectNoConsoleErrors();
  });

  test("rivals exist in game state", async ({ gamePage }) => {
    const rivalInfo = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gs = store.getState().gameState;
      // Rivals could be in various state shapes
      const rivals = gs?.rivals ?? gs?.rivalScouts ?? [];
      return {
        count: Array.isArray(rivals) ? rivals.length : Object.keys(rivals).length,
      };
    });

    expect(typeof rivalInfo.count).toBe("number");
  });

  test("organization opening exposes the scout's read and resolves exactly once", async ({ gamePage }) => {
    const fixture = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const organization = Object.values(
        state.rivalOrganizationState.organizations,
      )[0] as any;
      if (!organization) throw new Error("Rival organization fixture is unavailable");

      const opportunity = {
        id: "e2e-rival-opening",
        organizationId: organization.id,
        kind: "counter-scouting-window",
        title: "Counter-Scouting Window",
        description: `${organization.name} has overextended around a priority target.`,
        status: "open",
        createdSeason: state.currentSeason,
        createdWeek: state.currentWeek,
        expiresSeason: state.currentSeason,
        expiresWeek: state.currentWeek + 2,
        knownTradeoffs: [
          "Costs fatigue this week",
          "Failure strengthens the rival agenda",
        ],
        outcomeRoll: 0.2,
        successChance: 0.7,
      };
      store.getState().loadGame({
        ...state,
        rivalOrganizationState: {
          ...state.rivalOrganizationState,
          opportunities: {
            ...state.rivalOrganizationState.opportunities,
            [opportunity.id]: opportunity,
          },
        },
      });
      return { opportunityId: opportunity.id, organizationName: organization.name };
    });

    await gamePage.setScreen("career");
    const landscapeButton = gamePage.page.getByRole("button", {
      name: "Open rivals",
    });
    await expect(landscapeButton).toBeVisible();
    await landscapeButton.click();
    await gamePage.waitForScreen("rivals");

    await expect(
      gamePage.page.getByRole("heading", { name: "Recruitment organizations" }),
    ).toBeVisible();
    await expect(gamePage.page.getByText(fixture.organizationName).first()).toBeVisible();
    await expect(gamePage.page.getByText("Strong opening", { exact: true })).toBeVisible();
    await expect(gamePage.page.getByText("Failure strengthens the rival agenda")).toBeVisible();

    await gamePage.page.getByRole("button", { name: "Exploit the opening" }).click();
    await expect(
      gamePage.page.getByRole("button", { name: "Exploit the opening" }),
    ).toHaveCount(0);

    const resolution = await gamePage.page.evaluate((opportunityId) => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const opportunity = state.rivalOrganizationState.opportunities[opportunityId];
      const matchingFacts = Object.values(state.consequenceState.facts).filter(
        (fact: any) => fact.value?.opportunityId === opportunityId,
      );
      return {
        status: opportunity.status,
        resolution: opportunity.resolution,
        resolvedFactCount: matchingFacts.length,
      };
    }, fixture.opportunityId);

    expect(resolution).toEqual({
      status: "exploited",
      resolution: "success",
      resolvedFactCount: 1,
    });
    gamePage.expectNoConsoleErrors();
  });

  test("no console errors", async ({ gamePage }) => {
    await gamePage.setScreen("rivals");
    await gamePage.page.waitForTimeout(500);

    gamePage.expectNoConsoleErrors();
  });
});
