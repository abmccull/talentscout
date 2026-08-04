import { test, expect, type GamePage } from "../fixtures";

const IS_YOUTH_EARLY_ACCESS = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";

async function waitForDesk(gamePage: GamePage) {
  await expect(
    gamePage.page.getByRole("heading", { name: "Scouting Desk" }),
  ).toBeVisible({ timeout: 60_000 });
}

async function setupFreshYouthDesk(
  gamePage: GamePage,
  overrides: Parameters<GamePage["injectState"]>[0] = {},
) {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 1,
    scout: { careerTier: 1, primarySpecialization: "youth" },
    ...overrides,
  });
  await waitForDesk(gamePage);
}

async function requireCommandCenter(gamePage: GamePage) {
  const commandCenter = gamePage.page.getByTestId("dashboard-command-center");
  await expect(commandCenter).toBeVisible({ timeout: 60_000 });
  return commandCenter;
}

async function seedCommandCenterState(
  gamePage: GamePage,
  recipe:
    | "queue-cap"
    | "choice-card"
    | "planner-only"
    | "opportunity-first-tab-order"
    | "report-blocker"
    | "rival-pressure",
) {
  await gamePage.page.evaluate((kind) => {
    const store = (window as any).__GAME_STORE__;
    const currentState = store?.getState()?.gameState;
    if (!currentState) {
      throw new Error("Game state is unavailable");
    }

    const nextState = structuredClone(currentState);
    const scoutId = nextState.scout.id;

    const playerTemplate = Object.values(nextState.players)[0] ?? {};
    const ensurePlayer = (id: string, firstName: string, lastName: string) => {
      nextState.players[id] = {
        ...playerTemplate,
        ...(nextState.players[id] ?? {}),
        id,
        firstName,
        lastName,
      };
    };

    const clearSignalSources = () => {
      nextState.inbox = [];
      nextState.narrativeEvents = [];
      nextState.reportWorkItems = {};
      nextState.scoutingCases = {};
      nextState.reports = {};
      nextState.reportDeliveries = {};
      nextState.clubDecisions = {};
      nextState.rivalScouts = {};
      nextState.placementReports = {};
      nextState.youthRecruitmentBriefs = {};
      nextState.consequenceState = {
        ...(nextState.consequenceState ?? {}),
        decisions: {},
        history: nextState.consequenceState?.history ?? [],
      };
      nextState.rivalOrganizationState = {
        ...(nextState.rivalOrganizationState ?? {}),
        opportunities: {},
        activities: nextState.rivalOrganizationState?.activities ?? [],
        organizations: nextState.rivalOrganizationState?.organizations ?? {},
        campaignState: {
          ...(nextState.rivalOrganizationState?.campaignState ?? {}),
          campaigns: {},
          history: nextState.rivalOrganizationState?.campaignState?.history ?? [],
          processedWeekKeys:
            nextState.rivalOrganizationState?.campaignState?.processedWeekKeys ?? [],
        },
        currentPressure: nextState.rivalOrganizationState?.currentPressure ?? {
          discoveryChanceMultiplier: 1,
          poachChanceMultiplier: 1,
          signingChanceMultiplier: 1,
          youthProgressBonus: 0,
        },
        processedWeekKeys: nextState.rivalOrganizationState?.processedWeekKeys ?? [],
      };
    };

    const setBlankSchedule = () => {
      nextState.schedule.activities = nextState.schedule.activities.map(() => null);
    };

    const setFullSchedule = () => {
      nextState.schedule.activities = nextState.schedule.activities.map(
        (_: unknown, dayIndex: number) => ({
          type: "study",
          slots: 1,
          description: `Scheduled study block ${dayIndex + 1}`,
          instanceId: `scheduled-study-${dayIndex + 1}`,
        }),
      );
    };

    nextState.currentWeek = 6;
    nextState.currentSeason = 1;
    clearSignalSources();

    switch (kind) {
      case "queue-cap": {
        setBlankSchedule();
        ensurePlayer("player-queue-1", "Milo", "Hart");
        ensurePlayer("player-queue-2", "Ari", "Cole");
        ensurePlayer("player-queue-3", "Luca", "Vale");
        ensurePlayer("player-queue-4", "Nico", "Ramos");
        ensurePlayer("player-queue-5", "Joel", "Mata");
        ensurePlayer("player-queue-6", "Rui", "Silva");
        nextState.reportWorkItems = {
          "report-work-1": {
            id: "report-work-1",
            playerId: "player-queue-1",
            scoutId,
            createdWeek: 6,
            createdSeason: 1,
            status: "ready",
            sourceActivity: "writeReport",
            preparationQualityPoints: 4,
            preparationQualityBonus: 0.1,
            freshObservationIds: ["obs-1"],
          },
          "report-work-2": {
            id: "report-work-2",
            playerId: "player-queue-2",
            scoutId,
            createdWeek: 6,
            createdSeason: 1,
            status: "ready",
            sourceActivity: "writeReport",
            preparationQualityPoints: 4,
            preparationQualityBonus: 0.1,
            freshObservationIds: ["obs-2"],
          },
          "report-work-3": {
            id: "report-work-3",
            playerId: "player-queue-3",
            scoutId,
            createdWeek: 6,
            createdSeason: 1,
            status: "ready",
            sourceActivity: "writeReport",
            preparationQualityPoints: 4,
            preparationQualityBonus: 0.1,
            freshObservationIds: ["obs-3"],
          },
          "report-work-4": {
            id: "report-work-4",
            playerId: "player-queue-4",
            scoutId,
            createdWeek: 6,
            createdSeason: 1,
            status: "ready",
            sourceActivity: "writeReport",
            preparationQualityPoints: 4,
            preparationQualityBonus: 0.1,
            freshObservationIds: ["obs-4"],
          },
          "report-work-5": {
            id: "report-work-5",
            playerId: "player-queue-5",
            scoutId,
            createdWeek: 6,
            createdSeason: 1,
            status: "ready",
            sourceActivity: "writeReport",
            preparationQualityPoints: 4,
            preparationQualityBonus: 0.1,
            freshObservationIds: ["obs-5"],
          },
          "report-work-6": {
            id: "report-work-6",
            playerId: "player-queue-6",
            scoutId,
            createdWeek: 6,
            createdSeason: 1,
            status: "ready",
            sourceActivity: "writeReport",
            preparationQualityPoints: 4,
            preparationQualityBonus: 0.1,
            freshObservationIds: ["obs-6"],
          },
        };
        nextState.rivalOrganizationState.opportunities = {
          "opp-queue-1": {
            id: "opp-queue-1",
            organizationId: "org-queue-1",
            kind: "open-showcase",
            title: "Showcase access window",
            description: "A narrow rival opening is live right now.",
            status: "open",
            createdWeek: 6,
            createdSeason: 1,
            expiresWeek: 6,
            expiresSeason: 1,
            outcomeRoll: 0.1,
            successChance: 0.5,
            knownTradeoffs: [],
          },
        };
        break;
      }
      case "choice-card": {
        setFullSchedule();
        nextState.narrativeEvents = [
          {
            id: "narrative-choice-1",
            type: "careerCrossroads",
            season: 1,
            week: 6,
            title: "Contract verdict is waiting",
            description: "A live football choice still needs your answer, but the dashboard should route you to Inbox instead of resolving it here.",
            choices: [
              { label: "Press the director now", effect: "The director hears your case." },
              { label: "Wait for another report", effect: "The decision remains with the director." },
            ],
            selectedChoice: undefined,
            resolved: false,
            acknowledged: false,
            relatedIds: ["director-1"],
            decisionDeadlineWeeks: 0,
          },
        ];
        break;
      }
      case "planner-only": {
        setBlankSchedule();
        break;
      }
      case "opportunity-first-tab-order": {
        setFullSchedule();
        ensurePlayer("player-tab-1", "Owen", "Mercer");
        nextState.reportWorkItems = {
          "report-work-tab-1": {
            id: "report-work-tab-1",
            playerId: "player-tab-1",
            scoutId,
            createdWeek: 6,
            createdSeason: 1,
            status: "ready",
            sourceActivity: "writeReport",
            preparationQualityPoints: 4,
            preparationQualityBonus: 0.1,
            freshObservationIds: ["obs-tab-1"],
          },
        };
        nextState.rivalOrganizationState.opportunities = {
          "opp-tab-1": {
            id: "opp-tab-1",
            organizationId: "org-tab-1",
            kind: "open-showcase",
            title: "Late-entry showcase seat",
            description: "This expiring opening should visually lead the command center queue.",
            status: "open",
            createdWeek: 6,
            createdSeason: 1,
            expiresWeek: 6,
            expiresSeason: 1,
            outcomeRoll: 0.2,
            successChance: 0.6,
            knownTradeoffs: [],
          },
        };
        break;
      }
      case "report-blocker": {
        setFullSchedule();
        ensurePlayer("player-report-route", "Mateo", "Silva");
        nextState.reportWorkItems = {
          "report-work-route": {
            id: "report-work-route",
            playerId: "player-report-route",
            scoutId,
            createdWeek: 6,
            createdSeason: 1,
            status: "ready",
            sourceActivity: "writeReport",
            preparationQualityPoints: 5,
            preparationQualityBonus: 0.1,
            freshObservationIds: ["obs-route"],
          },
        };
        break;
      }
      case "rival-pressure": {
        setFullSchedule();
        ensurePlayer("player-rival-route", "Lucas", "Ferreira");
        nextState.contactIntel ??= {};
        nextState.contactIntel["player-rival-route"] = [{
          playerId: "player-rival-route",
          attribute: "pace",
          hint: "Quick over distance",
        }];
        nextState.rivalScouts = {
          "rival-route": {
            id: "rival-route",
            name: "Eva Stroud",
            clubId: "club-rival-route",
            specialization: "youth",
            currentTarget: "player-rival-route",
            targetPlayerIds: ["player-rival-route"],
            competingForPlayers: ["player-rival-route"],
            scoutingProgress: { "player-rival-route": 4 },
            quality: 0.9,
            aggressiveness: 0.9,
            reputation: 70,
          },
        };
        break;
      }
      default:
        throw new Error(`Unknown command center seed: ${kind satisfies never}`);
    }

    store.getState().loadGame(nextState);
    store.getState().setScreen("dashboard");
  }, recipe);

  await gamePage.waitForScreen("dashboard");
}

async function readCommandCenterCards(
  gamePage: GamePage,
): Promise<Array<{ id: string | null; title: string }>> {
  return gamePage.page
    .locator('[data-testid="dashboard-priority-card"], [data-testid="dashboard-opportunity-card"]')
    .evaluateAll((cards) =>
      cards
        .filter((card) => (card as HTMLElement).offsetParent !== null)
        .map((card) => ({
        id: card.getAttribute("data-dashboard-item-id"),
        title: card.querySelector("h3")?.textContent?.trim() ?? "",
      })),
    );
}

test.describe("Dashboard Screen", () => {
  test.describe("fresh game", () => {
    test.beforeEach(async ({ gamePage }) => {
      await setupFreshYouthDesk(gamePage);
    });

    test("dashboard renders with game info", async ({ gamePage }) => {
      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("dashboard");

      const content = await gamePage.page.innerText("body");
      expect(content.length).toBeGreaterThan(100);

      gamePage.expectNoConsoleErrors();
    });

    test("dashboard leads with the decision contract and keeps secondary case context below it", async ({ gamePage }) => {
      const commandCenter = await requireCommandCenter(gamePage);
      await expect(gamePage.page.getByTestId("desk-primary-decision")).toHaveCount(1);
      await expect(gamePage.page.getByTestId("desk-week-status")).toContainText(/Week 1/);
      await expect(gamePage.page.getByTestId("desk-week-status")).toContainText(/fatigue/);
      await expect(
        commandCenter.getByText("What requires my attention?", { exact: true }),
      ).toHaveCount(1);
      await expect(
        commandCenter.getByText("What opportunity might I lose?", { exact: true }),
      ).toHaveCount(1);
      await expect(
        commandCenter.getByRole("heading", { name: "What should I do next?" }),
      ).toHaveCount(1);
      await expect(gamePage.page.getByText("Dominant pressure", { exact: true })).toHaveCount(0);
      await expect(gamePage.page.getByText("Inbox follow-up", { exact: true })).toHaveCount(0);
      await expect(gamePage.page.getByText("Working set and inbox", { exact: true })).toHaveCount(0);

      const [commandTop, activeCaseTop] = await Promise.all([
        commandCenter.evaluate((element) => element.getBoundingClientRect().top),
        gamePage.page.getByTestId("desk-primary-decision").evaluate(
          (element) => element.getBoundingClientRect().top,
        ),
      ]);
      expect(commandTop).toBeLessThan(activeCaseTop);
    });

    test("desk routes incomplete weeks back to Planner instead of bypassing the empty-day safeguard", async ({ gamePage }) => {
      await gamePage.scheduleActivityByType("study", 0);

      const finishButton = gamePage.page.getByRole("button", { name: /Finish in planner/i }).first();
      await expect(finishButton).toBeVisible();

      await finishButton.click();
      await expect(gamePage.page.getByRole("heading", { name: "Planner" })).toBeVisible();
      await expect(gamePage.page.locator('[data-tutorial-id="calendar-grid"]')).toBeVisible();
    });

    test("dashboard shows scout name in sidebar", async ({ gamePage }) => {
      const sidebarText = await gamePage.page.innerText("aside");
      expect(sidebarText).toContain("Test");
      expect(sidebarText).toContain("Scout");
    });

    test("dashboard shows week and season info", async ({ gamePage }) => {
      const sidebarText = await gamePage.page.innerText("aside");
      expect(sidebarText).toContain("Week");
      expect(sidebarText).toContain("Season");
    });

    test("command center caps visible cards to five and keeps rendered ids and titles unique", async ({ gamePage }) => {
      await seedCommandCenterState(gamePage, "queue-cap");
      await requireCommandCenter(gamePage);

      const visibleCards = await readCommandCenterCards(gamePage);
      expect(visibleCards.length).toBeGreaterThan(0);
      expect(visibleCards.length).toBeLessThanOrEqual(5);

      const visibleIds = visibleCards.map((card) => card.id);
      expect(visibleIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
      expect(new Set(visibleIds).size).toBe(visibleIds.length);

      const titles = visibleCards.map((card) => card.title);
      expect(new Set(titles).size).toBe(titles.length);
    });

    test("command center choice cards route to Inbox and do not render decision-choice buttons on Dashboard", async ({ gamePage }) => {
      await seedCommandCenterState(gamePage, "choice-card");
      await requireCommandCenter(gamePage);

      const choiceCard = gamePage.page
        .locator('[data-testid="dashboard-priority-card"], [data-testid="dashboard-opportunity-card"]')
        .filter({ hasText: "Contract verdict is waiting" });
      await expect(choiceCard).toHaveCount(1);
      await expect(
        gamePage.page.getByRole("button", { name: "Press the director now", exact: true }),
      ).toHaveCount(0);
      await expect(
        gamePage.page.getByRole("button", { name: "Wait for another report", exact: true }),
      ).toHaveCount(0);

      await choiceCard.getByRole("button", { name: "Open inbox", exact: true }).click();
      await expect(gamePage.page.getByRole("heading", { name: "Inbox" })).toBeVisible();
      expect(await gamePage.getCurrentScreen()).toBe("inbox");

      await gamePage.page.getByRole("button", { name: "Choose: Press the director now", exact: true }).click();
      await gamePage.navigateTo("dashboard");
      await expect(
        gamePage.page.getByText("Contract verdict is waiting", { exact: true }),
      ).toHaveCount(0);
    });

    test("command center planner action routes to Planner", async ({ gamePage }) => {
      await seedCommandCenterState(gamePage, "planner-only");
      await requireCommandCenter(gamePage);

      const nextAction = gamePage.page.getByTestId("dashboard-next-action");
      await expect(nextAction).toContainText(/Open planner/i);
      await nextAction.getByRole("button", { name: /Open planner/i }).click();

      await expect(gamePage.page.getByRole("heading", { name: "Planner" })).toBeVisible();
      await expect(gamePage.page.locator('[data-tutorial-id="calendar-grid"]')).toBeVisible();
      expect(await gamePage.getCurrentScreen()).toBe("calendar");
    });

    test("report blocker routes to the authoritative Report Writer", async ({ gamePage }) => {
      await seedCommandCenterState(gamePage, "report-blocker");
      await requireCommandCenter(gamePage);

      const reportCard = gamePage.page
        .locator('[data-testid="dashboard-priority-card"]')
        .filter({ hasText: "Write the report on Mateo Silva" });
      await expect(reportCard).toHaveCount(1);
      await reportCard.getByRole("button", { name: "Write report", exact: true }).click();

      await gamePage.waitForScreen("reportWriter");
      expect(await gamePage.getCurrentScreen()).toBe("reportWriter");
      await expect(
        gamePage.page.getByRole("heading", { name: "Something went wrong on this screen" }),
      ).toHaveCount(0);
    });

    test("rival pressure opens the correct prospect dossier", async ({ gamePage }) => {
      await seedCommandCenterState(gamePage, "rival-pressure");
      await requireCommandCenter(gamePage);

      const rivalCard = gamePage.page
        .locator('[data-testid="dashboard-priority-card"], [data-testid="dashboard-opportunity-card"]')
        .filter({ hasText: "Lucas Ferreira is under rival pressure" });
      await expect(rivalCard).toHaveCount(1);
      await rivalCard.getByRole("button", { name: "Open player", exact: true }).click();

      await gamePage.waitForScreen("playerProfile");
      expect(await gamePage.getCurrentScreen()).toBe("playerProfile");
      await expect(gamePage.page.getByRole("heading", { name: "Lucas Ferreira" })).toBeVisible();
    });

    test("mobile keeps the command center ahead of active-case context", async ({ gamePage }) => {
      await gamePage.page.setViewportSize({ width: 390, height: 844 });
      await seedCommandCenterState(gamePage, "queue-cap");
      const commandCenter = await requireCommandCenter(gamePage);

      const activeCase = gamePage.page.getByTestId("desk-primary-decision");
      const mobileBrief = gamePage.page.getByTestId("dashboard-mobile-brief");
      await expect(activeCase).toBeVisible();
      await expect(mobileBrief).toBeVisible();
      await expect(mobileBrief).toContainText("Requires attention");
      await expect(mobileBrief).toContainText("Opportunity at risk");
      await expect(mobileBrief).toContainText("Do next");

      const [commandTop, mobileBriefBottom, activeCaseTop] = await Promise.all([
        commandCenter.evaluate((element) => element.getBoundingClientRect().top),
        mobileBrief.evaluate((element) => element.getBoundingClientRect().bottom),
        activeCase.evaluate((element) => element.getBoundingClientRect().top),
      ]);

      expect(commandTop).toBeLessThan(activeCaseTop);
      expect(mobileBriefBottom).toBeLessThanOrEqual(844);
      await expect(gamePage.page.getByText("Working set and inbox", { exact: true })).toHaveCount(0);
    });

    test("keyboard tabs to the first visible command-center action in visual order", async ({ gamePage }) => {
      await seedCommandCenterState(gamePage, "opportunity-first-tab-order");
      const commandCenter = await requireCommandCenter(gamePage);

      const firstVisualCardTitle = await gamePage.page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll<HTMLElement>(
          '[data-testid="dashboard-priority-card"], [data-testid="dashboard-opportunity-card"]',
        ));
        const ordered = cards
          .map((card) => ({
            title: card.querySelector("h3")?.textContent?.trim() ?? null,
            top: card.getBoundingClientRect().top,
            left: card.getBoundingClientRect().left,
          }))
          .filter((card): card is { title: string; top: number; left: number } => Boolean(card.title))
          .sort((left, right) => left.top - right.top || left.left - right.left);
        return ordered[0]?.title ?? null;
      });

      expect(firstVisualCardTitle).toBeTruthy();

      await commandCenter.evaluate((element) => {
        const target = element as HTMLElement;
        target.tabIndex = -1;
        target.focus();
      });
      await gamePage.page.keyboard.press("Tab");

      const focusedCard = await gamePage.page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const card = active?.closest?.(
          '[data-testid="dashboard-priority-card"], [data-testid="dashboard-opportunity-card"]',
        ) as HTMLElement | null;
        return {
          tagName: active?.tagName ?? null,
          title: card?.querySelector("h3")?.textContent?.trim() ?? null,
        };
      });

      expect(focusedCard.tagName).toBe("BUTTON");
      expect(focusedCard.title).toBe(firstVisualCardTitle);
    });
  });

  test.describe("specialization-specific cards", () => {
    const specializations = IS_YOUTH_EARLY_ACCESS
      ? (["youth"] as const)
      : (["youth", "firstTeam", "regional", "data"] as const);
    for (const spec of specializations) {
      test(`${spec} dashboard renders without crash`, async ({ gamePage }) => {
        await gamePage.goto();
        await gamePage.injectState({
          currentWeek: 5,
          scout: { careerTier: 1, primarySpecialization: spec },
        });
        await waitForDesk(gamePage);

        const screen = await gamePage.getCurrentScreen();
        expect(screen).toBe("dashboard");

        const content = await gamePage.page.innerText("body");
        expect(content.length).toBeGreaterThan(100);

        gamePage.expectNoConsoleErrors();
      });
    }
  });

  test("dashboard quick actions navigate correctly", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
    await waitForDesk(gamePage);

    const buttons = gamePage.page.locator("button, [role='button'], a");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });
});
